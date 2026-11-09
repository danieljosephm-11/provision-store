import type { PrismaTx } from './prisma';
import type { StockMovementType } from '@prisma/client';
import { conflict } from './errors';

export interface StockMovementInput {
  storeId: string;
  productId: string;
  userId: string;
  type: StockMovementType;
  /** Signed delta: positive = stock in, negative = stock out. */
  quantity: number;
  unitCost?: number | null;
  batchId?: string | null;
  batchNo?: string | null;
  expiryDate?: Date | null;
  locationId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
  allowNegative?: boolean;
}

export interface StockMovementResult {
  movementId: string;
  balanceBefore: number;
  balanceAfter: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Applies a stock change and writes the matching movement row in the same
 * transaction. There is no code path that alters stock without a movement.
 */
export async function applyStockMovement(
  tx: PrismaTx,
  input: StockMovementInput,
): Promise<StockMovementResult> {
  const delta = round3(Number(input.quantity));
  if (!Number.isFinite(delta) || delta === 0) throw conflict('Stock movement quantity cannot be zero');

  // Ensure a balance row exists, then lock it so concurrent sales serialize.
  const existing = await tx.inventory.findUnique({
    where: { storeId_productId: { storeId: input.storeId, productId: input.productId } },
  });
  if (!existing) {
    await tx.inventory.create({
      data: {
        storeId: input.storeId,
        productId: input.productId,
        locationId: input.locationId ?? null,
        quantity: 0,
        avgCost: 0,
      },
    });
  }

  const locked = await tx.$queryRaw<{ quantity: string; avgCost: string }[]>`
    SELECT "quantity"::text AS quantity, "avgCost"::text AS "avgCost"
    FROM "Inventory"
    WHERE "storeId" = ${input.storeId}::uuid AND "productId" = ${input.productId}::uuid
    FOR UPDATE
  `;
  const current = locked[0];
  if (!current) throw conflict('Inventory record could not be locked');

  const before = Number(current.quantity);
  const after = round3(before + delta);
  if (after < 0 && !input.allowNegative) {
    throw conflict(
      `Insufficient stock: available ${before}, requested ${Math.abs(delta)}. Adjust stock or enable negative stock sales.`,
      { productId: input.productId, available: before, requested: Math.abs(delta) },
    );
  }

  let avgCost = Number(current.avgCost);
  if (delta > 0 && input.unitCost != null) {
    const cost = Number(input.unitCost);
    const newQty = before + delta;
    avgCost = newQty > 0 ? round4((before * avgCost + delta * cost) / newQty) : cost;
  }

  await tx.inventory.update({
    where: { storeId_productId: { storeId: input.storeId, productId: input.productId } },
    data: { quantity: after, avgCost },
  });

  // Batch-level balance, when the product tracks batches.
  let batchId = input.batchId ?? null;
  if (!batchId && input.batchNo && delta > 0) {
    const batch = await tx.productBatch.upsert({
      where: { productId_batchNo: { productId: input.productId, batchNo: input.batchNo } },
      create: {
        productId: input.productId,
        batchNo: input.batchNo,
        expiryDate: input.expiryDate ?? null,
        quantity: 0,
        purchasePrice: input.unitCost ?? 0,
      },
      update: {},
    });
    batchId = batch.id;
  }

  if (batchId) {
    const batchRows = await tx.$queryRaw<{ quantity: string }[]>`
      SELECT "quantity"::text AS quantity FROM "ProductBatch" WHERE "id" = ${batchId}::uuid FOR UPDATE
    `;
    const batch = batchRows[0];
    if (!batch) throw conflict('Batch not found');
    const batchBefore = Number(batch.quantity);
    const batchAfter = round3(batchBefore + delta);
    if (batchAfter < 0 && !input.allowNegative) {
      throw conflict(`Insufficient stock in the selected batch (available ${batchBefore})`);
    }
    await tx.productBatch.update({
      where: { id: batchId },
      data: { quantity: batchAfter, ...(input.expiryDate ? { expiryDate: input.expiryDate } : {}) },
    });
  }

  const movement = await tx.stockMovement.create({
    data: {
      storeId: input.storeId,
      productId: input.productId,
      batchId,
      locationId: input.locationId ?? null,
      type: input.type,
      quantity: delta,
      balanceBefore: before,
      balanceAfter: after,
      unitCost: input.unitCost ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      note: input.note ?? null,
      userId: input.userId,
    },
  });

  return { movementId: movement.id, balanceBefore: before, balanceAfter: after };
}

/** Picks the earliest-expiring batch that can fulfil the requested quantity. */
export async function pickBatchForSale(
  tx: PrismaTx,
  productId: string,
  quantity: number,
): Promise<{ id: string; quantity: number; expiryDate: Date | null } | null> {
  const batches = await tx.productBatch.findMany({
    where: { productId, quantity: { gt: 0 } },
    orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
  });
  const batch = batches.find((b) => Number(b.quantity) >= quantity);
  if (!batch) return null;
  return { id: batch.id, quantity: Number(batch.quantity), expiryDate: batch.expiryDate };
}
