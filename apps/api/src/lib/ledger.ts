import type { LedgerEntryType } from '@prisma/client';
import type { PrismaTx } from './prisma';
import { round2 } from '@ps/shared';

export interface LedgerInput {
  storeId: string;
  customerId?: string;
  supplierId?: string;
  type: LedgerEntryType;
  debit?: number;
  credit?: number;
  description?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  createdBy: string;
  entryDate?: Date;
}

/**
 * Customer ledger: debit increases what the customer owes us, credit reduces it.
 * The customer row is locked so concurrent sales/payments for the same customer
 * cannot both read the same previous balance.
 */
export async function addCustomerLedger(tx: PrismaTx, input: LedgerInput) {
  if (!input.customerId) throw new Error('customerId is required');
  await tx.$executeRaw`SELECT 1 FROM "Customer" WHERE "id" = ${input.customerId}::uuid FOR UPDATE`;

  const last = await tx.customerLedger.findFirst({
    where: { customerId: input.customerId },
    orderBy: { seq: 'desc' },
    select: { balanceAfter: true },
  });
  const debit = round2(input.debit ?? 0);
  const credit = round2(input.credit ?? 0);
  const balanceAfter = round2(Number(last?.balanceAfter ?? 0) + debit - credit);

  return tx.customerLedger.create({
    data: {
      storeId: input.storeId,
      customerId: input.customerId,
      entryDate: input.entryDate ?? new Date(),
      type: input.type,
      description: input.description ?? null,
      debit,
      credit,
      balanceAfter,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      createdBy: input.createdBy,
    },
  });
}

/** Supplier ledger: credit increases what we owe the supplier, debit reduces it. */
export async function addSupplierLedger(tx: PrismaTx, input: LedgerInput) {
  if (!input.supplierId) throw new Error('supplierId is required');
  await tx.$executeRaw`SELECT 1 FROM "Supplier" WHERE "id" = ${input.supplierId}::uuid FOR UPDATE`;

  const last = await tx.supplierLedger.findFirst({
    where: { supplierId: input.supplierId },
    orderBy: { seq: 'desc' },
    select: { balanceAfter: true },
  });
  const debit = round2(input.debit ?? 0);
  const credit = round2(input.credit ?? 0);
  const balanceAfter = round2(Number(last?.balanceAfter ?? 0) + credit - debit);

  return tx.supplierLedger.create({
    data: {
      storeId: input.storeId,
      supplierId: input.supplierId,
      entryDate: input.entryDate ?? new Date(),
      type: input.type,
      description: input.description ?? null,
      debit,
      credit,
      balanceAfter,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      createdBy: input.createdBy,
    },
  });
}

export async function customerOutstanding(tx: PrismaTx, customerId: string): Promise<number> {
  const last = await tx.customerLedger.findFirst({
    where: { customerId },
    orderBy: { seq: 'desc' },
    select: { balanceAfter: true },
  });
  return Number(last?.balanceAfter ?? 0);
}

export async function supplierOutstanding(tx: PrismaTx, supplierId: string): Promise<number> {
  const last = await tx.supplierLedger.findFirst({
    where: { supplierId },
    orderBy: { seq: 'desc' },
    select: { balanceAfter: true },
  });
  return Number(last?.balanceAfter ?? 0);
}
