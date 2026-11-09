import type { Request } from 'express';
import { Prisma, type PaymentMethod } from '@prisma/client';
import { financialYear, refundForReturn, round2, saleReturnCreateSchema } from '@ps/shared';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { pageMeta, parsePagination } from '../../lib/pagination';
import { parseDateRange } from '../../lib/date-range';
import { writeAudit } from '../../lib/audit';
import { nextDocumentNumber } from '../../lib/sequence';
import { applyStockMovement } from '../../lib/stock';
import { addCustomerLedger } from '../../lib/ledger';

const n = (v: unknown) => Number(v ?? 0);

export async function createSaleReturn(
  storeId: string,
  userId: string,
  input: z.infer<typeof saleReturnCreateSchema>,
  req: Request,
) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Invoice" WHERE "id" = ${input.invoiceId}::uuid AND "storeId" = ${storeId}::uuid FOR UPDATE`;
    const invoice = await tx.invoice.findFirst({
      where: { id: input.invoiceId, storeId },
      include: { items: true },
    });
    if (!invoice) throw notFound('Invoice');
    if (invoice.status === 'VOID') throw conflict('Cannot return items from a void invoice');
    if (invoice.status === 'RETURNED') throw conflict('This invoice has already been fully returned');

    const itemById = new Map(invoice.items.map((item) => [item.id, item]));
    const seen = new Set<string>();
    let refundTotal = 0;
    let taxTotal = 0;

    const prepared = input.items.map((line) => {
      if (seen.has(line.invoiceItemId)) throw badRequest('Duplicate item in the return');
      seen.add(line.invoiceItemId);
      const item = itemById.get(line.invoiceItemId);
      if (!item) throw badRequest('An item does not belong to this invoice');
      const remaining = round2(n(item.quantity) - n(item.returnedQuantity));
      if (line.quantity > remaining + 0.0005) {
        throw badRequest(`Cannot return more than ${remaining} of ${item.productName}`);
      }
      const refund = refundForReturn(
        { quantity: n(item.quantity), lineTotal: n(item.lineTotal), taxAmount: n(item.taxAmount) },
        line.quantity,
      );
      refundTotal = round2(refundTotal + refund.amount);
      taxTotal = round2(taxTotal + refund.taxAmount);
      return { item, quantity: line.quantity, refund };
    });

    if (refundTotal <= 0) throw badRequest('Return value must be greater than zero');
    if (input.refundMethod === 'CREDIT' && !invoice.customerId) {
      throw badRequest('Select a registered customer to refund as store credit');
    }

    const store = await tx.store.findUnique({ where: { id: storeId } });
    if (!store) throw notFound('Store');
    const fy = financialYear(new Date(), store.financialYearStartMonth);
    const returnNo = await nextDocumentNumber(tx, {
      storeId,
      docType: 'SALE_RETURN',
      financialYear: fy,
      prefix: 'SR',
    });

    const saleReturn = await tx.saleReturn.create({
      data: {
        storeId,
        returnNo,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        reason: input.reason ?? null,
        refundMethod: input.refundMethod as PaymentMethod,
        subtotal: round2(refundTotal - taxTotal),
        taxAmount: taxTotal,
        total: refundTotal,
        restock: input.restock,
        status: 'COMPLETED',
        createdBy: userId,
      },
    });

    for (const entry of prepared) {
      await tx.returnItem.create({
        data: {
          returnId: saleReturn.id,
          invoiceItemId: entry.item.id,
          productId: entry.item.productId,
          quantity: entry.quantity,
          unitPrice: entry.item.unitPrice,
          taxAmount: entry.refund.taxAmount,
          lineTotal: entry.refund.amount,
          restock: input.restock,
          batchId: entry.item.batchId,
        },
      });
      await tx.invoiceItem.update({
        where: { id: entry.item.id },
        data: { returnedQuantity: { increment: entry.quantity } },
      });

      if (input.restock && entry.item.productId) {
        await applyStockMovement(tx, {
          storeId,
          productId: entry.item.productId,
          userId,
          type: 'SALE_RETURN',
          quantity: Math.abs(entry.quantity),
          unitCost: n(entry.item.costAtSale),
          batchId: entry.item.batchId,
          referenceType: 'SALE_RETURN',
          referenceId: saleReturn.id,
          note: `Return ${returnNo} against ${invoice.invoiceNo}`,
          allowNegative: true,
        });
      }
    }

    // Update invoice status based on remaining quantities.
    const refreshed = await tx.invoiceItem.findMany({ where: { invoiceId: invoice.id } });
    const fullyReturned = refreshed.every(
      (item) => n(item.returnedQuantity) >= n(item.quantity) - 0.0005,
    );
    const anyReturned = refreshed.some((item) => n(item.returnedQuantity) > 0);

    let outstanding = n(invoice.balanceDue);
    const creditApplied = Math.min(outstanding, refundTotal);
    outstanding = round2(outstanding - creditApplied);
    const payout = round2(refundTotal - creditApplied);

    if (creditApplied > 0 && invoice.customerId) {
      await addCustomerLedger(tx, {
        storeId,
        customerId: invoice.customerId,
        type: 'SALE_RETURN',
        credit: creditApplied,
        description: `Return ${returnNo} against ${invoice.invoiceNo}`,
        referenceType: 'SALE_RETURN',
        referenceId: saleReturn.id,
        createdBy: userId,
      });
    }

    if (input.refundMethod === 'CREDIT') {
      // Entire refund becomes store credit against future purchases.
      if (payout > 0 && invoice.customerId) {
        await addCustomerLedger(tx, {
          storeId,
          customerId: invoice.customerId,
          type: 'CREDIT_NOTE',
          credit: payout,
          description: `Store credit ${returnNo} against ${invoice.invoiceNo}`,
          referenceType: 'SALE_RETURN',
          referenceId: saleReturn.id,
          createdBy: userId,
        });
      }
    } else if (payout > 0) {
      await tx.payment.create({
        data: {
          storeId,
          direction: 'OUT',
          partyType: invoice.customerId ? 'CUSTOMER' : 'NONE',
          partyId: invoice.customerId,
          method: input.refundMethod as PaymentMethod,
          amount: payout,
          reference: `Refund ${returnNo}`,
          notes: input.reason ?? null,
          receivedAt: new Date(),
          createdBy: userId,
        },
      });
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: fullyReturned ? 'RETURNED' : anyReturned ? 'PARTIALLY_RETURNED' : invoice.status,
        balanceDue: outstanding,
        paymentStatus:
          outstanding <= 0
            ? n(invoice.amountPaid) > 0
              ? 'PAID'
              : 'UNPAID'
            : 'PARTIAL',
      },
    });

    // Reverse the share of loyalty points earned on the returned value.
    if (invoice.customerId && invoice.pointsEarned > 0) {
      const proportion = n(invoice.grandTotal) > 0 ? refundTotal / n(invoice.grandTotal) : 0;
      const reversePoints = Math.floor(invoice.pointsEarned * proportion);
      if (reversePoints > 0) {
        await tx.loyaltyTransaction.create({
          data: {
            storeId,
            customerId: invoice.customerId,
            points: -reversePoints,
            type: 'ADJUST',
            referenceType: 'SALE_RETURN',
            referenceId: saleReturn.id,
            note: `Reversed earned points — ${returnNo}`,
          },
        });
        const customer = await tx.customer.findUnique({ where: { id: invoice.customerId } });
        if (customer) {
          const spent = Math.max(0, round2(n(customer.totalSpent) - refundTotal));
          await tx.customer.update({
            where: { id: customer.id },
            data: {
              loyaltyPoints: Math.max(0, customer.loyaltyPoints - reversePoints),
              totalSpent: spent,
            },
          });
        }
      }
    }

    const full = await tx.saleReturn.findUnique({
      where: { id: saleReturn.id },
      include: {
        invoice: { select: { id: true, invoiceNo: true, grandTotal: true } },
        customer: { select: { id: true, name: true, mobile: true } },
        items: { include: { invoiceItem: { select: { productName: true, sku: true } } } },
        user: { select: { id: true, name: true } },
      },
    });

    return { saleReturn: full!, payout, creditApplied };
  });

  await writeAudit({
    storeId,
    userId,
    action: 'SALE_RETURN_CREATED',
    entityType: 'SaleReturn',
    entityId: result.saleReturn.id,
    after: {
      returnNo: result.saleReturn.returnNo,
      invoiceId: input.invoiceId,
      total: n(result.saleReturn.total),
      refundMethod: input.refundMethod,
    },
    req,
  });

  return serializeReturn(result.saleReturn, result.payout, result.creditApplied);
}

type ReturnWithRelations = Prisma.SaleReturnGetPayload<{
  include: {
    invoice: { select: { id: true; invoiceNo: true; grandTotal: true } };
    customer: { select: { id: true; name: true; mobile: true } };
    items: { include: { invoiceItem: { select: { productName: true; sku: true } } } };
    user: { select: { id: true; name: true } };
  };
}>;

function serializeReturn(ret: ReturnWithRelations, payout?: number, creditApplied?: number) {
  return {
    id: ret.id,
    returnNo: ret.returnNo,
    invoiceId: ret.invoiceId,
    invoiceNo: ret.invoice?.invoiceNo ?? null,
    customerId: ret.customerId,
    customer: ret.customer,
    returnDate: ret.returnDate,
    reason: ret.reason,
    refundMethod: ret.refundMethod,
    subtotal: n(ret.subtotal),
    taxAmount: n(ret.taxAmount),
    total: n(ret.total),
    restock: ret.restock,
    status: ret.status,
    createdByUser: ret.user,
    createdAt: ret.createdAt,
    ...(payout !== undefined ? { payout } : {}),
    ...(creditApplied !== undefined ? { creditApplied } : {}),
    items: ret.items.map((item) => ({
      id: item.id,
      invoiceItemId: item.invoiceItemId,
      productId: item.productId,
      productName: item.invoiceItem?.productName ?? null,
      sku: item.invoiceItem?.sku ?? null,
      quantity: n(item.quantity),
      unitPrice: n(item.unitPrice),
      taxAmount: n(item.taxAmount),
      lineTotal: n(item.lineTotal),
      restock: item.restock,
      batchId: item.batchId,
    })),
  };
}

export async function listSaleReturns(storeId: string, query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const search = String(query.search ?? '').trim();
  const { from, to } = parseDateRange(query);

  const conditions: Prisma.SaleReturnWhereInput[] = [];
  if (search) {
    conditions.push({
      OR: [
        { returnNo: { contains: search, mode: 'insensitive' } },
        { invoice: { invoiceNo: { contains: search, mode: 'insensitive' } } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { mobile: { contains: search, mode: 'insensitive' } } },
      ],
    });
  }
  const where: Prisma.SaleReturnWhereInput = {
    storeId,
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
    ...(conditions.length ? { AND: conditions } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.saleReturn.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        invoice: { select: { id: true, invoiceNo: true, grandTotal: true } },
        customer: { select: { id: true, name: true, mobile: true } },
        items: { include: { invoiceItem: { select: { productName: true, sku: true } } } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.saleReturn.count({ where }),
  ]);

  return { items: rows.map((r) => serializeReturn(r)), meta: pageMeta(total, page, pageSize) };
}

export async function getSaleReturn(storeId: string, id: string) {
  const ret = await prisma.saleReturn.findFirst({
    where: { id, storeId },
    include: {
      invoice: { select: { id: true, invoiceNo: true, grandTotal: true } },
      customer: { select: { id: true, name: true, mobile: true } },
      items: { include: { invoiceItem: { select: { productName: true, sku: true } } } },
      user: { select: { id: true, name: true } },
    },
  });
  if (!ret) throw notFound('Sale return');
  return serializeReturn(ret);
}
