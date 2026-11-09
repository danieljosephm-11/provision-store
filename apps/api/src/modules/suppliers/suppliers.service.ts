import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { round2 } from '@ps/shared';
import type { supplierSchema, supplierPaymentSchema } from '@ps/shared';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { pageMeta, parsePagination } from '../../lib/pagination';
import { writeAudit } from '../../lib/audit';
import { addSupplierLedger } from '../../lib/ledger';

const n = (v: unknown) => Number(v ?? 0);
type SupplierInput = z.infer<typeof supplierSchema>;
type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;

const listInclude = {
  ledger: { orderBy: { seq: 'desc' }, take: 1, select: { balanceAfter: true } },
  _count: { select: { purchases: true } },
} satisfies Prisma.SupplierInclude;

function serialize(supplier: Prisma.SupplierGetPayload<{ include: typeof listInclude }>) {
  return {
    id: supplier.id,
    name: supplier.name,
    contactPerson: supplier.contactPerson,
    mobile: supplier.mobile,
    email: supplier.email,
    gstin: supplier.gstin,
    address: supplier.address,
    city: supplier.city,
    stateCode: supplier.stateCode,
    pincode: supplier.pincode,
    openingBalance: n(supplier.openingBalance),
    creditDays: supplier.creditDays,
    outstanding: n(supplier.ledger[0]?.balanceAfter ?? 0),
    isActive: supplier.isActive,
    purchaseCount: supplier._count.purchases,
    createdAt: supplier.createdAt,
  };
}

export async function listSuppliers(storeId: string, query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const search = String(query.search ?? '').trim();
  const includeInactive = query.includeInactive === 'true';
  const where: Prisma.SupplierWhereInput = {
    storeId,
    ...(includeInactive ? {} : { isActive: true, deletedAt: null }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { mobile: { contains: search } },
            { email: { contains: search, mode: 'insensitive' } },
            { gstin: { contains: search, mode: 'insensitive' } },
            { contactPerson: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.supplier.findMany({ where, include: listInclude, orderBy: { name: 'asc' }, skip, take }),
    prisma.supplier.count({ where }),
  ]);
  return { items: rows.map(serialize), meta: pageMeta(total, page, pageSize) };
}

export async function getSupplier(storeId: string, id: string) {
  const supplier = await prisma.supplier.findFirst({
    where: { id, storeId, deletedAt: null },
    include: {
      ledger: { orderBy: { seq: 'desc' }, take: 30 },
      purchases: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          purchaseNumber: true,
          invoiceDate: true,
          total: true,
          paidAmount: true,
          balanceAmount: true,
          status: true,
        },
      },
      payments: { orderBy: { paidAt: 'desc' }, take: 20 },
    },
  });
  if (!supplier) throw notFound('Supplier');
  return {
    id: supplier.id,
    name: supplier.name,
    contactPerson: supplier.contactPerson,
    mobile: supplier.mobile,
    email: supplier.email,
    gstin: supplier.gstin,
    address: supplier.address,
    city: supplier.city,
    stateCode: supplier.stateCode,
    pincode: supplier.pincode,
    openingBalance: n(supplier.openingBalance),
    creditDays: supplier.creditDays,
    isActive: supplier.isActive,
    createdAt: supplier.createdAt,
    outstanding: n(supplier.ledger[0]?.balanceAfter ?? 0),
    ledger: supplier.ledger.map((entry) => ({
      id: entry.id,
      seq: entry.seq,
      entryDate: entry.entryDate,
      type: entry.type,
      description: entry.description,
      debit: n(entry.debit),
      credit: n(entry.credit),
      balanceAfter: n(entry.balanceAfter),
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
    })),
    purchases: supplier.purchases.map((p) => ({
      ...p,
      total: n(p.total),
      paidAmount: n(p.paidAmount),
      balanceAmount: n(p.balanceAmount),
    })),
    payments: supplier.payments.map((p) => ({ ...p, amount: n(p.amount) })),
  };
}

export async function createSupplier(
  storeId: string,
  userId: string,
  input: SupplierInput,
  req: Request,
) {
  const duplicate = await prisma.supplier.findFirst({ where: { storeId, mobile: input.mobile } });
  if (duplicate) throw conflict('A supplier with this mobile number already exists');

  const supplier = await prisma.$transaction(async (tx) => {
    const created = await tx.supplier.create({
      data: {
        storeId,
        name: input.name,
        contactPerson: input.contactPerson ?? null,
        mobile: input.mobile,
        email: input.email ?? null,
        gstin: input.gstin ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        stateCode: input.stateCode ?? null,
        pincode: input.pincode ?? null,
        openingBalance: input.openingBalance,
        creditDays: input.creditDays,
        isActive: input.isActive,
      },
      include: listInclude,
    });
    if (round2(n(input.openingBalance)) > 0) {
      await addSupplierLedger(tx, {
        storeId,
        supplierId: created.id,
        type: 'OPENING',
        credit: n(input.openingBalance),
        description: 'Opening balance',
        createdBy: userId,
      });
    }
    return created;
  });

  await writeAudit({
    storeId,
    userId,
    action: 'SUPPLIER_CREATED',
    entityType: 'Supplier',
    entityId: supplier.id,
    after: { name: supplier.name, mobile: supplier.mobile },
    req,
  });
  return serialize(supplier);
}

export async function updateSupplier(
  storeId: string,
  userId: string,
  id: string,
  input: Partial<SupplierInput>,
  req: Request,
) {
  const before = await prisma.supplier.findFirst({ where: { id, storeId, deletedAt: null } });
  if (!before) throw notFound('Supplier');
  if (input.mobile && input.mobile !== before.mobile) {
    const duplicate = await prisma.supplier.findFirst({
      where: { storeId, mobile: input.mobile, id: { not: id } },
    });
    if (duplicate) throw conflict('A supplier with this mobile number already exists');
  }
  const updated = await prisma.supplier.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.contactPerson !== undefined ? { contactPerson: input.contactPerson ?? null } : {}),
      ...(input.mobile !== undefined ? { mobile: input.mobile } : {}),
      ...(input.email !== undefined ? { email: input.email ?? null } : {}),
      ...(input.gstin !== undefined ? { gstin: input.gstin ?? null } : {}),
      ...(input.address !== undefined ? { address: input.address ?? null } : {}),
      ...(input.city !== undefined ? { city: input.city ?? null } : {}),
      ...(input.stateCode !== undefined ? { stateCode: input.stateCode ?? null } : {}),
      ...(input.pincode !== undefined ? { pincode: input.pincode ?? null } : {}),
      ...(input.creditDays !== undefined ? { creditDays: input.creditDays } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: listInclude,
  });
  await writeAudit({
    storeId,
    userId,
    action: 'SUPPLIER_UPDATED',
    entityType: 'Supplier',
    entityId: id,
    before: { name: before.name, mobile: before.mobile, isActive: before.isActive },
    after: { name: updated.name, mobile: updated.mobile, isActive: updated.isActive },
    req,
  });
  return serialize(updated);
}

export async function deactivateSupplier(storeId: string, userId: string, id: string, req: Request) {
  const supplier = await prisma.supplier.findFirst({
    where: { id, storeId, deletedAt: null },
    include: { ledger: { orderBy: { seq: 'desc' }, take: 1 } },
  });
  if (!supplier) throw notFound('Supplier');
  const outstanding = n(supplier.ledger[0]?.balanceAfter ?? 0);
  if (outstanding > 0) {
    throw conflict(`Settle the outstanding balance of ${outstanding.toFixed(2)} before deactivating`);
  }
  await prisma.supplier.update({ where: { id }, data: { isActive: false } });
  await writeAudit({
    storeId,
    userId,
    action: 'SUPPLIER_DEACTIVATED',
    entityType: 'Supplier',
    entityId: id,
    before: { name: supplier.name },
    req,
  });
  return { message: 'Supplier deactivated' };
}

export async function recordSupplierPayment(
  storeId: string,
  userId: string,
  supplierId: string,
  input: SupplierPaymentInput,
  req: Request,
) {
  const payment = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Supplier" WHERE "id" = ${supplierId}::uuid AND "storeId" = ${storeId}::uuid FOR UPDATE`;
    const supplier = await tx.supplier.findFirst({ where: { id: supplierId, storeId, deletedAt: null } });
    if (!supplier) throw notFound('Supplier');
    if (!supplier.isActive) throw badRequest('This supplier is inactive');
    if (input.purchaseId) {
      const purchase = await tx.purchase.findFirst({
        where: { id: input.purchaseId, storeId, supplierId },
      });
      if (!purchase) throw badRequest('Selected purchase does not belong to this supplier');
    }

    const amount = round2(input.amount);
    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
    const record = await tx.supplierPayment.create({
      data: {
        storeId,
        supplierId,
        purchaseId: input.purchaseId ?? null,
        amount,
        method: input.method,
        reference: input.reference ?? null,
        paidAt,
        note: input.note ?? null,
        createdBy: userId,
      },
    });
    await tx.payment.create({
      data: {
        storeId,
        direction: 'OUT',
        partyType: 'SUPPLIER',
        partyId: supplierId,
        method: input.method,
        amount,
        reference: input.reference ?? null,
        notes: input.note ?? null,
        receivedAt: paidAt,
        createdBy: userId,
      },
    });
    await addSupplierLedger(tx, {
      storeId,
      supplierId,
      type: 'SUPPLIER_PAYMENT',
      debit: amount,
      description: input.note ?? 'Supplier payment',
      referenceType: 'SUPPLIER_PAYMENT',
      referenceId: record.id,
      createdBy: userId,
      entryDate: paidAt,
    });

    if (input.purchaseId) {
      const purchase = await tx.purchase.findUnique({ where: { id: input.purchaseId } });
      if (purchase) {
        const paidAmount = round2(n(purchase.paidAmount) + amount);
        await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            paidAmount,
            balanceAmount: Math.max(0, round2(n(purchase.total) - paidAmount)),
          },
        });
      }
    }
    return record;
  });

  await writeAudit({
    storeId,
    userId,
    action: 'SUPPLIER_PAYMENT_RECORDED',
    entityType: 'SupplierPayment',
    entityId: payment.id,
    after: { supplierId, amount: n(payment.amount), method: payment.method },
    req,
  });
  return { ...payment, amount: n(payment.amount) };
}

export async function supplierLedger(
  storeId: string,
  supplierId: string,
  query: Record<string, unknown>,
) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, storeId } });
  if (!supplier) throw notFound('Supplier');
  const [rows, total] = await Promise.all([
    prisma.supplierLedger.findMany({
      where: { supplierId },
      orderBy: { seq: 'desc' },
      skip,
      take,
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.supplierLedger.count({ where: { supplierId } }),
  ]);
  return {
    items: rows.map((entry) => ({
      id: entry.id,
      seq: entry.seq,
      entryDate: entry.entryDate,
      type: entry.type,
      description: entry.description,
      debit: n(entry.debit),
      credit: n(entry.credit),
      balanceAfter: n(entry.balanceAfter),
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      user: entry.user,
    })),
    meta: pageMeta(total, page, pageSize),
  };
}
