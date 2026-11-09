import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export const invoiceInclude = {
  customer: { select: { id: true, name: true, mobile: true, gstin: true, creditLimit: true } },
  items: { orderBy: { productName: 'asc' } },
  payments: { include: { payment: true } },
  returns: { select: { id: true, returnNo: true, total: true, createdAt: true, status: true } },
  user: { select: { id: true, name: true } },
} satisfies Prisma.InvoiceInclude;

export type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

const n = (v: unknown) => Number(v ?? 0);

export function serializeInvoice(invoice: InvoiceWithRelations) {
  const items = invoice.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    batchId: item.batchId,
    productName: item.productName,
    sku: item.sku,
    hsn: item.hsn,
    unit: item.unit,
    quantity: n(item.quantity),
    unitPrice: n(item.unitPrice),
    mrp: n(item.mrp),
    priceIncludesTax: item.priceIncludesTax,
    grossAmount: n(item.grossAmount),
    discountAmount: n(item.discountAmount),
    discountPercent: n(item.discountPercent),
    billDiscountShare: n(item.billDiscountShare),
    taxableAmount: n(item.taxableAmount),
    taxRate: n(item.taxRate),
    cgst: n(item.cgst),
    sgst: n(item.sgst),
    igst: n(item.igst),
    taxAmount: n(item.taxAmount),
    lineTotal: n(item.lineTotal),
    costAtSale: n(item.costAtSale),
    returnedQuantity: n(item.returnedQuantity),
  }));

  const payments = invoice.payments.map((allocation) => ({
    id: allocation.id,
    amount: n(allocation.amount),
    method: allocation.payment.method,
    reference: allocation.payment.reference,
    receivedAt: allocation.payment.receivedAt,
    direction: allocation.payment.direction,
    paymentId: allocation.paymentId,
  }));

  const cgst = n(invoice.cgst);
  const sgst = n(invoice.sgst);
  const igst = n(invoice.igst);
  const cess = n(invoice.cess);

  return {
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    financialYear: invoice.financialYear,
    status: invoice.status,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    customerMobile: invoice.customerMobile,
    placeOfSupplyState: invoice.placeOfSupplyState,
    subtotal: n(invoice.subtotal),
    itemDiscount: n(invoice.itemDiscount),
    billDiscount: n(invoice.billDiscount),
    taxableAmount: n(invoice.taxableAmount),
    cgst,
    sgst,
    igst,
    cess,
    taxAmount: Math.round((cgst + sgst + igst + cess) * 100) / 100,
    roundOff: n(invoice.roundOff),
    loyaltyPointsRedeemed: invoice.loyaltyPointsRedeemed,
    loyaltyDiscount: n(invoice.loyaltyDiscount),
    pointsEarned: invoice.pointsEarned,
    grandTotal: n(invoice.grandTotal),
    amountPaid: n(invoice.amountPaid),
    balanceDue: n(invoice.balanceDue),
    paymentStatus: invoice.paymentStatus,
    notes: invoice.notes,
    dueDate: invoice.dueDate,
    idempotencyKey: invoice.idempotencyKey,
    clientRef: invoice.clientRef,
    createdBy: invoice.createdBy,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
    voidedAt: invoice.voidedAt,
    voidedBy: invoice.voidedBy,
    voidReason: invoice.voidReason,
    customer: invoice.customer,
    createdByUser: invoice.user,
    items,
    payments,
    returns: invoice.returns.map((r) => ({
      id: r.id,
      returnNo: r.returnNo,
      total: n(r.total),
      createdAt: r.createdAt,
      status: r.status,
    })),
  };
}

export type SerializedInvoice = ReturnType<typeof serializeInvoice>;

export async function loadInvoice(storeId: string, id: string) {
  return prisma.invoice.findFirst({ where: { id, storeId }, include: invoiceInclude });
}
