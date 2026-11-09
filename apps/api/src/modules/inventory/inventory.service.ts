import type { Request } from 'express';
import type { Prisma, StockMovementType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { parseDateRange } from '../../lib/date-range';
import { pageMeta, parsePagination } from '../../lib/pagination';
import { writeAudit } from '../../lib/audit';
import { applyStockMovement } from '../../lib/stock';
import { inventoryAdjustSchema } from '@ps/shared';
import { z } from 'zod';

type AdjustInput = z.infer<typeof inventoryAdjustSchema>;

const productSelect = {
  id: true,
  name: true,
  sku: true,
  barcode: true,
  minStock: true,
  sellingPrice: true,
  purchasePrice: true,
  priceIncludesTax: true,
  trackBatches: true,
  trackExpiry: true,
  unit: { select: { id: true, name: true, code: true } },
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  taxRate: { select: { id: true, name: true, rate: true } },
} satisfies Prisma.ProductSelect;

function serializeRow(
  product: Prisma.ProductGetPayload<{ select: typeof productSelect }> & {
    inventory: { quantity: unknown; avgCost: unknown; updatedAt: Date } | null;
  },
) {
  const quantity = Number(product.inventory?.quantity ?? 0);
  const avgCost = Number(product.inventory?.avgCost ?? 0);
  const selling = Number(product.sellingPrice);
  const minStock = Number(product.minStock);
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    unit: product.unit,
    category: product.category,
    brand: product.brand,
    taxRate: product.taxRate ? { ...product.taxRate, rate: Number(product.taxRate.rate) } : null,
    sellingPrice: selling,
    purchasePrice: Number(product.purchasePrice),
    priceIncludesTax: product.priceIncludesTax,
    trackBatches: product.trackBatches,
    trackExpiry: product.trackExpiry,
    quantity,
    minStock,
    avgCost,
    costValue: Math.round(quantity * avgCost * 100) / 100,
    retailValue: Math.round(quantity * selling * 100) / 100,
    lowStock: quantity > 0 && quantity <= minStock,
    outOfStock: quantity <= 0,
    updatedAt: product.inventory?.updatedAt ?? null,
  };
}

export async function listInventory(storeId: string, query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const search = String(query.search ?? '').trim();
  const stockStatus = String(query.stockStatus ?? '');
  const categoryId = query.categoryId ? String(query.categoryId) : null;
  const sortBy = String(query.sortBy ?? 'name');
  const sortDir = String(query.sortDir ?? 'asc') === 'desc' ? 'desc' : 'asc';

  const conditions: Prisma.ProductWhereInput[] = [];
  if (search) {
    conditions.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ],
    });
  }
  if (stockStatus === 'out') {
    conditions.push({ OR: [{ inventory: { is: null } }, { inventory: { is: { quantity: { lte: 0 } } } }] });
  }
  if (stockStatus === 'in') {
    conditions.push({ inventory: { is: { quantity: { gt: 0 } } } });
  }

  const where: Prisma.ProductWhereInput = {
    storeId,
    deletedAt: null,
    status: 'ACTIVE',
    ...(categoryId ? { categoryId } : {}),
    ...(conditions.length ? { AND: conditions } : {}),
  };

  // Low stock compares two columns (quantity vs minStock) so it needs SQL.
  if (stockStatus === 'low') {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT p."id" FROM "Product" p JOIN "Inventory" i ON i."productId" = p."id"
       WHERE p."storeId" = $1::uuid AND p."deletedAt" IS NULL AND p."status" = 'ACTIVE'
         AND i."quantity" > 0 AND i."quantity" <= p."minStock"
         ${categoryId ? 'AND p."categoryId" = $2::uuid' : ''}
         ${search ? `AND (p."name" ILIKE $${categoryId ? 3 : 2} OR p."sku" ILIKE $${categoryId ? 3 : 2})` : ''}
       ORDER BY p."name" ASC`,
      ...(search
        ? categoryId
          ? [storeId, categoryId, `%${search}%`]
          : [storeId, `%${search}%`]
        : categoryId
          ? [storeId, categoryId]
          : [storeId]),
    );
    const ids = rows.map((r) => r.id).slice(skip, skip + take);
    const total = rows.length;
    const products = ids.length
      ? await prisma.product.findMany({
          where: { id: { in: ids } },
          select: { ...productSelect, inventory: { select: { quantity: true, avgCost: true, updatedAt: true } } },
        })
      : [];
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = ids.map((id) => byId.get(id)).filter(Boolean).map((p) => serializeRow(p!));
    return { items, meta: pageMeta(total, page, pageSize) };
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    sortBy === 'stock'
      ? { inventory: { quantity: sortDir } }
      : sortBy === 'price'
        ? { sellingPrice: sortDir }
        : sortBy === 'updated'
          ? { updatedAt: sortDir }
          : { name: sortDir };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: { ...productSelect, inventory: { select: { quantity: true, avgCost: true, updatedAt: true } } },
      orderBy,
      skip,
      take,
    }),
    prisma.product.count({ where }),
  ]);

  return { items: products.map(serializeRow), meta: pageMeta(total, page, pageSize) };
}

export async function productStock(storeId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, storeId, deletedAt: null },
    select: {
      ...productSelect,
      inventory: { select: { quantity: true, avgCost: true, updatedAt: true } },
    },
  });
  if (!product) throw notFound('Product');

  const [batches, movements] = await Promise.all([
    prisma.productBatch.findMany({
      where: { productId },
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.stockMovement.findMany({
      where: { storeId, productId },
      orderBy: { seq: 'desc' },
      take: 50,
      include: { user: { select: { name: true } } },
    }),
  ]);

  return {
    ...serializeRow(product),
    batches: batches.map((b) => ({
      id: b.id,
      batchNo: b.batchNo,
      mfgDate: b.mfgDate,
      expiryDate: b.expiryDate,
      quantity: Number(b.quantity),
      purchasePrice: Number(b.purchasePrice),
    })),
    movements: movements.map((m) => ({
      id: m.id,
      seq: m.seq,
      type: m.type,
      quantity: Number(m.quantity),
      balanceBefore: Number(m.balanceBefore),
      balanceAfter: Number(m.balanceAfter),
      unitCost: m.unitCost == null ? null : Number(m.unitCost),
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      note: m.note,
      userName: m.user.name,
      createdAt: m.createdAt,
    })),
  };
}

export async function listMovements(storeId: string, query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const productId = query.productId ? String(query.productId) : undefined;
  const type = query.type ? (String(query.type) as StockMovementType) : undefined;
  const search = String(query.search ?? '').trim();
  const { from, to } = parseDateRange(query);

  const where: Prisma.StockMovementWhereInput = {
    storeId,
    ...(productId ? { productId } : {}),
    ...(type ? { type } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { product: { name: { contains: search, mode: 'insensitive' } } },
            { product: { sku: { contains: search, mode: 'insensitive' } } },
            { note: { contains: search, mode: 'insensitive' } },
            { referenceId: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: { seq: 'desc' },
      skip,
      take,
      include: {
        product: { select: { id: true, name: true, sku: true, unit: { select: { code: true } } } },
        user: { select: { id: true, name: true } },
        batch: { select: { id: true, batchNo: true, expiryDate: true } },
      },
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return {
    items: rows.map((m) => ({
      id: m.id,
      seq: m.seq,
      type: m.type,
      quantity: Number(m.quantity),
      balanceBefore: Number(m.balanceBefore),
      balanceAfter: Number(m.balanceAfter),
      unitCost: m.unitCost == null ? null : Number(m.unitCost),
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      note: m.note,
      product: m.product,
      batch: m.batch,
      user: m.user,
      createdAt: m.createdAt,
    })),
    meta: pageMeta(total, page, pageSize),
  };
}

const OUT_TYPES = new Set<StockMovementType>(['ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY']);

export async function adjustStock(
  storeId: string,
  userId: string,
  input: AdjustInput,
  req: Request,
) {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, storeId, deletedAt: null },
    select: { id: true, name: true, sku: true },
  });
  if (!product) throw notFound('Product');

  if (input.batchId) {
    const batch = await prisma.productBatch.findFirst({
      where: { id: input.batchId, productId: input.productId },
    });
    if (!batch) throw badRequest('Selected batch does not belong to this product');
  }

  const signed = OUT_TYPES.has(input.type) ? -Math.abs(input.quantity) : Math.abs(input.quantity);

  const result = await prisma.$transaction(async (tx) => {
    const movement = await applyStockMovement(tx, {
      storeId,
      productId: input.productId,
      userId,
      type: input.type,
      quantity: signed,
      batchId: input.batchId ?? null,
      referenceType: 'STOCK_ADJUSTMENT',
      note: input.note,
    });
    return movement;
  });

  await writeAudit({
    storeId,
    userId,
    action: 'STOCK_ADJUSTED',
    entityType: 'StockMovement',
    entityId: result.movementId,
    after: {
      product: product.name,
      sku: product.sku,
      type: input.type,
      quantity: signed,
      note: input.note,
      balanceAfter: result.balanceAfter,
    },
    req,
  });

  return result;
}

export async function valuation(storeId: string) {
  const rows = await prisma.$queryRaw<
    { category: string | null; quantity: string; costValue: string; retailValue: string; products: bigint }[]
  >`
    SELECT COALESCE(c."name", 'Uncategorised') AS category,
           COALESCE(SUM(i."quantity"), 0)::text AS quantity,
           COALESCE(SUM(i."quantity" * i."avgCost"), 0)::text AS "costValue",
           COALESCE(SUM(i."quantity" * p."sellingPrice"), 0)::text AS "retailValue",
           COUNT(p."id")::bigint AS products
    FROM "Product" p
    LEFT JOIN "Inventory" i ON i."productId" = p."id"
    LEFT JOIN "Category" c ON c."id" = p."categoryId"
    WHERE p."storeId" = ${storeId}::uuid AND p."deletedAt" IS NULL AND p."status" = 'ACTIVE'
    GROUP BY COALESCE(c."name", 'Uncategorised')
    ORDER BY "costValue" DESC
  `;

  const byCategory = rows.map((r) => ({
    category: r.category,
    quantity: Number(r.quantity),
    costValue: Number(r.costValue),
    retailValue: Number(r.retailValue),
    products: Number(r.products),
  }));
  const totals = byCategory.reduce(
    (acc, r) => ({
      quantity: acc.quantity + r.quantity,
      costValue: acc.costValue + r.costValue,
      retailValue: acc.retailValue + r.retailValue,
      products: acc.products + r.products,
    }),
    { quantity: 0, costValue: 0, retailValue: 0, products: 0 },
  );
  return {
    totals: {
      ...totals,
      costValue: Math.round(totals.costValue * 100) / 100,
      retailValue: Math.round(totals.retailValue * 100) / 100,
      potentialMargin: Math.round((totals.retailValue - totals.costValue) * 100) / 100,
    },
    byCategory: byCategory.map((r) => ({
      ...r,
      costValue: Math.round(r.costValue * 100) / 100,
      retailValue: Math.round(r.retailValue * 100) / 100,
    })),
  };
}

export async function expiringBatches(storeId: string, days = 30) {
  const until = new Date();
  until.setDate(until.getDate() + Math.max(0, Math.min(365, days)));
  const batches = await prisma.productBatch.findMany({
    where: {
      product: { storeId, deletedAt: null },
      quantity: { gt: 0 },
      expiryDate: { not: null, lte: until },
    },
    orderBy: { expiryDate: 'asc' },
    include: {
      product: { select: { id: true, name: true, sku: true, unit: { select: { code: true } } } },
    },
  });
  const now = Date.now();
  return {
    items: batches.map((b) => ({
      id: b.id,
      batchNo: b.batchNo,
      expiryDate: b.expiryDate,
      quantity: Number(b.quantity),
      purchasePrice: Number(b.purchasePrice),
      product: b.product,
      daysRemaining: b.expiryDate
        ? Math.ceil((new Date(b.expiryDate).getTime() - now) / 86_400_000)
        : null,
      expired: b.expiryDate ? new Date(b.expiryDate).getTime() < now : false,
    })),
  };
}

// ── Locations ────────────────────────────────────────────────────────
export async function listLocations(storeId: string) {
  return prisma.location.findMany({ where: { storeId }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
}

export async function createLocation(
  storeId: string,
  userId: string,
  input: { name: string; isDefault?: boolean },
  req: Request,
) {
  const location = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.location.updateMany({ where: { storeId }, data: { isDefault: false } });
    }
    return tx.location.create({
      data: { storeId, name: input.name, isDefault: input.isDefault ?? false },
    });
  });
  await writeAudit({
    storeId,
    userId,
    action: 'LOCATION_CREATED',
    entityType: 'Location',
    entityId: location.id,
    after: input,
    req,
  });
  return location;
}

export async function updateLocation(
  storeId: string,
  userId: string,
  id: string,
  input: { name?: string; isDefault?: boolean },
  req: Request,
) {
  const existing = await prisma.location.findFirst({ where: { id, storeId } });
  if (!existing) throw notFound('Location');
  const location = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.location.updateMany({ where: { storeId, id: { not: id } }, data: { isDefault: false } });
    }
    return tx.location.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      },
    });
  });
  await writeAudit({
    storeId,
    userId,
    action: 'LOCATION_UPDATED',
    entityType: 'Location',
    entityId: id,
    before: existing,
    after: input,
    req,
  });
  return location;
}

export async function deleteLocation(storeId: string, userId: string, id: string, req: Request) {
  const location = await prisma.location.findFirst({
    where: { id, storeId },
    include: { _count: { select: { inventories: true, stockMovements: true } } },
  });
  if (!location) throw notFound('Location');
  if (location.isDefault) throw badRequest('The default location cannot be deleted');
  if (location._count.inventories > 0 || location._count.stockMovements > 0) {
    throw badRequest('This location is referenced by stock records and cannot be deleted');
  }
  await prisma.location.delete({ where: { id } });
  await writeAudit({
    storeId,
    userId,
    action: 'LOCATION_DELETED',
    entityType: 'Location',
    entityId: id,
    before: { name: location.name },
    req,
  });
  return { message: 'Location deleted' };
}

// ── Transfers ────────────────────────────────────────────────────────
export const stockTransferSchema = z.object({
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  note: z.string().trim().max(500).nullish(),
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.coerce.number().positive() }))
    .min(1, 'Add at least one product'),
});

export async function createTransfer(
  storeId: string,
  userId: string,
  input: z.infer<typeof stockTransferSchema>,
  req: Request,
) {
  if (input.fromLocationId === input.toLocationId) {
    throw badRequest('Choose two different locations');
  }
  const locations = await prisma.location.findMany({
    where: { storeId, id: { in: [input.fromLocationId, input.toLocationId] } },
  });
  if (locations.length !== 2) throw badRequest('Select valid locations');

  const products = await prisma.product.findMany({
    where: { storeId, deletedAt: null, id: { in: input.items.map((i) => i.productId) } },
    select: { id: true, name: true },
  });
  if (products.length !== new Set(input.items.map((i) => i.productId)).size) {
    throw badRequest('One or more products are invalid');
  }

  const transfer = await prisma.$transaction(async (tx) => {
    const count = await tx.stockTransfer.count({ where: { storeId } });
    const referenceNo = `TRF/${String(count + 1).padStart(5, '0')}`;
    const created = await tx.stockTransfer.create({
      data: {
        storeId,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        referenceNo,
        note: input.note ?? null,
        createdBy: userId,
      },
    });
    for (const item of input.items) {
      await tx.stockTransferItem.create({
        data: {
          stockTransferId: created.id,
          productId: item.productId,
          quantity: item.quantity,
        },
      });
      await applyStockMovement(tx, {
        storeId,
        productId: item.productId,
        userId,
        type: 'TRANSFER_OUT',
        quantity: -Math.abs(item.quantity),
        locationId: input.fromLocationId,
        referenceType: 'STOCK_TRANSFER',
        referenceId: created.id,
        note: input.note ?? `Transfer ${referenceNo}`,
      });
      await applyStockMovement(tx, {
        storeId,
        productId: item.productId,
        userId,
        type: 'TRANSFER_IN',
        quantity: Math.abs(item.quantity),
        locationId: input.toLocationId,
        referenceType: 'STOCK_TRANSFER',
        referenceId: created.id,
        note: input.note ?? `Transfer ${referenceNo}`,
      });
    }
    return created;
  });

  await writeAudit({
    storeId,
    userId,
    action: 'STOCK_TRANSFERRED',
    entityType: 'StockTransfer',
    entityId: transfer.id,
    after: { referenceNo: transfer.referenceNo, items: input.items.length },
    req,
  });
  return transfer;
}

export async function listTransfers(storeId: string, query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const [transfers, total] = await Promise.all([
    prisma.stockTransfer.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.stockTransfer.count({ where: { storeId } }),
  ]);
  const ids = transfers.map((t) => t.id);
  const items = ids.length
    ? await prisma.stockTransferItem.findMany({ where: { stockTransferId: { in: ids } } })
    : [];
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, sku: true },
      })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));
  const itemsByTransfer = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByTransfer.get(item.stockTransferId) ?? [];
    list.push(item);
    itemsByTransfer.set(item.stockTransferId, list);
  }
  return {
    items: transfers.map((t) => ({
      ...t,
      items: (itemsByTransfer.get(t.id) ?? []).map((i) => ({
        ...i,
        quantity: Number(i.quantity),
        product: productById.get(i.productId) ?? null,
      })),
    })),
    meta: pageMeta(total, page, pageSize),
  };
}

export function assertPositiveAdjustment(input: AdjustInput) {
  if (input.type === 'OPENING' && input.quantity <= 0) throw conflict('Opening quantity must be positive');
}
