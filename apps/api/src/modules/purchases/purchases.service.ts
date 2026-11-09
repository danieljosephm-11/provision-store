import type { Request } from 'express';
import { Prisma, type PurchaseOrderStatus } from '@prisma/client';
import {
  financialYear,
  purchaseCreateSchema,
  purchaseOrderCreateSchema,
  purchaseReturnCreateSchema,
  round2,
} from '@ps/shared';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { pageMeta, parsePagination } from '../../lib/pagination';
import { parseDateRange } from '../../lib/date-range';
import { writeAudit } from '../../lib/audit';
import { nextDocumentNumber } from '../../lib/sequence';
import { applyStockMovement } from '../../lib/stock';
import { addSupplierLedger } from '../../lib/ledger';

const n = (v: unknown) => Number(v ?? 0);
const round4 = (v: number) => Math.round(v * 10000) / 10000;

type PurchaseInput = z.infer<typeof purchaseCreateSchema>;
type PurchaseOrderInput = z.infer<typeof purchaseOrderCreateSchema>;
type PurchaseReturnInput = z.infer<typeof purchaseReturnCreateSchema>;

function computePurchaseLines(input: PurchaseInput) {
  const prepared = input.items.map((item) => {
    const gross = round2(n(item.quantity) * n(item.unitCost));
    const discount = Math.min(gross, round2(n(item.discountAmount)));
    return {
      ...item,
      gross,
      discount,
      taxableBefore: round2(gross - discount),
      rate: n(item.taxRate),
    };
  });
  const totalBefore = round2(prepared.reduce((s, l) => s + l.taxableBefore, 0));
  let billDiscount = Math.min(totalBefore, round2(n(input.discountAmount)));
  let allocated = 0;
  const lines = prepared.map((line, index) => {
    let share = 0;
    if (billDiscount > 0 && totalBefore > 0) {
      share =
        index === prepared.length - 1
          ? billDiscount - allocated
          : Math.round((billDiscount * line.taxableBefore) / totalBefore);
      share = Math.max(0, Math.min(share, line.taxableBefore));
      allocated += share;
    }
    const taxable = round2(line.taxableBefore - share);
    const taxAmount = round2((taxable * line.rate) / 100);
    return {
      ...line,
      billDiscountShare: round2(share),
      taxableAmount: taxable,
      taxAmount,
      lineTotal: round2(taxable + taxAmount),
    };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.taxableAmount, 0));
  const taxAmount = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
  return { lines, subtotal, taxAmount, total: round2(subtotal + taxAmount) };
}

export async function createPurchase(
  storeId: string,
  userId: string,
  input: PurchaseInput,
  req: Request,
) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, storeId, deletedAt: null },
  });
  if (!supplier) throw badRequest('Select a valid supplier');
  if (!supplier.isActive) throw badRequest('This supplier is inactive');

  if (input.supplierInvoiceNo) {
    const duplicate = await prisma.purchase.findFirst({
      where: { storeId, supplierId: input.supplierId, supplierInvoiceNo: input.supplierInvoiceNo },
    });
    if (duplicate) throw conflict('This supplier invoice has already been recorded');
  }

  if (input.purchaseOrderId) {
    const order = await prisma.purchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, storeId },
    });
    if (!order) throw badRequest('Select a valid purchase order');
    if (order.status === 'CANCELLED') throw conflict('This purchase order was cancelled');
  }

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, storeId, deletedAt: null },
    select: { id: true, name: true, sku: true },
  });
  if (products.length !== productIds.length) throw badRequest('One or more products are unavailable');

  const totals = computePurchaseLines(input);
  if (round2(n(input.paidAmount)) > totals.total) {
    throw badRequest('Paid amount cannot exceed the purchase total');
  }

  const purchase = await prisma.$transaction(async (tx) => {
    const store = await tx.store.findUnique({ where: { id: storeId } });
    if (!store) throw notFound('Store');
    const fy = financialYear(new Date(), store.financialYearStartMonth);
    const purchaseNumber = await nextDocumentNumber(tx, {
      storeId,
      docType: 'PURCHASE',
      financialYear: fy,
      prefix: 'PUR',
    });

    const paidAmount = round2(n(input.paidAmount));
    const created = await tx.purchase.create({
      data: {
        storeId,
        purchaseNumber,
        supplierInvoiceNo: input.supplierInvoiceNo ?? null,
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId ?? null,
        status: 'RECEIVED',
        invoiceDate: new Date(input.invoiceDate),
        receivedDate: new Date(),
        subtotal: totals.subtotal,
        discountAmount: round2(n(input.discountAmount)),
        taxAmount: totals.taxAmount,
        total: totals.total,
        paidAmount,
        balanceAmount: round2(totals.total - paidAmount),
        notes: input.notes ?? null,
        createdBy: userId,
      },
    });

    for (const line of totals.lines) {
      const stockQty = round2(n(line.quantity) + n(line.freeQuantity));
      const effectiveCost = stockQty > 0 ? round4(n(line.lineTotal) / stockQty) : n(line.unitCost);
      const purchaseItem = await tx.purchaseItem.create({
        data: {
          purchaseId: created.id,
          productId: line.productId,
          quantity: line.quantity,
          freeQuantity: line.freeQuantity,
          unitCost: line.unitCost,
          discountAmount: line.discount,
          taxRate: line.rate,
          taxableAmount: line.taxableAmount,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
          expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
        },
      });
      if (stockQty > 0) {
        await applyStockMovement(tx, {
          storeId,
          productId: line.productId,
          userId,
          type: 'PURCHASE',
          quantity: stockQty,
          unitCost: effectiveCost,
          batchNo: line.batchNo ?? null,
          expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
          referenceType: 'PURCHASE',
          referenceId: created.id,
          note: `Received on ${purchaseNumber}`,
          allowNegative: true,
        });
        if (line.batchNo) {
          const batch = await tx.productBatch.findUnique({
            where: { productId_batchNo: { productId: line.productId, batchNo: line.batchNo } },
          });
          if (batch) {
            await tx.purchaseItem.update({
              where: { id: purchaseItem.id },
              data: { batchId: batch.id },
            });
          }
        }
      }
    }

    await addSupplierLedger(tx, {
      storeId,
      supplierId: input.supplierId,
      type: 'PURCHASE',
      credit: totals.total,
      description: `Purchase ${purchaseNumber}`,
      referenceType: 'PURCHASE',
      referenceId: created.id,
      createdBy: userId,
      entryDate: new Date(input.invoiceDate),
    });

    if (paidAmount > 0) {
      const payment = await tx.supplierPayment.create({
        data: {
          storeId,
          supplierId: input.supplierId,
          purchaseId: created.id,
          amount: paidAmount,
          method: 'CASH',
          paidAt: new Date(),
          note: `Paid on purchase ${purchaseNumber}`,
          createdBy: userId,
        },
      });
      await tx.payment.create({
        data: {
          storeId,
          direction: 'OUT',
          partyType: 'SUPPLIER',
          partyId: input.supplierId,
          method: 'CASH',
          amount: paidAmount,
          reference: `Purchase ${purchaseNumber}`,
          receivedAt: new Date(),
          createdBy: userId,
        },
      });
      await addSupplierLedger(tx, {
        storeId,
        supplierId: input.supplierId,
        type: 'SUPPLIER_PAYMENT',
        debit: paidAmount,
        description: `Payment on purchase ${purchaseNumber}`,
        referenceType: 'SUPPLIER_PAYMENT',
        referenceId: payment.id,
        createdBy: userId,
      });
    }

    if (input.purchaseOrderId) {
      const order = await tx.purchaseOrder.findUnique({
        where: { id: input.purchaseOrderId },
        include: { items: true },
      });
      if (order) {
        for (const line of totals.lines) {
          const orderItem = order.items.find((i) => i.productId === line.productId);
          if (orderItem) {
            const received = Math.min(
              n(orderItem.quantity),
              round2(n(orderItem.receivedQuantity) + n(line.quantity) + n(line.freeQuantity)),
            );
            await tx.purchaseOrderItem.update({
              where: { id: orderItem.id },
              data: { receivedQuantity: received },
            });
          }
        }
        const refreshed = await tx.purchaseOrderItem.findMany({
          where: { purchaseOrderId: order.id },
        });
        const complete = refreshed.every(
          (i) => n(i.receivedQuantity) >= n(i.quantity) - 0.0005,
        );
        const any = refreshed.some((i) => n(i.receivedQuantity) > 0);
        await tx.purchaseOrder.update({
          where: { id: order.id },
          data: { status: complete ? 'RECEIVED' : any ? 'PARTIAL' : order.status },
        });
      }
    }

    const full = await tx.purchase.findUnique({
      where: { id: created.id },
      include: {
        supplier: { select: { id: true, name: true, mobile: true, gstin: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        user: { select: { id: true, name: true } },
      },
    });
    return full!;
  });

  await writeAudit({
    storeId,
    userId,
    action: 'PURCHASE_CREATED',
    entityType: 'Purchase',
    entityId: purchase.id,
    after: {
      purchaseNumber: purchase.purchaseNumber,
      total: n(purchase.total),
      paidAmount: n(purchase.paidAmount),
      items: purchase.items.length,
    },
    req,
  });

  return serializePurchase(purchase);
}

type PurchaseFull = Prisma.PurchaseGetPayload<{
  include: {
    supplier: { select: { id: true; name: true; mobile: true; gstin: true } };
    items: { include: { product: { select: { id: true; name: true; sku: true } } } };
    user: { select: { id: true; name: true } };
  };
}>;

function serializePurchase(purchase: PurchaseFull) {
  return {
    id: purchase.id,
    purchaseNumber: purchase.purchaseNumber,
    supplierInvoiceNo: purchase.supplierInvoiceNo,
    supplierId: purchase.supplierId,
    supplier: purchase.supplier,
    purchaseOrderId: purchase.purchaseOrderId,
    status: purchase.status,
    invoiceDate: purchase.invoiceDate,
    receivedDate: purchase.receivedDate,
    subtotal: n(purchase.subtotal),
    discountAmount: n(purchase.discountAmount),
    taxAmount: n(purchase.taxAmount),
    total: n(purchase.total),
    paidAmount: n(purchase.paidAmount),
    balanceAmount: n(purchase.balanceAmount),
    notes: purchase.notes,
    createdByUser: purchase.user,
    createdAt: purchase.createdAt,
    items: purchase.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      product: item.product,
      batchId: item.batchId,
      quantity: n(item.quantity),
      freeQuantity: n(item.freeQuantity),
      unitCost: n(item.unitCost),
      discountAmount: n(item.discountAmount),
      taxRate: n(item.taxRate),
      taxableAmount: n(item.taxableAmount),
      taxAmount: n(item.taxAmount),
      lineTotal: n(item.lineTotal),
      expiryDate: item.expiryDate,
    })),
  };
}

export async function listPurchases(storeId: string, query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const search = String(query.search ?? '').trim();
  const supplierId = query.supplierId ? String(query.supplierId) : undefined;
  const status = query.status ? String(query.status) : undefined;
  const { from, to } = parseDateRange(query);

  const conditions: Prisma.PurchaseWhereInput[] = [];
  if (search) {
    conditions.push({
      OR: [
        { purchaseNumber: { contains: search, mode: 'insensitive' } },
        { supplierInvoiceNo: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
      ],
    });
  }
  const where: Prisma.PurchaseWhereInput = {
    storeId,
    ...(supplierId ? { supplierId } : {}),
    ...(status ? { status: status as never } : {}),
    ...(from || to
      ? { invoiceDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
    ...(conditions.length ? { AND: conditions } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        supplier: { select: { id: true, name: true, mobile: true } },
        _count: { select: { items: true, returns: true } },
      },
    }),
    prisma.purchase.count({ where }),
  ]);

  return {
    items: rows.map((p) => ({
      id: p.id,
      purchaseNumber: p.purchaseNumber,
      supplierInvoiceNo: p.supplierInvoiceNo,
      supplierId: p.supplierId,
      supplier: p.supplier,
      status: p.status,
      invoiceDate: p.invoiceDate,
      subtotal: n(p.subtotal),
      taxAmount: n(p.taxAmount),
      total: n(p.total),
      paidAmount: n(p.paidAmount),
      balanceAmount: n(p.balanceAmount),
      itemCount: p._count.items,
      returnCount: p._count.returns,
      createdAt: p.createdAt,
    })),
    meta: pageMeta(total, page, pageSize),
  };
}

export async function getPurchase(storeId: string, id: string) {
  const purchase = await prisma.purchase.findFirst({
    where: { id, storeId },
    include: {
      supplier: { select: { id: true, name: true, mobile: true, gstin: true } },
      items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      user: { select: { id: true, name: true } },
      returns: {
        select: { id: true, returnNumber: true, total: true, returnDate: true, status: true },
      },
      order: { select: { id: true, poNumber: true } },
    },
  });
  if (!purchase) throw notFound('Purchase');
  return {
    ...serializePurchase(purchase),
    returns: purchase.returns.map((r) => ({ ...r, total: n(r.total) })),
    purchaseOrder: purchase.order,
  };
}

export async function cancelPurchase(
  storeId: string,
  userId: string,
  id: string,
  reason: string,
  req: Request,
) {
  const purchase = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Purchase" WHERE "id" = ${id}::uuid AND "storeId" = ${storeId}::uuid FOR UPDATE`;
    const current = await tx.purchase.findUnique({
      where: { id },
      include: { items: true, returns: true },
    });
    if (!current) throw notFound('Purchase');
    if (current.status === 'CANCELLED') throw conflict('This purchase is already cancelled');
    if (current.returns.length > 0) {
      throw conflict('This purchase has returns and cannot be cancelled');
    }

    for (const item of current.items) {
      const qty = round2(n(item.quantity) + n(item.freeQuantity));
      if (qty <= 0) continue;
      await applyStockMovement(tx, {
        storeId,
        productId: item.productId,
        userId,
        type: 'PURCHASE_RETURN',
        quantity: -qty,
        unitCost: n(item.unitCost),
        batchId: item.batchId,
        referenceType: 'PURCHASE_CANCEL',
        referenceId: current.id,
        note: `Purchase cancelled: ${reason}`,
      });
    }

    await addSupplierLedger(tx, {
      storeId,
      supplierId: current.supplierId,
      type: 'PURCHASE_RETURN',
      debit: n(current.total),
      description: `Purchase cancelled ${current.purchaseNumber}`,
      referenceType: 'PURCHASE',
      referenceId: current.id,
      createdBy: userId,
    });

    return tx.purchase.update({
      where: { id },
      data: { status: 'CANCELLED', balanceAmount: 0, notes: current.notes },
    });
  });

  await writeAudit({
    storeId,
    userId,
    action: 'PURCHASE_CANCELLED',
    entityType: 'Purchase',
    entityId: id,
    before: { status: 'RECEIVED' },
    after: { status: 'CANCELLED', reason },
    req,
  });
  return { message: 'Purchase cancelled', id: purchase.id };
}

// ── Purchase orders ──────────────────────────────────────────────────
export async function createPurchaseOrder(
  storeId: string,
  userId: string,
  input: PurchaseOrderInput,
  req: Request,
) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, storeId, deletedAt: null },
  });
  if (!supplier) throw badRequest('Select a valid supplier');
  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, storeId, deletedAt: null },
    select: { id: true },
  });
  if (products.length !== productIds.length) throw badRequest('One or more products are unavailable');

  const lines = input.items.map((item) => {
    const taxable = round2(n(item.quantity) * n(item.unitCost));
    const tax = round2((taxable * n(item.taxRate)) / 100);
    return { ...item, taxable, tax, lineTotal: round2(taxable + tax) };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.taxable, 0));
  const taxAmount = round2(lines.reduce((s, l) => s + l.tax, 0));

  const order = await prisma.$transaction(async (tx) => {
    const store = await tx.store.findUnique({ where: { id: storeId } });
    if (!store) throw notFound('Store');
    const fy = financialYear(new Date(), store.financialYearStartMonth);
    const poNumber = await nextDocumentNumber(tx, {
      storeId,
      docType: 'PURCHASE_ORDER',
      financialYear: fy,
      prefix: 'PO',
    });
    const created = await tx.purchaseOrder.create({
      data: {
        storeId,
        poNumber,
        supplierId: input.supplierId,
        status: 'ORDERED',
        orderDate: new Date(input.orderDate),
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        notes: input.notes ?? null,
        subtotal,
        taxAmount,
        total: round2(subtotal + taxAmount),
        createdBy: userId,
      },
    });
    for (const line of lines) {
      await tx.purchaseOrderItem.create({
        data: {
          purchaseOrderId: created.id,
          productId: line.productId,
          quantity: line.quantity,
          unitCost: line.unitCost,
          taxRate: line.taxRate,
          lineTotal: line.lineTotal,
        },
      });
    }
    const full = await tx.purchaseOrder.findUnique({
      where: { id: created.id },
      include: {
        supplier: { select: { id: true, name: true, mobile: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    });
    return full!;
  });

  await writeAudit({
    storeId,
    userId,
    action: 'PURCHASE_ORDER_CREATED',
    entityType: 'PurchaseOrder',
    entityId: order.id,
    after: { poNumber: order.poNumber, total: n(order.total) },
    req,
  });
  return order;
}

export async function listPurchaseOrders(storeId: string, query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const search = String(query.search ?? '').trim();
  const status = query.status ? (String(query.status) as PurchaseOrderStatus) : undefined;
  const conditions: Prisma.PurchaseOrderWhereInput[] = [];
  if (search) {
    conditions.push({
      OR: [
        { poNumber: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
      ],
    });
  }
  const where: Prisma.PurchaseOrderWhereInput = {
    storeId,
    ...(status ? { status } : {}),
    ...(conditions.length ? { AND: conditions } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        supplier: { select: { id: true, name: true, mobile: true } },
        _count: { select: { items: true, purchases: true } },
      },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  return {
    items: rows.map((o) => ({
      id: o.id,
      poNumber: o.poNumber,
      supplierId: o.supplierId,
      supplier: o.supplier,
      status: o.status,
      orderDate: o.orderDate,
      expectedDate: o.expectedDate,
      subtotal: n(o.subtotal),
      taxAmount: n(o.taxAmount),
      total: n(o.total),
      itemCount: o._count.items,
      purchaseCount: o._count.purchases,
      createdAt: o.createdAt,
    })),
    meta: pageMeta(total, page, pageSize),
  };
}

export async function getPurchaseOrder(storeId: string, id: string) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id, storeId },
    include: {
      supplier: { select: { id: true, name: true, mobile: true, gstin: true } },
      items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      purchases: { select: { id: true, purchaseNumber: true, total: true, createdAt: true } },
      user: { select: { id: true, name: true } },
    },
  });
  if (!order) throw notFound('Purchase order');
  return {
    ...order,
    subtotal: n(order.subtotal),
    taxAmount: n(order.taxAmount),
    total: n(order.total),
    items: order.items.map((item) => ({
      ...item,
      quantity: n(item.quantity),
      receivedQuantity: n(item.receivedQuantity),
      unitCost: n(item.unitCost),
      taxRate: n(item.taxRate),
      lineTotal: n(item.lineTotal),
    })),
    purchases: order.purchases.map((p) => ({ ...p, total: n(p.total) })),
  };
}

export async function cancelPurchaseOrder(
  storeId: string,
  userId: string,
  id: string,
  reason: string,
  req: Request,
) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id, storeId },
    include: { purchases: true },
  });
  if (!order) throw notFound('Purchase order');
  if (order.status === 'CANCELLED') throw conflict('This order is already cancelled');
  if (order.purchases.length > 0) throw conflict('This order has received purchases and cannot be cancelled');
  await prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
  await writeAudit({
    storeId,
    userId,
    action: 'PURCHASE_ORDER_CANCELLED',
    entityType: 'PurchaseOrder',
    entityId: id,
    before: { status: order.status },
    after: { status: 'CANCELLED', reason },
    req,
  });
  return { message: 'Purchase order cancelled' };
}

// ── Purchase returns ─────────────────────────────────────────────────
export async function createPurchaseReturn(
  storeId: string,
  userId: string,
  input: PurchaseReturnInput,
  req: Request,
) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Purchase" WHERE "id" = ${input.purchaseId}::uuid AND "storeId" = ${storeId}::uuid FOR UPDATE`;
    const purchase = await tx.purchase.findFirst({
      where: { id: input.purchaseId, storeId },
      include: { items: true },
    });
    if (!purchase) throw notFound('Purchase');
    if (purchase.status === 'CANCELLED') throw conflict('Cannot return against a cancelled purchase');

    const itemById = new Map(purchase.items.map((i) => [i.id, i]));
    const prior = await tx.purchaseReturnItem.groupBy({
      by: ['purchaseItemId'],
      where: { purchaseItemId: { in: input.items.map((i) => i.purchaseItemId) } },
      _sum: { quantity: true },
    });
    const priorByItem = new Map(prior.map((p) => [p.purchaseItemId!, n(p._sum.quantity)]));
    const seen = new Set<string>();
    let subtotal = 0;
    let taxAmount = 0;
    let total = 0;

    const prepared = input.items.map((line) => {
      if (seen.has(line.purchaseItemId)) throw badRequest('Duplicate item in the return');
      seen.add(line.purchaseItemId);
      const item = itemById.get(line.purchaseItemId);
      if (!item) throw badRequest('An item does not belong to this purchase');
      const already = priorByItem.get(item.id) ?? 0;
      const remaining = round2(n(item.quantity) - already);
      if (line.quantity > remaining + 0.0005) {
        throw badRequest(`Cannot return more than ${remaining} of this item`);
      }
      const ratio = n(item.quantity) > 0 ? line.quantity / n(item.quantity) : 0;
      const lineTotal = round2(n(item.lineTotal) * ratio);
      const tax = round2(n(item.taxAmount) * ratio);
      subtotal = round2(subtotal + (lineTotal - tax));
      taxAmount = round2(taxAmount + tax);
      total = round2(total + lineTotal);
      void ratio;
      return { item, quantity: line.quantity, lineTotal, tax };
    });

    const store = await tx.store.findUnique({ where: { id: storeId } });
    if (!store) throw notFound('Store');
    const fy = financialYear(new Date(), store.financialYearStartMonth);
    const returnNumber = await nextDocumentNumber(tx, {
      storeId,
      docType: 'PURCHASE_RETURN',
      financialYear: fy,
      prefix: 'PR',
    });

    const created = await tx.purchaseReturn.create({
      data: {
        storeId,
        returnNumber,
        purchaseId: purchase.id,
        supplierId: purchase.supplierId,
        returnDate: new Date(),
        reason: input.reason ?? null,
        subtotal,
        taxAmount,
        total,
        status: 'COMPLETED',
        createdBy: userId,
      },
    });

    for (const entry of prepared) {
      await tx.purchaseReturnItem.create({
        data: {
          purchaseReturnId: created.id,
          purchaseItemId: entry.item.id,
          productId: entry.item.productId,
          quantity: entry.quantity,
          unitCost: entry.item.unitCost,
          taxRate: entry.item.taxRate,
          taxAmount: entry.tax,
          lineTotal: entry.lineTotal,
        },
      });
      await applyStockMovement(tx, {
        storeId,
        productId: entry.item.productId,
        userId,
        type: 'PURCHASE_RETURN',
        quantity: -Math.abs(entry.quantity),
        unitCost: n(entry.item.unitCost),
        batchId: entry.item.batchId,
        referenceType: 'PURCHASE_RETURN',
        referenceId: created.id,
        note: `Purchase return ${returnNumber}`,
      });
    }

    await addSupplierLedger(tx, {
      storeId,
      supplierId: purchase.supplierId,
      type: 'PURCHASE_RETURN',
      debit: total,
      description: `Purchase return ${returnNumber}`,
      referenceType: 'PURCHASE_RETURN',
      referenceId: created.id,
      createdBy: userId,
    });

    const full = await tx.purchaseReturn.findUnique({
      where: { id: created.id },
      include: {
        supplier: { select: { id: true, name: true, mobile: true } },
        purchase: { select: { id: true, purchaseNumber: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        user: { select: { id: true, name: true } },
      },
    });
    return full!;
  });

  await writeAudit({
    storeId,
    userId,
    action: 'PURCHASE_RETURN_CREATED',
    entityType: 'PurchaseReturn',
    entityId: result.id,
    after: { returnNumber: result.returnNumber, total: n(result.total) },
    req,
  });

  return serializePurchaseReturn(result);
}

type PurchaseReturnFull = Prisma.PurchaseReturnGetPayload<{
  include: {
    supplier: { select: { id: true; name: true; mobile: true } };
    purchase: { select: { id: true; purchaseNumber: true } };
    items: { include: { product: { select: { id: true; name: true; sku: true } } } };
    user: { select: { id: true; name: true } };
  };
}>;

function serializePurchaseReturn(ret: PurchaseReturnFull) {
  return {
    id: ret.id,
    returnNumber: ret.returnNumber,
    purchaseId: ret.purchaseId,
    purchaseNumber: ret.purchase.purchaseNumber,
    supplierId: ret.supplierId,
    supplier: ret.supplier,
    returnDate: ret.returnDate,
    reason: ret.reason,
    subtotal: n(ret.subtotal),
    taxAmount: n(ret.taxAmount),
    total: n(ret.total),
    status: ret.status,
    createdByUser: ret.user,
    createdAt: ret.createdAt,
    items: ret.items.map((item) => ({
      id: item.id,
      purchaseItemId: item.purchaseItemId,
      productId: item.productId,
      product: item.product,
      quantity: n(item.quantity),
      unitCost: n(item.unitCost),
      taxRate: n(item.taxRate),
      taxAmount: n(item.taxAmount),
      lineTotal: n(item.lineTotal),
    })),
  };
}

export async function listPurchaseReturns(storeId: string, query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const search = String(query.search ?? '').trim();
  const conditions: Prisma.PurchaseReturnWhereInput[] = [];
  if (search) {
    conditions.push({
      OR: [
        { returnNumber: { contains: search, mode: 'insensitive' } },
        { purchase: { purchaseNumber: { contains: search, mode: 'insensitive' } } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
      ],
    });
  }
  const where: Prisma.PurchaseReturnWhereInput = {
    storeId,
    ...(conditions.length ? { AND: conditions } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.purchaseReturn.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        supplier: { select: { id: true, name: true, mobile: true } },
        purchase: { select: { id: true, purchaseNumber: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.purchaseReturn.count({ where }),
  ]);
  return { items: rows.map(serializePurchaseReturn), meta: pageMeta(total, page, pageSize) };
}
