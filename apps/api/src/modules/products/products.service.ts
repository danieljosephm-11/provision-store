import type { Request } from 'express';
import type { Prisma, ProductStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import bwipjs from 'bwip-js/node';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { pageMeta, parsePagination } from '../../lib/pagination';
import { writeAudit } from '../../lib/audit';
import { applyStockMovement } from '../../lib/stock';
import { productSchema } from '@ps/shared';
import { z } from 'zod';

const include = {
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true, code: true, allowsDecimal: true } },
  taxRate: { select: { id: true, name: true, rate: true, cessRate: true } },
  inventory: { select: { quantity: true, avgCost: true } },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof include }>;

function canSeeCost(permissions: string[]) {
  return permissions.includes('purchase.read') || permissions.includes('report.view');
}

export function serializeProduct(product: ProductWithRelations, permissions: string[]) {
  const stock = Number(product.inventory?.quantity ?? 0);
  const minStock = Number(product.minStock);
  const selling = Number(product.sellingPrice);
  const purchase = Number(product.purchasePrice);
  const base = {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    description: product.description,
    imageUrl: product.imageUrl,
    category: product.category,
    brand: product.brand,
    unit: product.unit,
    taxRate: product.taxRate,
    sellingPrice: selling,
    mrp: Number(product.mrp),
    priceIncludesTax: product.priceIncludesTax,
    hsnCode: product.hsnCode,
    minStock,
    trackBatches: product.trackBatches,
    trackExpiry: product.trackExpiry,
    status: product.status,
    stock,
    lowStock: stock > 0 && stock <= minStock,
    outOfStock: stock <= 0,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
  if (!canSeeCost(permissions)) return base;
  return {
    ...base,
    purchasePrice: purchase,
    stockValue: Math.round(stock * Number(product.inventory?.avgCost ?? 0) * 100) / 100,
    margin:
      selling > 0 ? Math.round(((selling - purchase) / selling) * 10000) / 100 : 0,
  };
}

export async function listProducts(
  storeId: string,
  permissions: string[],
  query: Record<string, unknown>,
) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const search = String(query.search ?? '').trim();
  const status = (query.status as ProductStatus | undefined) ?? 'ACTIVE';
  const stockStatus = String(query.stockStatus ?? '');

  if (stockStatus === 'low' || stockStatus === 'out') {
    const condition =
      stockStatus === 'out'
        ? `(i."quantity" IS NULL OR i."quantity" <= 0)`
        : `(i."quantity" > 0 AND i."quantity" <= p."minStock")`;
    const ids = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT p."id" FROM "Product" p LEFT JOIN "Inventory" i ON i."productId" = p."id"
       WHERE p."storeId" = $1::uuid AND p."deletedAt" IS NULL AND p."status" = $2::"ProductStatus"
       AND ${condition}
       ${search ? `AND (p."name" ILIKE $3 OR p."sku" ILIKE $3 OR p."barcode" ILIKE $3)` : ''}
       ORDER BY p."name" ASC LIMIT $${search ? 4 : 3} OFFSET $${search ? 5 : 4}`,
      ...(search
        ? [storeId, status, `%${search}%`, take, skip]
        : [storeId, status, take, skip]),
    );
    const totalRows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "Product" p LEFT JOIN "Inventory" i ON i."productId" = p."id"
       WHERE p."storeId" = $1::uuid AND p."deletedAt" IS NULL AND p."status" = $2::"ProductStatus"
       AND ${condition} ${search ? `AND (p."name" ILIKE $3 OR p."sku" ILIKE $3 OR p."barcode" ILIKE $3)` : ''}`,
      ...(search ? [storeId, status, `%${search}%`] : [storeId, status]),
    );
    const idsOnly = ids.map((r) => r.id);
    const products = idsOnly.length
      ? await prisma.product.findMany({ where: { id: { in: idsOnly } }, include })
      : [];
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = idsOnly.map((id) => byId.get(id)).filter(Boolean).map((p) => serializeProduct(p!, permissions));
    return { items, meta: pageMeta(Number(totalRows[0]?.count ?? 0), page, pageSize) };
  }

  const where: Prisma.ProductWhereInput = {
    storeId,
    deletedAt: null,
    status,
    ...(query.categoryId ? { categoryId: String(query.categoryId) } : {}),
    ...(query.brandId ? { brandId: String(query.brandId) } : {}),
    ...(query.taxRateId ? { taxRateId: String(query.taxRateId) } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { barcode: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include,
      orderBy: { name: 'asc' },
      skip,
      take,
    }),
    prisma.product.count({ where }),
  ]);

  return { items: items.map((p) => serializeProduct(p, permissions)), meta: pageMeta(total, page, pageSize) };
}

export async function getProduct(storeId: string, permissions: string[], id: string) {
  const product = await prisma.product.findFirst({
    where: { id, storeId, deletedAt: null },
    include: { ...include, batches: { where: { quantity: { gt: 0 } }, orderBy: { expiryDate: 'asc' } } },
  });
  if (!product) throw notFound('Product');
  return { ...serializeProduct(product, permissions), batches: product.batches };
}

export async function findForSale(storeId: string, code: string) {
  const product = await prisma.product.findFirst({
    where: {
      storeId,
      deletedAt: null,
      status: 'ACTIVE',
      OR: [{ barcode: code }, { sku: code }],
    },
    include,
  });
  if (!product) return null;
  const stock = Number(product.inventory?.quantity ?? 0);
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    sellingPrice: Number(product.sellingPrice),
    mrp: Number(product.mrp),
    priceIncludesTax: product.priceIncludesTax,
    taxRate: product.taxRate ? Number(product.taxRate.rate) : 0,
    taxRateId: product.taxRateId,
    unit: product.unit,
    stock,
    trackBatches: product.trackBatches,
    imageUrl: product.imageUrl,
    hsnCode: product.hsnCode,
  };
}

export async function createProduct(
  storeId: string,
  userId: string,
  permissions: string[],
  input: z.infer<typeof productSchema>,
  req: Request,
) {
  await assertReferences(storeId, input);
  const existing = await prisma.product.findFirst({
    where: { storeId, deletedAt: null, OR: [{ sku: input.sku }, ...(input.barcode ? [{ barcode: input.barcode }] : [])] },
  });
  if (existing) {
    throw conflict(
      existing.sku === input.sku ? 'A product with this SKU already exists' : 'This barcode is already assigned',
    );
  }

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        storeId,
        name: input.name,
        sku: input.sku,
        barcode: input.barcode ?? null,
        categoryId: input.categoryId ?? null,
        brandId: input.brandId ?? null,
        unitId: input.unitId,
        taxRateId: input.taxRateId ?? null,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        purchasePrice: input.purchasePrice,
        sellingPrice: input.sellingPrice,
        mrp: input.mrp,
        priceIncludesTax: input.priceIncludesTax,
        hsnCode: input.hsnCode ?? null,
        minStock: input.minStock,
        trackBatches: input.trackBatches,
        trackExpiry: input.trackExpiry,
        status: input.status,
      },
      include,
    });
    await tx.inventory.create({
      data: { storeId, productId: created.id, quantity: 0, avgCost: input.purchasePrice },
    });
    return created;
  });

  await writeAudit({
    storeId,
    userId,
    action: 'PRODUCT_CREATED',
    entityType: 'Product',
    entityId: product.id,
    after: { name: product.name, sku: product.sku, sellingPrice: product.sellingPrice },
    req,
  });

  return serializeProduct(product, permissions);
}

async function assertReferences(storeId: string, input: { unitId: string; categoryId?: string | null; brandId?: string | null; taxRateId?: string | null }) {
  const [unit, category, brand, taxRate] = await Promise.all([
    prisma.unit.findFirst({ where: { id: input.unitId, storeId } }),
    input.categoryId ? prisma.category.findFirst({ where: { id: input.categoryId, storeId } }) : Promise.resolve(true),
    input.brandId ? prisma.brand.findFirst({ where: { id: input.brandId, storeId } }) : Promise.resolve(true),
    input.taxRateId ? prisma.taxRate.findFirst({ where: { id: input.taxRateId, storeId } }) : Promise.resolve(true),
  ]);
  if (!unit) throw badRequest('Select a valid unit');
  if (!category) throw badRequest('Select a valid category');
  if (!brand) throw badRequest('Select a valid brand');
  if (!taxRate) throw badRequest('Select a valid GST rate');
}

export async function updateProduct(
  storeId: string,
  userId: string,
  permissions: string[],
  id: string,
  input: Partial<z.infer<typeof productSchema>>,
  req: Request,
) {
  const before = await prisma.product.findFirst({ where: { id, storeId, deletedAt: null } });
  if (!before) throw notFound('Product');
  if (input.unitId) await assertReferences(storeId, { ...input, unitId: input.unitId });

  if (input.sku && input.sku !== before.sku) {
    const dup = await prisma.product.findFirst({ where: { storeId, sku: input.sku, id: { not: id } } });
    if (dup) throw conflict('A product with this SKU already exists');
  }
  if (input.barcode && input.barcode !== before.barcode) {
    const dup = await prisma.product.findFirst({ where: { storeId, barcode: input.barcode, id: { not: id } } });
    if (dup) throw conflict('This barcode is already assigned to another product');
  }

  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...input,
      categoryId: input.categoryId === null ? null : input.categoryId ?? undefined,
      brandId: input.brandId === null ? null : input.brandId ?? undefined,
      taxRateId: input.taxRateId === null ? null : input.taxRateId ?? undefined,
      barcode: input.barcode === null ? null : input.barcode ?? undefined,
      hsnCode: input.hsnCode === null ? null : input.hsnCode ?? undefined,
      description: input.description === null ? null : input.description ?? undefined,
      imageUrl: input.imageUrl === null ? null : input.imageUrl ?? undefined,
    },
    include,
  });

  await writeAudit({
    storeId,
    userId,
    action: 'PRODUCT_UPDATED',
    entityType: 'Product',
    entityId: id,
    before: {
      name: before.name,
      sku: before.sku,
      sellingPrice: before.sellingPrice,
      purchasePrice: before.purchasePrice,
      mrp: before.mrp,
      status: before.status,
    },
    after: {
      name: updated.name,
      sku: updated.sku,
      sellingPrice: updated.sellingPrice,
      purchasePrice: updated.purchasePrice,
      mrp: updated.mrp,
      status: updated.status,
    },
    req,
  });

  return serializeProduct(updated, permissions);
}

export async function archiveProduct(
  storeId: string,
  userId: string,
  id: string,
  req: Request,
) {
  const product = await prisma.product.findFirst({ where: { id, storeId, deletedAt: null } });
  if (!product) throw notFound('Product');
  await prisma.product.update({ where: { id }, data: { status: 'ARCHIVED', deletedAt: new Date() } });
  await writeAudit({
    storeId,
    userId,
    action: 'PRODUCT_ARCHIVED',
    entityType: 'Product',
    entityId: id,
    before: { name: product.name, sku: product.sku, status: product.status },
    req,
  });
  return { message: 'Product archived' };
}

export async function restoreProduct(storeId: string, userId: string, id: string, req: Request) {
  const product = await prisma.product.findFirst({ where: { id, storeId } });
  if (!product) throw notFound('Product');
  await prisma.product.update({ where: { id }, data: { status: 'ACTIVE', deletedAt: null } });
  await writeAudit({
    storeId,
    userId,
    action: 'PRODUCT_RESTORED',
    entityType: 'Product',
    entityId: id,
    req,
  });
  return { message: 'Product restored' };
}

export async function generateBarcodePng(text: string): Promise<Buffer> {
  if (!text || text.length > 80) throw badRequest('Barcode text is invalid');
  return bwipjs.toBuffer({
    bcid: 'code128',
    text,
    scale: 3,
    height: 14,
    includetext: true,
    textxalign: 'center',
    textsize: 8,
  });
}

// ── Excel import / export ─────────────────────────────────────────────

const IMPORT_HEADERS = [
  'Name',
  'SKU',
  'Barcode',
  'Category',
  'Brand',
  'Unit Code',
  'GST Rate',
  'Purchase Price',
  'Selling Price',
  'MRP',
  'Price Includes Tax',
  'HSN Code',
  'Min Stock',
  'Opening Stock',
  'Description',
];

export async function buildImportTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Products');
  ws.addRow(IMPORT_HEADERS);
  ws.addRow([
    'Aashirvaad Atta 5kg',
    'ATTA-5KG',
    '8901234567890',
    'Groceries',
    'Aashirvaad',
    'PKT',
    5,
    240,
    265,
    275,
    'TRUE',
    '1101',
    5,
    20,
    'Whole wheat flour',
  ]);
  ws.getRow(1).font = { bold: true };
  ws.columns = IMPORT_HEADERS.map((h) => ({ width: Math.max(14, h.length + 4) }));
  ws.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
  });
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function exportProducts(storeId: string): Promise<Buffer> {
  const products = await prisma.product.findMany({
    where: { storeId, deletedAt: null },
    include,
    orderBy: { name: 'asc' },
  });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Products');
  ws.addRow([
    'Product ID', 'Name', 'SKU', 'Barcode', 'Category', 'Brand', 'Unit', 'GST Rate',
    'Purchase Price', 'Selling Price', 'MRP', 'Price Includes Tax', 'HSN Code',
    'Min Stock', 'Current Stock', 'Stock Value', 'Status',
  ]);
  ws.getRow(1).font = { bold: true };
  for (const p of products) {
    ws.addRow([
      p.id,
      p.name,
      p.sku,
      p.barcode ?? '',
      p.category?.name ?? '',
      p.brand?.name ?? '',
      p.unit.code,
      p.taxRate ? Number(p.taxRate.rate) : 0,
      Number(p.purchasePrice),
      Number(p.sellingPrice),
      Number(p.mrp),
      p.priceIncludesTax ? 'TRUE' : 'FALSE',
      p.hsnCode ?? '',
      Number(p.minStock),
      Number(p.inventory?.quantity ?? 0),
      Math.round(Number(p.inventory?.quantity ?? 0) * Number(p.inventory?.avgCost ?? 0) * 100) / 100,
      p.status,
    ]);
  }
  ws.columns = [
    { width: 38 }, { width: 28 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 16 },
    { width: 8 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 16 },
    { width: 12 }, { width: 10 }, { width: 13 }, { width: 13 }, { width: 10 },
  ];
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function cellText(row: ExcelJS.Row, index: number): string {
  const value = row.getCell(index).value;
  if (value == null) return '';
  if (typeof value === 'object' && 'text' in value) return String((value as { text: string }).text).trim();
  if (typeof value === 'object' && 'result' in value) return String((value as { result: unknown }).result ?? '').trim();
  return String(value).trim();
}
function cellNumber(row: ExcelJS.Row, index: number): number {
  const raw = cellText(row, index).replace(/[₹,\s]/g, '');
  return raw === '' ? 0 : Number(raw);
}

export async function importProducts(
  storeId: string,
  userId: string,
  buffer: Buffer,
): Promise<{ imported: number; updated: number; skipped: number; errors: { row: number; message: string }[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw badRequest('The workbook has no sheets');

  const header = ws.getRow(1);
  const headers: string[] = [];
  header.eachCell((cell, col) => {
    headers[col] = String(cell.value ?? '').trim().toLowerCase();
  });
  const col = (name: string) => headers.findIndex((h) => h === name.toLowerCase());
  const idx = {
    name: col('Name'),
    sku: col('SKU'),
    barcode: col('Barcode'),
    category: col('Category'),
    brand: col('Brand'),
    unit: col('Unit Code'),
    gst: col('GST Rate'),
    purchase: col('Purchase Price'),
    selling: col('Selling Price'),
    mrp: col('MRP'),
    inclusive: col('Price Includes Tax'),
    hsn: col('HSN Code'),
    minStock: col('Min Stock'),
    opening: col('Opening Stock'),
    description: col('Description'),
  };
  if (idx.name < 1 || idx.sku < 1 || idx.unit < 1) {
    throw badRequest('The sheet must contain at least Name, SKU and Unit Code columns');
  }

  const units = await prisma.unit.findMany({ where: { storeId } });
  const unitByCode = new Map(units.map((u) => [u.code.toUpperCase(), u]));
  const taxes = await prisma.taxRate.findMany({ where: { storeId } });
  const taxByRate = new Map(taxes.map((t) => [Number(t.rate), t]));

  const result = { imported: 0, updated: 0, skipped: 0, errors: [] as { row: number; message: string }[] };

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = cellText(row, idx.name);
    const sku = cellText(row, idx.sku);
    if (!name && !sku) continue;
    try {
      if (!name || !sku) throw new Error('Name and SKU are required');
      const unitCode = cellText(row, idx.unit).toUpperCase();
      const unit = unitByCode.get(unitCode);
      if (!unit) throw new Error(`Unknown unit code "${unitCode}"`);

      let categoryId: string | null = null;
      const categoryName = cellText(row, idx.category);
      if (categoryName) {
        const category = await prisma.category.upsert({
          where: { storeId_name: { storeId, name: categoryName } },
          create: { storeId, name: categoryName },
          update: {},
        });
        categoryId = category.id;
      }
      let brandId: string | null = null;
      const brandName = cellText(row, idx.brand);
      if (brandName) {
        const brand = await prisma.brand.upsert({
          where: { storeId_name: { storeId, name: brandName } },
          create: { storeId, name: brandName },
          update: {},
        });
        brandId = brand.id;
      }

      const gst = cellNumber(row, idx.gst);
      const tax = taxByRate.get(gst) ?? null;
      const inclusiveRaw = cellText(row, idx.inclusive).toLowerCase();
      const priceIncludesTax = inclusiveRaw === '' ? true : ['true', 'yes', '1', 'y'].includes(inclusiveRaw);

      const data = productSchema.parse({
        name,
        sku,
        barcode: cellText(row, idx.barcode) || null,
        categoryId,
        brandId,
        unitId: unit.id,
        taxRateId: tax?.id ?? null,
        description: cellText(row, idx.description) || null,
        purchasePrice: cellNumber(row, idx.purchase),
        sellingPrice: cellNumber(row, idx.selling),
        mrp: cellNumber(row, idx.mrp),
        priceIncludesTax,
        hsnCode: cellText(row, idx.hsn) || null,
        minStock: cellNumber(row, idx.minStock),
        trackBatches: false,
        trackExpiry: false,
        status: 'ACTIVE' as const,
      });

      const existing = await prisma.product.findFirst({ where: { storeId, sku } });
      if (existing) {
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            name: data.name,
            barcode: data.barcode ?? null,
            categoryId: data.categoryId ?? null,
            brandId: data.brandId ?? null,
            unitId: data.unitId,
            taxRateId: data.taxRateId ?? null,
            description: data.description ?? null,
            purchasePrice: data.purchasePrice,
            sellingPrice: data.sellingPrice,
            mrp: data.mrp,
            priceIncludesTax: data.priceIncludesTax,
            hsnCode: data.hsnCode ?? null,
            minStock: data.minStock,
            status: 'ACTIVE',
            deletedAt: null,
          },
        });
        result.updated++;
        continue;
      }

      const opening = cellNumber(row, idx.opening);
      await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            storeId,
            name: data.name,
            sku: data.sku,
            barcode: data.barcode ?? null,
            categoryId: data.categoryId ?? null,
            brandId: data.brandId ?? null,
            unitId: data.unitId,
            taxRateId: data.taxRateId ?? null,
            description: data.description ?? null,
            purchasePrice: data.purchasePrice,
            sellingPrice: data.sellingPrice,
            mrp: data.mrp,
            priceIncludesTax: data.priceIncludesTax,
            hsnCode: data.hsnCode ?? null,
            minStock: data.minStock,
            status: 'ACTIVE',
          },
        });
        await tx.inventory.create({
          data: { storeId, productId: product.id, quantity: 0, avgCost: data.purchasePrice },
        });
        if (opening > 0) {
          await applyStockMovement(tx, {
            storeId,
            productId: product.id,
            userId,
            type: 'OPENING',
            quantity: opening,
            unitCost: data.purchasePrice,
            referenceType: 'PRODUCT_IMPORT',
            referenceId: product.id,
            note: 'Opening stock from Excel import',
          });
        }
      });
      result.imported++;
    } catch (error) {
      result.errors.push({
        row: r,
        message: error instanceof Error ? error.message : 'Invalid row',
      });
    }
  }

  await writeAudit({
    storeId,
    userId,
    action: 'PRODUCTS_IMPORTED',
    entityType: 'Product',
    after: { imported: result.imported, updated: result.updated, skipped: result.skipped, errors: result.errors.length },
  });

  return result;
}
