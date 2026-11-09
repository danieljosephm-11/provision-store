import type { Request } from 'express';
import { Prisma, type PaymentMethod } from '@prisma/client';
import { computeInvoice, financialYear, round2, type DiscountInput } from '@ps/shared';
import type { InvoiceCreateInput } from '@ps/shared';
import { prisma, type PrismaTx } from '../../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { pageMeta, parsePagination } from '../../lib/pagination';
import { parseDateRange } from '../../lib/date-range';
import { writeAudit } from '../../lib/audit';
import { nextDocumentNumber } from '../../lib/sequence';
import { applyStockMovement, pickBatchForSale } from '../../lib/stock';
import { addCustomerLedger, customerOutstanding } from '../../lib/ledger';
import {
  invoiceInclude,
  serializeInvoice,
  type InvoiceWithRelations,
} from './invoice.serializer';

const n = (v: unknown) => Number(v ?? 0);

const PRODUCT_INCLUDE = {
  unit: { select: { code: true } },
  taxRate: { select: { rate: true, cessRate: true, hsnCode: true } },
  inventory: { select: { quantity: true, avgCost: true } },
} satisfies Prisma.ProductInclude;

function segmentFor(totalSpent: number, current: string) {
  if (current === 'INACTIVE') return current;
  if (totalSpent >= 20000) return 'HIGH_VALUE' as const;
  if (totalSpent >= 5000) return 'LOYAL' as const;
  if (totalSpent > 0) return 'REGULAR' as const;
  return 'NEW' as const;
}

async function assertIdempotency(storeId: string, key: string | null) {
  if (!key) return null;
  const existing = await prisma.invoice.findFirst({ where: { storeId, idempotencyKey: key } });
  if (!existing) return null;
  const full = await prisma.invoice.findUnique({ where: { id: existing.id }, include: invoiceInclude });
  return full ? serializeInvoice(full) : null;
}

export async function createInvoice(
  storeId: string,
  userId: string,
  permissions: string[],
  input: InvoiceCreateInput,
  req: Request,
  headerKey?: string,
) {
  const idempotencyKey = (headerKey?.trim() || input.clientRef?.trim() || '').slice(0, 120) || null;
  const replay = await assertIdempotency(storeId, idempotencyKey);
  if (replay) return { item: replay, replayed: true, changeDue: 0 };

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw notFound('Store');

  if (!permissions.includes('pos.sell')) throw forbidden('You cannot create invoices');
  const hasDiscountPermission = permissions.includes('pos.discount');
  if ((input.billDiscount?.value ?? 0) > 0 && !hasDiscountPermission) {
    throw forbidden('You do not have permission to apply bill discounts');
  }
  for (const line of input.items) {
    if ((line.discount?.value ?? 0) > 0 && !hasDiscountPermission) {
      throw forbidden('You do not have permission to apply item discounts');
    }
  }

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, storeId, deletedAt: null, status: 'ACTIVE' },
    include: PRODUCT_INCLUDE,
  });
  const productById = new Map(products.map((p) => [p.id, p]));
  for (const line of input.items) {
    if (!productById.has(line.productId)) throw badRequest('One or more products are unavailable');
  }

  const customer = input.customerId
    ? await prisma.customer.findFirst({ where: { id: input.customerId, storeId, deletedAt: null } })
    : null;
  if (input.customerId && !customer) throw badRequest('Select a valid customer');
  if (customer && !customer.isActive) throw badRequest('This customer is inactive');

  // Price overrides are effectively discounts.
  if (!hasDiscountPermission) {
    for (const line of input.items) {
      const product = productById.get(line.productId)!;
      if (line.unitPrice != null && round2(line.unitPrice) !== round2(n(product.sellingPrice))) {
        throw forbidden('You do not have permission to change item prices');
      }
    }
  }

  const placeOfSupplyState = input.placeOfSupplyState ?? store.stateCode;
  const interState = placeOfSupplyState !== store.stateCode;

  const lineInputs = input.items.map((line) => {
    const product = productById.get(line.productId)!;
    return {
      quantity: line.quantity,
      unitPrice: line.unitPrice ?? n(product.sellingPrice),
      priceIncludesTax: product.priceIncludesTax && store.taxEnabled,
      taxRate: store.taxEnabled && product.taxRate ? n(product.taxRate.rate) : 0,
      cessRate: store.taxEnabled && product.taxRate ? n(product.taxRate.cessRate) : 0,
      discount: (line.discount ?? null) as DiscountInput | null,
    };
  });

  let calculation;
  try {
    calculation = computeInvoice(lineInputs, {
      interState,
      billDiscount: (input.billDiscount ?? null) as DiscountInput | null,
      roundToRupee: input.roundToRupee !== false,
    });
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Invalid invoice values');
  }

  const requestedRedeem = input.redeemPoints ?? 0;
  if (requestedRedeem > 0 && !customer) throw badRequest('Select a customer to redeem loyalty points');
  if (requestedRedeem > 0 && !store.loyaltyEnabled) throw badRequest('Loyalty programme is disabled');

  const result = await prisma.$transaction(async (tx) => {
    let loyaltyPointsRedeemed = 0;
    let loyaltyDiscount = 0;
    let lockedCustomer = customer;
    if (customer) {
      await tx.$executeRaw`SELECT 1 FROM "Customer" WHERE "id" = ${customer.id}::uuid FOR UPDATE`;
      lockedCustomer = await tx.customer.findUnique({ where: { id: customer.id } });
      if (!lockedCustomer) throw conflict('Customer no longer exists');
    }

    if (requestedRedeem > 0 && lockedCustomer) {
      const pointValue = n(store.loyaltyPointValue);
      if (pointValue <= 0) throw badRequest('Loyalty point value is not configured');
      const available = lockedCustomer.loyaltyPoints;
      let points = Math.min(requestedRedeem, available);
      const maxPoints = Math.floor(calculation.grandTotal / pointValue);
      points = Math.min(points, maxPoints);
      if (points <= 0) throw badRequest('Not enough loyalty points for this bill');
      loyaltyPointsRedeemed = points;
      loyaltyDiscount = round2(points * pointValue);
    }

    const payable = Math.max(0, round2(calculation.grandTotal - loyaltyDiscount));

    // Payment tender: CREDIT lines are not cash received.
    const tenders = input.payments.filter((p) => p.method !== 'CREDIT');
    const totalTendered = round2(tenders.reduce((sum, p) => sum + n(p.amount), 0));
    const changeDue = Math.max(0, round2(totalTendered - payable));

    let remaining = payable;
    const allocations: { method: PaymentMethod; amount: number; reference?: string | null }[] = [];
    for (const tender of tenders) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, round2(n(tender.amount)));
      if (take <= 0) continue;
      allocations.push({ method: tender.method, amount: take, reference: tender.reference ?? null });
      remaining = round2(remaining - take);
    }
    const amountPaid = round2(payable - remaining);
    const balanceDue = remaining;

    if (balanceDue > 0) {
      if (!lockedCustomer) throw badRequest('Select a customer for a credit (unpaid) bill');
      if (!permissions.includes('pos.credit')) {
        throw forbidden('You do not have permission to sell on credit');
      }
      // Credit limit is enforced against the live outstanding balance.
      const outstanding = await customerOutstanding(tx, lockedCustomer.id);
      const limit = n(lockedCustomer.creditLimit);
      if (round2(outstanding + balanceDue) > limit) {
        throw conflict(
          `Credit limit exceeded. Outstanding ${outstanding.toFixed(2)}, new bill ${balanceDue.toFixed(2)}, limit ${limit.toFixed(2)}`,
          { outstanding, balanceDue, creditLimit: limit },
        );
      }
    }

    const fy = financialYear(new Date(), store.financialYearStartMonth);
    const invoiceNo = await nextDocumentNumber(tx, {
      storeId,
      docType: 'INVOICE',
      financialYear: fy,
      prefix: store.invoicePrefix || 'INV',
    });

    const dueDate =
      input.dueDate
        ? new Date(input.dueDate)
        : balanceDue > 0 && lockedCustomer && lockedCustomer.creditDays > 0
          ? new Date(Date.now() + lockedCustomer.creditDays * 86_400_000)
          : null;

    const paymentStatus =
      balanceDue <= 0 ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'UNPAID';

    const invoice = await tx.invoice.create({
      data: {
        storeId,
        invoiceNo,
        financialYear: fy,
        customerId: lockedCustomer?.id ?? null,
        customerName: input.customerName ?? lockedCustomer?.name ?? null,
        customerMobile: input.customerMobile ?? lockedCustomer?.mobile ?? null,
        placeOfSupplyState,
        status: 'COMPLETED',
        subtotal: calculation.subtotal,
        itemDiscount: calculation.itemDiscount,
        billDiscount: calculation.billDiscount,
        taxableAmount: calculation.taxableAmount,
        cgst: calculation.cgst,
        sgst: calculation.sgst,
        igst: calculation.igst,
        cess: calculation.cess,
        roundOff: calculation.roundOff,
        loyaltyPointsRedeemed,
        loyaltyDiscount,
        grandTotal: payable,
        amountPaid,
        balanceDue,
        paymentStatus,
        notes: input.notes ?? null,
        dueDate,
        idempotencyKey,
        clientRef: input.clientRef ?? null,
        createdBy: userId,
      },
    });

    // Line items
    await tx.invoiceItem.createMany({
      data: input.items.map((line, index) => {
        const product = productById.get(line.productId)!;
        const calc = calculation.lines[index]!;
        return {
          invoiceId: invoice.id,
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          hsn: product.taxRate?.hsnCode ?? product.hsnCode ?? null,
          unit: product.unit.code,
          quantity: line.quantity,
          unitPrice: lineInputs[index]!.unitPrice,
          mrp: n(product.mrp),
          priceIncludesTax: lineInputs[index]!.priceIncludesTax,
          grossAmount: calc.grossAmount,
          discountAmount: calc.discountAmount,
          discountPercent: calc.discountPercent,
          billDiscountShare: calc.billDiscountShare,
          taxableAmount: calc.taxableAmount,
          taxRate: calc.taxRate,
          cgst: calc.cgst,
          sgst: calc.sgst,
          igst: calc.igst,
          taxAmount: calc.taxAmount,
          lineTotal: calc.lineTotal,
          costAtSale: n(product.inventory?.avgCost ?? product.purchasePrice),
        };
      }),
    });

    // Stock movements (serialized per product row lock)
    const invoiceItems = await tx.invoiceItem.findMany({
      where: { invoiceId: invoice.id },
      select: { id: true, productId: true },
    });
    const itemByProduct = new Map(invoiceItems.map((i) => [i.productId!, i.id]));

    for (let index = 0; index < input.items.length; index++) {
      const line = input.items[index]!;
      const product = productById.get(line.productId)!;
      let batchId = line.batchId ?? null;
      if (product.trackBatches) {
        if (batchId) {
          const batch = await tx.productBatch.findFirst({
            where: { id: batchId, productId: product.id },
          });
          if (!batch) throw badRequest('Selected batch does not belong to the product');
        } else {
          const picked = await pickBatchForSale(tx, product.id, line.quantity);
          if (!picked) {
            throw conflict(`No batch has enough stock for ${product.name}`);
          }
          batchId = picked.id;
        }
      }
      await applyStockMovement(tx, {
        storeId,
        productId: product.id,
        userId,
        type: 'SALE',
        quantity: -Math.abs(line.quantity),
        unitCost: n(product.inventory?.avgCost ?? product.purchasePrice),
        batchId,
        referenceType: 'INVOICE',
        referenceId: invoice.id,
        note: `Sold on ${invoiceNo}`,
        allowNegative: store.allowNegativeStock,
      });
      if (batchId) {
        await tx.invoiceItem.update({
          where: { id: itemByProduct.get(product.id)! },
          data: { batchId },
        });
      }
    }

    // Payments
    for (const allocation of allocations) {
      const payment = await tx.payment.create({
        data: {
          storeId,
          direction: 'IN',
          partyType: lockedCustomer ? 'CUSTOMER' : 'NONE',
          partyId: lockedCustomer?.id ?? null,
          method: allocation.method,
          amount: allocation.amount,
          reference: allocation.reference ?? null,
          receivedAt: new Date(),
          createdBy: userId,
        },
      });
      await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          targetType: 'INVOICE',
          invoiceId: invoice.id,
          amount: allocation.amount,
        },
      });
    }

    if (lockedCustomer && balanceDue > 0) {
      await addCustomerLedger(tx, {
        storeId,
        customerId: lockedCustomer.id,
        type: 'SALE',
        debit: balanceDue,
        description: `Credit sale ${invoiceNo}`,
        referenceType: 'INVOICE',
        referenceId: invoice.id,
        createdBy: userId,
      });
    }

    // Loyalty
    let pointsEarned = 0;
    if (lockedCustomer && store.loyaltyEnabled) {
      if (loyaltyPointsRedeemed > 0) {
        await tx.loyaltyTransaction.create({
          data: {
            storeId,
            customerId: lockedCustomer.id,
            points: -loyaltyPointsRedeemed,
            type: 'REDEEM',
            referenceType: 'INVOICE',
            referenceId: invoice.id,
            note: `Redeemed on ${invoiceNo}`,
          },
        });
      }
      const earnPer = n(store.loyaltyEarnPerAmount);
      if (earnPer > 0 && payable > 0) {
        pointsEarned = Math.floor(payable / earnPer);
      }
      if (pointsEarned > 0) {
        await tx.loyaltyTransaction.create({
          data: {
            storeId,
            customerId: lockedCustomer.id,
            points: pointsEarned,
            type: 'EARN',
            referenceType: 'INVOICE',
            referenceId: invoice.id,
            note: `Earned on ${invoiceNo}`,
          },
        });
      }
      const newPoints = lockedCustomer.loyaltyPoints - loyaltyPointsRedeemed + pointsEarned;
      const newSpent = round2(n(lockedCustomer.totalSpent) + payable);
      await tx.customer.update({
        where: { id: lockedCustomer.id },
        data: {
          loyaltyPoints: newPoints,
          totalPurchases: { increment: 1 },
          totalSpent: newSpent,
          lastPurchaseAt: new Date(),
          segment: segmentFor(newSpent, lockedCustomer.segment),
        },
      });
    } else if (lockedCustomer) {
      await tx.customer.update({
        where: { id: lockedCustomer.id },
        data: {
          totalPurchases: { increment: 1 },
          totalSpent: { increment: payable },
          lastPurchaseAt: new Date(),
        },
      });
    }

    if (pointsEarned > 0) {
      await tx.invoice.update({ where: { id: invoice.id }, data: { pointsEarned } });
    }

    const full = await tx.invoice.findUnique({ where: { id: invoice.id }, include: invoiceInclude });
    return { item: serializeInvoice(full!), changeDue };
  });

  await writeAudit({
    storeId,
    userId,
    action: 'INVOICE_CREATED',
    entityType: 'Invoice',
    entityId: result.item.id,
    after: {
      invoiceNo: result.item.invoiceNo,
      grandTotal: result.item.grandTotal,
      paymentStatus: result.item.paymentStatus,
      items: result.item.items.length,
    },
    req,
  });

  return { item: result.item, replayed: false, changeDue: result.changeDue };
}

export async function listInvoices(storeId: string, query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const search = String(query.search ?? '').trim();
  const status = query.status ? String(query.status) : undefined;
  const paymentStatus = query.paymentStatus ? String(query.paymentStatus) : undefined;
  const customerId = query.customerId ? String(query.customerId) : undefined;
  const { from, to } = parseDateRange(query);

  const conditions: Prisma.InvoiceWhereInput[] = [];
  if (search) {
    conditions.push({
      OR: [
        { invoiceNo: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerMobile: { contains: search, mode: 'insensitive' } },
        { clientRef: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  const where: Prisma.InvoiceWhereInput = {
    storeId,
    ...(status ? { status: status as never } : {}),
    ...(paymentStatus ? { paymentStatus: paymentStatus as never } : {}),
    ...(customerId ? { customerId } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
    ...(conditions.length ? { AND: conditions } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        customer: { select: { id: true, name: true, mobile: true } },
        _count: { select: { items: true, returns: true } },
      },
    }),
    prisma.invoice.count({ where }),
  ]);

  return {
    items: rows.map((invoice) => ({
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      status: invoice.status,
      paymentStatus: invoice.paymentStatus,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      customerMobile: invoice.customerMobile,
      subtotal: n(invoice.subtotal),
      taxAmount: round2(n(invoice.cgst) + n(invoice.sgst) + n(invoice.igst) + n(invoice.cess)),
      grandTotal: n(invoice.grandTotal),
      amountPaid: n(invoice.amountPaid),
      balanceDue: n(invoice.balanceDue),
      itemCount: invoice._count.items,
      returnCount: invoice._count.returns,
      createdAt: invoice.createdAt,
      createdBy: invoice.createdBy,
    })),
    meta: pageMeta(total, page, pageSize),
  };
}

export async function getInvoice(storeId: string, id: string) {
  const invoice = await prisma.invoice.findFirst({ where: { id, storeId }, include: invoiceInclude });
  if (!invoice) throw notFound('Invoice');
  return serializeInvoice(invoice);
}

export async function voidInvoice(
  storeId: string,
  userId: string,
  id: string,
  reason: string,
  req: Request,
) {
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Invoice" WHERE "id" = ${id}::uuid AND "storeId" = ${storeId}::uuid FOR UPDATE
    `;
    if (!rows[0]) throw notFound('Invoice');
    const invoice = await tx.invoice.findUnique({
      where: { id },
      include: { items: true, payments: { include: { payment: true } }, returns: true },
    });
    if (!invoice) throw notFound('Invoice');
    if (invoice.status === 'VOID') throw conflict('This invoice is already void');
    if (invoice.returns.length > 0) {
      throw conflict('This invoice has returns. Reverse the returns before voiding it.');
    }

    const store = await tx.store.findUnique({ where: { id: storeId } });

    for (const item of invoice.items) {
      if (!item.productId) continue;
      await applyStockMovement(tx, {
        storeId,
        productId: item.productId,
        userId,
        type: 'SALE_RETURN',
        quantity: Math.abs(n(item.quantity)),
        unitCost: n(item.costAtSale),
        batchId: item.batchId,
        referenceType: 'INVOICE_VOID',
        referenceId: invoice.id,
        note: `Invoice void ${invoice.invoiceNo}`,
        allowNegative: true,
      });
    }

    if (invoice.customerId) {
      if (n(invoice.balanceDue) > 0) {
        await addCustomerLedger(tx, {
          storeId,
          customerId: invoice.customerId,
          type: 'ADJUSTMENT',
          credit: n(invoice.balanceDue),
          description: `Invoice void ${invoice.invoiceNo}`,
          referenceType: 'INVOICE',
          referenceId: invoice.id,
          createdBy: userId,
        });
      }

      // Reverse loyalty movements.
      if (invoice.pointsEarned > 0) {
        await tx.loyaltyTransaction.create({
          data: {
            storeId,
            customerId: invoice.customerId,
            points: -invoice.pointsEarned,
            type: 'ADJUST',
            referenceType: 'INVOICE',
            referenceId: invoice.id,
            note: `Reversed earned points — void ${invoice.invoiceNo}`,
          },
        });
      }
      if (invoice.loyaltyPointsRedeemed > 0) {
        await tx.loyaltyTransaction.create({
          data: {
            storeId,
            customerId: invoice.customerId,
            points: invoice.loyaltyPointsRedeemed,
            type: 'ADJUST',
            referenceType: 'INVOICE',
            referenceId: invoice.id,
            note: `Returned redeemed points — void ${invoice.invoiceNo}`,
          },
        });
      }
      const customer = await tx.customer.findUnique({ where: { id: invoice.customerId } });
      if (customer) {
        const points = Math.max(
          0,
          customer.loyaltyPoints - invoice.pointsEarned + invoice.loyaltyPointsRedeemed,
        );
        const spent = Math.max(0, round2(n(customer.totalSpent) - n(invoice.grandTotal)));
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            loyaltyPoints: points,
            totalSpent: spent,
            totalPurchases: Math.max(0, n(customer.totalPurchases) - 1),
            segment: segmentFor(spent, customer.segment),
          },
        });
      }
    }

    // Refund every captured payment using the original method.
    for (const allocation of invoice.payments) {
      await tx.payment.create({
        data: {
          storeId,
          direction: 'OUT',
          partyType: invoice.customerId ? 'CUSTOMER' : 'NONE',
          partyId: invoice.customerId,
          method: allocation.payment.method,
          amount: n(allocation.amount),
          reference: `Void ${invoice.invoiceNo}`,
          notes: reason,
          receivedAt: new Date(),
          createdBy: userId,
        },
      });
    }

    const updated = await tx.invoice.update({
      where: { id },
      data: {
        status: 'VOID',
        voidedAt: new Date(),
        voidedBy: userId,
        voidReason: reason,
        balanceDue: 0,
        paymentStatus: n(invoice.amountPaid) > 0 ? 'REFUNDED' : 'UNPAID',
        notes: invoice.notes,
        ...(store ? { placeOfSupplyState: invoice.placeOfSupplyState } : {}),
      },
      include: invoiceInclude,
    });

    return updated;
  });

  await writeAudit({
    storeId,
    userId,
    action: 'INVOICE_VOIDED',
    entityType: 'Invoice',
    entityId: id,
    before: { status: 'COMPLETED', grandTotal: n(result.grandTotal) },
    after: { status: 'VOID', reason },
    req,
  });

  return serializeInvoice(result);
}

export async function addInvoicePayment(
  storeId: string,
  userId: string,
  invoiceId: string,
  input: { amount: number; method: PaymentMethod; reference?: string | null; note?: string | null },
  req: Request,
) {
  const invoice = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId}::uuid AND "storeId" = ${storeId}::uuid FOR UPDATE
    `;
    if (!rows[0]) throw notFound('Invoice');
    const current = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!current) throw notFound('Invoice');
    if (current.status === 'VOID') throw conflict('Cannot collect payment for a void invoice');
    const balance = n(current.balanceDue);
    if (balance <= 0) throw conflict('This invoice is fully paid');
    const amount = round2(input.amount);
    if (amount <= 0) throw badRequest('Payment amount must be greater than zero');
    if (amount > balance) throw badRequest(`Payment exceeds the balance due (${balance.toFixed(2)})`);

    if (input.method === 'CREDIT') throw badRequest('Credit is not a valid payment method here');

    const payment = await tx.payment.create({
      data: {
        storeId,
        direction: 'IN',
        partyType: current.customerId ? 'CUSTOMER' : 'NONE',
        partyId: current.customerId,
        method: input.method,
        amount,
        reference: input.reference ?? null,
        notes: input.note ?? null,
        receivedAt: new Date(),
        createdBy: userId,
      },
    });
    await tx.paymentAllocation.create({
      data: { paymentId: payment.id, targetType: 'INVOICE', invoiceId, amount },
    });

    const amountPaid = round2(n(current.amountPaid) + amount);
    const balanceDue = round2(balance - amount);
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid,
        balanceDue,
        paymentStatus: balanceDue <= 0 ? 'PAID' : 'PARTIAL',
      },
    });

    if (current.customerId) {
      await addCustomerLedger(tx, {
        storeId,
        customerId: current.customerId,
        type: 'PAYMENT',
        credit: amount,
        description: `Payment for ${current.invoiceNo}`,
        referenceType: 'INVOICE',
        referenceId: invoiceId,
        createdBy: userId,
      });
    }

    const full = await tx.invoice.findUnique({ where: { id: invoiceId }, include: invoiceInclude });
    return full!;
  });

  await writeAudit({
    storeId,
    userId,
    action: 'INVOICE_PAYMENT_RECORDED',
    entityType: 'Invoice',
    entityId: invoiceId,
    after: { amount: input.amount, method: input.method },
    req,
  });

  return serializeInvoice(invoice);
}

// ── Held bills ───────────────────────────────────────────────────────
export async function listHeldBills(storeId: string, query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const search = String(query.search ?? '').trim();
  const where: Prisma.HeldBillWhereInput = {
    storeId,
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.heldBill.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        customer: { select: { id: true, name: true, mobile: true } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.heldBill.count({ where }),
  ]);
  return {
    items: items.map((bill) => ({
      id: bill.id,
      name: bill.name,
      customerId: bill.customerId,
      customer: bill.customer,
      payload: bill.payload,
      subtotal: n(bill.subtotal),
      createdByUser: bill.user,
      createdAt: bill.createdAt,
      updatedAt: bill.updatedAt,
    })),
    meta: pageMeta(total, page, pageSize),
  };
}

export async function createHeldBill(
  storeId: string,
  userId: string,
  input: {
    name: string;
    customerId?: string | null;
    payload: Record<string, unknown>;
    subtotal?: number;
  },
  req: Request,
) {
  if (input.customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: input.customerId, storeId } });
    if (!customer) throw badRequest('Select a valid customer');
  }
  const bill = await prisma.heldBill.create({
    data: {
      storeId,
      name: input.name,
      customerId: input.customerId ?? null,
      payload: input.payload as Prisma.InputJsonValue,
      subtotal: input.subtotal ?? 0,
      createdBy: userId,
    },
    include: { customer: { select: { id: true, name: true, mobile: true } } },
  });
  await writeAudit({
    storeId,
    userId,
    action: 'BILL_HELD',
    entityType: 'HeldBill',
    entityId: bill.id,
    after: { name: bill.name, subtotal: n(bill.subtotal) },
    req,
  });
  return { ...bill, subtotal: n(bill.subtotal) };
}

export async function updateHeldBill(
  storeId: string,
  userId: string,
  id: string,
  input: { name?: string; customerId?: string | null; payload?: Record<string, unknown>; subtotal?: number },
  req: Request,
) {
  const existing = await prisma.heldBill.findFirst({ where: { id, storeId } });
  if (!existing) throw notFound('Held bill');
  const bill = await prisma.heldBill.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
      ...(input.payload !== undefined ? { payload: input.payload as Prisma.InputJsonValue } : {}),
      ...(input.subtotal !== undefined ? { subtotal: input.subtotal } : {}),
    },
  });
  await writeAudit({
    storeId,
    userId,
    action: 'HELD_BILL_UPDATED',
    entityType: 'HeldBill',
    entityId: id,
    after: { name: bill.name },
    req,
  });
  return { ...bill, subtotal: n(bill.subtotal) };
}

export async function deleteHeldBill(storeId: string, userId: string, id: string, req: Request) {
  const existing = await prisma.heldBill.findFirst({ where: { id, storeId } });
  if (!existing) throw notFound('Held bill');
  await prisma.heldBill.delete({ where: { id } });
  await writeAudit({
    storeId,
    userId,
    action: 'HELD_BILL_DELETED',
    entityType: 'HeldBill',
    entityId: id,
    before: { name: existing.name },
    req,
  });
  return { message: 'Held bill removed' };
}

export type { InvoiceWithRelations };
