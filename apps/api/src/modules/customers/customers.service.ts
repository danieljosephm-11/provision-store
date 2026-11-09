import type { Request } from 'express';
import { Prisma, type CustomerSegment } from '@prisma/client';
import { GSTIN_REGEX, INDIAN_MOBILE_REGEX, round2 } from '@ps/shared';
import type {
  customerSchema,
  customerPaymentSchema,
  CustomerActivityInput,
  CustomerActivityUpdateInput,
} from '@ps/shared';
import type { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { pageMeta, parsePagination } from '../../lib/pagination';
import { writeAudit } from '../../lib/audit';
import { addCustomerLedger } from '../../lib/ledger';

const n = (v: unknown) => Number(v ?? 0);

type CustomerInput = z.infer<typeof customerSchema>;
type CustomerPaymentInput = z.infer<typeof customerPaymentSchema>;

async function nextCustomerCode(tx: Prisma.TransactionClient, storeId: string): Promise<string> {
  await tx.$executeRaw`
    INSERT INTO "StoreSetting" ("id","storeId","key","value")
    VALUES (${randomUUID()}::uuid, ${storeId}::uuid, 'customer_seq', '0'::jsonb)
    ON CONFLICT ("storeId","key") DO NOTHING
  `;
  const rows = await tx.$queryRaw<{ value: string }[]>`
    SELECT "value"::text AS value FROM "StoreSetting"
    WHERE "storeId" = ${storeId}::uuid AND "key" = 'customer_seq'
    FOR UPDATE
  `;
  const current = Number(rows[0]?.value ?? 0);
  const next = current + 1;
  await tx.$executeRaw`
    UPDATE "StoreSetting" SET "value" = to_jsonb(${next}::int)
    WHERE "storeId" = ${storeId}::uuid AND "key" = 'customer_seq'
  `;
  return `CUS${String(next).padStart(5, '0')}`;
}

const listInclude = {
  addresses: { where: { isDefault: true }, take: 1 },
  ledger: { orderBy: { seq: 'desc' }, take: 1, select: { balanceAfter: true, entryDate: true } },
  _count: { select: { invoices: true } },
} satisfies Prisma.CustomerInclude;

function serializeCustomer(
  customer: Prisma.CustomerGetPayload<{ include: typeof listInclude }>,
) {
  const address = customer.addresses[0] ?? null;
  const creditLimit = n(customer.creditLimit);
  const outstanding = n(customer.ledger[0]?.balanceAfter ?? 0);
  return {
    id: customer.id,
    code: customer.code,
    name: customer.name,
    mobile: customer.mobile,
    email: customer.email,
    gstin: customer.gstin,
    creditLimit,
    creditDays: customer.creditDays,
    loyaltyPoints: customer.loyaltyPoints,
    segment: customer.segment,
    totalPurchases: n(customer.totalPurchases),
    totalSpent: n(customer.totalSpent),
    lastPurchaseAt: customer.lastPurchaseAt,
    birthday: dateOnlyValue(customer.birthday),
    anniversary: dateOnlyValue(customer.anniversary),
    tags: customer.tags,
    outstanding,
    availableCredit: Math.max(0, round2(creditLimit - outstanding)),
    address,
    notes: customer.notes,
    isActive: customer.isActive,
    invoiceCount: customer._count.invoices,
    createdAt: customer.createdAt,
  };
}

function dateOnlyValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export function deriveSegment(input: {
  totalPurchases: number;
  totalSpent: number;
  lastPurchaseAt: Date | null;
}): CustomerSegment {
  if (input.totalPurchases <= 0) return 'NEW';
  if (input.lastPurchaseAt && daysBetween(input.lastPurchaseAt, new Date()) > 90) return 'INACTIVE';
  if (input.totalSpent >= 20000) return 'HIGH_VALUE';
  if (input.totalSpent >= 5000 || input.totalPurchases >= 6) return 'LOYAL';
  return 'REGULAR';
}

export async function listCustomers(storeId: string, query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const search = String(query.search ?? '').trim();
  const segment = query.segment ? (String(query.segment) as CustomerSegment) : undefined;
  const tag = query.tag ? String(query.tag) : undefined;
  const hasDues = query.hasDues === 'true';
  const includeInactive = query.includeInactive === 'true';

  const where: Prisma.CustomerWhereInput = {
    storeId,
    ...(includeInactive ? {} : { isActive: true, deletedAt: null }),
    ...(segment ? { segment } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { mobile: { contains: search } },
            { email: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
            { gstin: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: listInclude,
      orderBy: { [hasDues ? 'updatedAt' : 'name']: hasDues ? 'desc' : 'asc' },
      skip,
      take,
    }),
    prisma.customer.count({ where }),
  ]);

  let items = rows.map(serializeCustomer);
  if (hasDues) items = items.filter((c) => c.outstanding > 0);
  return { items, meta: pageMeta(hasDues ? items.length : total, page, pageSize) };
}

export async function getCustomer(storeId: string, id: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, storeId, deletedAt: null },
    include: {
      addresses: { orderBy: { isDefault: 'desc' } },
      ledger: { orderBy: { seq: 'desc' }, take: 25 },
      invoices: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          invoiceNo: true,
          grandTotal: true,
          balanceDue: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
        },
      },
      loyaltyTx: { orderBy: { createdAt: 'desc' }, take: 20 },
      payments: { orderBy: { paidAt: 'desc' }, take: 20 },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: { user: { select: { id: true, name: true } } },
      },
      campaignRecipients: {
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              channel: true,
              status: true,
              message: true,
              launchedAt: true,
            },
          },
        },
      },
    },
  });
  if (!customer) throw notFound('Customer');

  const since = new Date();
  since.setDate(1);
  since.setHours(0, 0, 0, 0);
  since.setMonth(since.getMonth() - 5);

  const [outstandingRow, topItems, openFollowUp, returnCount, spendRows] = await Promise.all([
    prisma.customerLedger.findFirst({
      where: { customerId: id },
      orderBy: { seq: 'desc' },
      select: { balanceAfter: true },
    }),
    prisma.invoiceItem.groupBy({
      by: ['productId'],
      where: { invoice: { storeId, customerId: id, status: 'COMPLETED' } },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: 3,
    }),
    prisma.customerActivity.findFirst({
      where: { customerId: id, type: 'FOLLOW_UP', completedAt: null },
      orderBy: { dueAt: 'asc' },
      select: { id: true, subject: true, dueAt: true },
    }),
    prisma.saleReturn.count({ where: { storeId, customerId: id, status: 'COMPLETED' } }),
    prisma.invoice.findMany({
      where: { storeId, customerId: id, status: 'COMPLETED', createdAt: { gte: since } },
      select: { createdAt: true, grandTotal: true },
    }),
  ]);

  const productIds = topItems.map((item) => item.productId).filter((value): value is string => !!value);
  const productRows = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, category: { select: { name: true } } },
      })
    : [];
  const productMap = new Map(productRows.map((product) => [product.id, product]));

  const monthlySpend: { month: string; total: number }[] = [];
  for (let index = 0; index < 6; index += 1) {
    const month = new Date(since.getFullYear(), since.getMonth() + index, 1);
    monthlySpend.push({
      month: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`,
      total: 0,
    });
  }
  for (const row of spendRows) {
    const key = `${row.createdAt.getFullYear()}-${String(row.createdAt.getMonth() + 1).padStart(2, '0')}`;
    const bucket = monthlySpend.find((entry) => entry.month === key);
    if (bucket) bucket.total = round2(bucket.total + n(row.grandTotal));
  }

  const outstanding = n(outstandingRow?.balanceAfter);
  const totalSpent = n(customer.totalSpent);
  const creditLimit = n(customer.creditLimit);

  return {
    id: customer.id,
    code: customer.code,
    name: customer.name,
    mobile: customer.mobile,
    email: customer.email,
    gstin: customer.gstin,
    creditLimit,
    creditDays: customer.creditDays,
    loyaltyPoints: customer.loyaltyPoints,
    segment: customer.segment,
    totalPurchases: n(customer.totalPurchases),
    totalSpent,
    lastPurchaseAt: customer.lastPurchaseAt,
    birthday: dateOnlyValue(customer.birthday),
    anniversary: dateOnlyValue(customer.anniversary),
    tags: customer.tags,
    notes: customer.notes,
    isActive: customer.isActive,
    createdAt: customer.createdAt,
    outstanding,
    availableCredit: Math.max(0, round2(creditLimit - outstanding)),
    addresses: customer.addresses,
    ledger: customer.ledger.map((entry) => ({
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
    invoices: customer.invoices.map((invoice) => ({
      ...invoice,
      grandTotal: n(invoice.grandTotal),
      balanceDue: n(invoice.balanceDue),
    })),
    loyaltyTransactions: customer.loyaltyTx,
    payments: customer.payments.map((payment) => ({ ...payment, amount: n(payment.amount) })),
    activities: customer.activities.map(serializeActivity),
    campaigns: customer.campaignRecipients.map((recipient) => ({
      id: recipient.id,
      status: recipient.status,
      sentAt: recipient.sentAt,
      campaign: {
        ...recipient.campaign,
        message: renderCampaignMessage(recipient.campaign.message, customer),
      },
    })),
    insights: {
      averageOrderValue:
        n(customer.totalPurchases) > 0 ? round2(totalSpent / n(customer.totalPurchases)) : 0,
      daysSinceLastPurchase: customer.lastPurchaseAt
        ? daysBetween(customer.lastPurchaseAt, new Date())
        : null,
      creditUtilization: creditLimit > 0 ? Math.min(1, outstanding / creditLimit) : 0,
      favouriteProducts: topItems.map((item) => {
        const product = item.productId ? productMap.get(item.productId) : undefined;
        return {
          productId: item.productId,
          name: product?.name ?? 'Deleted product',
          category: product?.category?.name ?? null,
          quantity: n(item._sum.quantity),
          revenue: n(item._sum.lineTotal),
        };
      }),
      openFollowUp,
      returnCount,
      monthlySpend,
    },
  };
}

type ActivityRow = Prisma.CustomerActivityGetPayload<{
  include: { user: { select: { id: true; name: true } } };
}>;

export function serializeActivity(activity: ActivityRow) {
  return {
    id: activity.id,
    type: activity.type,
    subject: activity.subject,
    body: activity.body,
    dueAt: activity.dueAt,
    completedAt: activity.completedAt,
    createdAt: activity.createdAt,
    user: activity.user,
  };
}

/** Replace the merge fields understood by campaign messages. */
export function renderCampaignMessage(
  template: string,
  customer: { name: string; loyaltyPoints: number },
  extras: { storeName?: string; outstanding?: number } = {},
) {
  const firstName = customer.name.trim().split(/\s+/)[0] ?? customer.name;
  return template
    .replaceAll('{name}', customer.name)
    .replaceAll('{firstName}', firstName)
    .replaceAll('{points}', String(customer.loyaltyPoints))
    .replaceAll('{store}', extras.storeName ?? 'our store')
    .replaceAll('{outstanding}', (extras.outstanding ?? 0).toFixed(2));
}

export async function createCustomer(
  storeId: string,
  userId: string,
  input: CustomerInput,
  req: Request,
) {
  const duplicate = await prisma.customer.findFirst({ where: { storeId, mobile: input.mobile } });
  if (duplicate) throw conflict('A customer with this mobile number already exists');

  const customer = await prisma.$transaction(async (tx) => {
    const code = await nextCustomerCode(tx, storeId);
    const created = await tx.customer.create({
      data: {
        storeId,
        code,
        name: input.name,
        mobile: input.mobile,
        email: input.email ?? null,
        gstin: input.gstin ?? null,
        creditLimit: input.creditLimit,
        creditDays: input.creditDays,
        notes: input.notes ?? null,
        birthday: toDateOnly(input.birthday),
        anniversary: toDateOnly(input.anniversary),
        tags: input.tags ?? [],
        isActive: input.isActive,
        ...(input.address
          ? {
              addresses: {
                create: {
                  label: 'Primary',
                  line1: input.address.line1,
                  line2: input.address.line2 ?? null,
                  city: input.address.city ?? null,
                  stateCode: input.address.stateCode ?? null,
                  pincode: input.address.pincode ?? null,
                  isDefault: true,
                },
              },
            }
          : {}),
      },
      include: listInclude,
    });
    return created;
  });

  await writeAudit({
    storeId,
    userId,
    action: 'CUSTOMER_CREATED',
    entityType: 'Customer',
    entityId: customer.id,
    after: { name: customer.name, mobile: customer.mobile, code: customer.code },
    req,
  });

  return serializeCustomer(customer);
}

export async function updateCustomer(
  storeId: string,
  userId: string,
  permissions: string[],
  id: string,
  input: Partial<CustomerInput>,
  req: Request,
) {
  const before = await prisma.customer.findFirst({ where: { id, storeId, deletedAt: null } });
  if (!before) throw notFound('Customer');

  if (input.creditLimit !== undefined && n(input.creditLimit) !== n(before.creditLimit)) {
    if (!permissions.includes('customer.credit.manage')) {
      throw forbidden('You do not have permission to change credit limits');
    }
  }
  if (input.mobile && input.mobile !== before.mobile) {
    const duplicate = await prisma.customer.findFirst({
      where: { storeId, mobile: input.mobile, id: { not: id } },
    });
    if (duplicate) throw conflict('A customer with this mobile number already exists');
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.address) {
      await tx.customerAddress.deleteMany({ where: { customerId: id } });
      await tx.customerAddress.create({
        data: {
          customerId: id,
          label: 'Primary',
          line1: input.address.line1,
          line2: input.address.line2 ?? null,
          city: input.address.city ?? null,
          stateCode: input.address.stateCode ?? null,
          pincode: input.address.pincode ?? null,
          isDefault: true,
        },
      });
    }
    return tx.customer.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.mobile !== undefined ? { mobile: input.mobile } : {}),
        ...(input.email !== undefined ? { email: input.email ?? null } : {}),
        ...(input.gstin !== undefined ? { gstin: input.gstin ?? null } : {}),
        ...(input.creditLimit !== undefined ? { creditLimit: input.creditLimit } : {}),
        ...(input.creditDays !== undefined ? { creditDays: input.creditDays } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        ...(input.birthday !== undefined ? { birthday: toDateOnly(input.birthday) } : {}),
        ...(input.anniversary !== undefined ? { anniversary: toDateOnly(input.anniversary) } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: listInclude,
    });
  });

  await writeAudit({
    storeId,
    userId,
    action: 'CUSTOMER_UPDATED',
    entityType: 'Customer',
    entityId: id,
    before: {
      name: before.name,
      mobile: before.mobile,
      creditLimit: n(before.creditLimit),
      isActive: before.isActive,
    },
    after: {
      name: updated.name,
      mobile: updated.mobile,
      creditLimit: n(updated.creditLimit),
      isActive: updated.isActive,
    },
    req,
  });

  return serializeCustomer(updated);
}

export async function deactivateCustomer(storeId: string, userId: string, id: string, req: Request) {
  const customer = await prisma.customer.findFirst({ where: { id, storeId, deletedAt: null } });
  if (!customer) throw notFound('Customer');
  const outstanding = n(
    (
      await prisma.customerLedger.findFirst({
        where: { customerId: id },
        orderBy: { seq: 'desc' },
        select: { balanceAfter: true },
      })
    )?.balanceAfter,
  );
  if (outstanding > 0) {
    throw conflict(`Settle the outstanding balance of ${outstanding.toFixed(2)} before deactivating`);
  }
  await prisma.customer.update({ where: { id }, data: { isActive: false } });
  await writeAudit({
    storeId,
    userId,
    action: 'CUSTOMER_DEACTIVATED',
    entityType: 'Customer',
    entityId: id,
    before: { name: customer.name, isActive: customer.isActive },
    req,
  });
  return { message: 'Customer deactivated' };
}

export async function recordCustomerPayment(
  storeId: string,
  userId: string,
  customerId: string,
  input: CustomerPaymentInput,
  req: Request,
) {
  const payment = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Customer" WHERE "id" = ${customerId}::uuid AND "storeId" = ${storeId}::uuid FOR UPDATE`;
    const customer = await tx.customer.findFirst({ where: { id: customerId, storeId, deletedAt: null } });
    if (!customer) throw notFound('Customer');
    if (!customer.isActive) throw badRequest('This customer is inactive');

    const amount = round2(input.amount);
    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
    const record = await tx.customerPayment.create({
      data: {
        storeId,
        customerId,
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
        direction: 'IN',
        partyType: 'CUSTOMER',
        partyId: customerId,
        method: input.method,
        amount,
        reference: input.reference ?? null,
        notes: input.note ?? null,
        receivedAt: paidAt,
        createdBy: userId,
      },
    });
    await addCustomerLedger(tx, {
      storeId,
      customerId,
      type: 'PAYMENT',
      credit: amount,
      description: input.note ?? 'Customer payment',
      referenceType: 'CUSTOMER_PAYMENT',
      referenceId: record.id,
      createdBy: userId,
      entryDate: paidAt,
    });
    return record;
  });

  await writeAudit({
    storeId,
    userId,
    action: 'CUSTOMER_PAYMENT_RECORDED',
    entityType: 'CustomerPayment',
    entityId: payment.id,
    after: { customerId, amount: n(payment.amount), method: payment.method },
    req,
  });

  return { ...payment, amount: n(payment.amount) };
}

export async function customerLedger(
  storeId: string,
  customerId: string,
  query: Record<string, unknown>,
) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const customer = await prisma.customer.findFirst({ where: { id: customerId, storeId } });
  if (!customer) throw notFound('Customer');
  const [rows, total] = await Promise.all([
    prisma.customerLedger.findMany({
      where: { customerId },
      orderBy: { seq: 'desc' },
      skip,
      take,
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.customerLedger.count({ where: { customerId } }),
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

export async function outstandingSummary(storeId: string) {
  const rows = await prisma.$queryRaw<{ total: string; customers: bigint }[]>`
    SELECT COALESCE(SUM(l."balanceAfter"), 0)::text AS total,
           COUNT(*)::bigint AS customers
    FROM (
      SELECT DISTINCT ON ("customerId") "customerId", "balanceAfter"
      FROM "CustomerLedger"
      WHERE "storeId" = ${storeId}::uuid
      ORDER BY "customerId", "seq" DESC
    ) l
    JOIN "Customer" c ON c."id" = l."customerId"
    WHERE c."deletedAt" IS NULL AND c."isActive" = true AND l."balanceAfter" > 0
  `;
  const row = rows[0];
  return {
    totalOutstanding: Number(row?.total ?? 0),
    customersWithDues: Number(row?.customers ?? 0),
  };
}

// ── CRM: activity timeline, follow-ups, occasions, segments, import/export ──

export async function customerTimeline(
  storeId: string,
  customerId: string,
  query: Record<string, unknown>,
) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, storeId } });
  if (!customer) throw notFound('Customer');
  const limit = Math.min(200, Math.max(10, Number(query.limit ?? 60)));

  const [activities, invoices, payments, returns, loyalty] = await Promise.all([
    prisma.customerActivity.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.invoice.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, invoiceNo: true, grandTotal: true, status: true, paymentStatus: true, createdAt: true },
    }),
    prisma.customerPayment.findMany({
      where: { customerId },
      orderBy: { paidAt: 'desc' },
      take: limit,
      select: { id: true, amount: true, method: true, reference: true, paidAt: true },
    }),
    prisma.saleReturn.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, returnNo: true, total: true, reason: true, createdAt: true },
    }),
    prisma.loyaltyTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, type: true, points: true, note: true, createdAt: true },
    }),
  ]);

  type TimelineItem = {
    id: string;
    kind: 'ACTIVITY' | 'INVOICE' | 'PAYMENT' | 'RETURN' | 'LOYALTY';
    type: string;
    title: string;
    detail: string | null;
    amount: number | null;
    at: string;
    status: string | null;
    link: string | null;
    dueAt: string | null;
    completedAt: string | null;
    author: string | null;
  };

  const items: TimelineItem[] = [];
  for (const activity of activities) {
    items.push({
      id: `activity-${activity.id}`,
      kind: 'ACTIVITY',
      type: activity.type,
      title: activity.subject,
      detail: activity.body,
      amount: null,
      at: activity.createdAt.toISOString(),
      status: activity.completedAt ? 'COMPLETED' : activity.dueAt ? 'OPEN' : null,
      link: null,
      dueAt: activity.dueAt?.toISOString() ?? null,
      completedAt: activity.completedAt?.toISOString() ?? null,
      author: activity.user?.name ?? null,
    });
  }
  for (const invoice of invoices) {
    items.push({
      id: `invoice-${invoice.id}`,
      kind: 'INVOICE',
      type: 'INVOICE',
      title: `Invoice ${invoice.invoiceNo}`,
      detail: `${invoice.status} · ${invoice.paymentStatus}`,
      amount: n(invoice.grandTotal),
      at: invoice.createdAt.toISOString(),
      status: invoice.status,
      link: `/invoices/${invoice.id}`,
      dueAt: null,
      completedAt: null,
      author: null,
    });
  }
  for (const payment of payments) {
    items.push({
      id: `payment-${payment.id}`,
      kind: 'PAYMENT',
      type: 'PAYMENT',
      title: `Payment received · ${payment.method.replace(/_/g, ' ')}`,
      detail: payment.reference,
      amount: n(payment.amount),
      at: payment.paidAt.toISOString(),
      status: null,
      link: null,
      dueAt: null,
      completedAt: null,
      author: null,
    });
  }
  for (const entry of returns) {
    items.push({
      id: `return-${entry.id}`,
      kind: 'RETURN',
      type: 'RETURN',
      title: `Return ${entry.returnNo}`,
      detail: entry.reason,
      amount: n(entry.total),
      at: entry.createdAt.toISOString(),
      status: 'COMPLETED',
      link: null,
      dueAt: null,
      completedAt: null,
      author: null,
    });
  }
  for (const tx of loyalty) {
    items.push({
      id: `loyalty-${tx.id}`,
      kind: 'LOYALTY',
      type: tx.type,
      title: `${tx.points > 0 ? 'Earned' : 'Redeemed'} ${Math.abs(tx.points)} loyalty points`,
      detail: tx.note,
      amount: null,
      at: tx.createdAt.toISOString(),
      status: null,
      link: null,
      dueAt: null,
      completedAt: null,
      author: null,
    });
  }

  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { items: items.slice(0, limit) };
}

function parseDueAt(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest('Enter a valid follow-up date');
  return date;
}

export async function createActivity(
  storeId: string,
  userId: string,
  customerId: string,
  input: CustomerActivityInput,
  req: Request,
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!customer) throw notFound('Customer');
  const dueAt = parseDueAt(input.dueAt);
  if (input.type === 'FOLLOW_UP' && !dueAt) throw badRequest('Choose when the follow-up is due');

  const activity = await prisma.customerActivity.create({
    data: {
      storeId,
      customerId,
      type: input.type,
      subject: input.subject,
      body: input.body ?? null,
      dueAt,
      completedAt: input.completed ? new Date() : null,
      createdBy: userId,
    },
    include: { user: { select: { id: true, name: true } } },
  });

  await writeAudit({
    storeId,
    userId,
    action: 'CUSTOMER_ACTIVITY_LOGGED',
    entityType: 'CustomerActivity',
    entityId: activity.id,
    after: { customerId, type: activity.type, subject: activity.subject, dueAt },
    req,
  });

  return serializeActivity(activity);
}

export async function updateActivity(
  storeId: string,
  userId: string,
  customerId: string,
  activityId: string,
  input: CustomerActivityUpdateInput,
  req: Request,
) {
  const existing = await prisma.customerActivity.findFirst({
    where: { id: activityId, customerId, storeId },
  });
  if (!existing) throw notFound('Activity');
  const dueAt = input.dueAt !== undefined ? parseDueAt(input.dueAt) : undefined;
  if (input.type === 'FOLLOW_UP' && dueAt === null) throw badRequest('Choose when the follow-up is due');

  const activity = await prisma.customerActivity.update({
    where: { id: activityId },
    data: {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.body !== undefined ? { body: input.body ?? null } : {}),
      ...(dueAt !== undefined ? { dueAt } : {}),
      ...(input.completed !== undefined
        ? { completedAt: input.completed ? existing.completedAt ?? new Date() : null }
        : {}),
    },
    include: { user: { select: { id: true, name: true } } },
  });

  await writeAudit({
    storeId,
    userId,
    action: input.completed === true ? 'CUSTOMER_FOLLOWUP_COMPLETED' : 'CUSTOMER_ACTIVITY_UPDATED',
    entityType: 'CustomerActivity',
    entityId: activity.id,
    before: { subject: existing.subject, dueAt: existing.dueAt, completedAt: existing.completedAt },
    after: { subject: activity.subject, dueAt: activity.dueAt, completedAt: activity.completedAt },
    req,
  });

  return serializeActivity(activity);
}

export async function deleteActivity(
  storeId: string,
  userId: string,
  customerId: string,
  activityId: string,
  req: Request,
) {
  const existing = await prisma.customerActivity.findFirst({
    where: { id: activityId, customerId, storeId },
  });
  if (!existing) throw notFound('Activity');
  await prisma.customerActivity.delete({ where: { id: activityId } });
  await writeAudit({
    storeId,
    userId,
    action: 'CUSTOMER_ACTIVITY_DELETED',
    entityType: 'CustomerActivity',
    entityId: activityId,
    before: { customerId, type: existing.type, subject: existing.subject },
    req,
  });
  return { message: 'Activity removed' };
}

export async function listFollowUps(storeId: string, query: Record<string, unknown>) {
  const scope = String(query.scope ?? 'open');
  const today = startOfDay();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const base: Prisma.CustomerActivityWhereInput = {
    storeId,
    type: 'FOLLOW_UP',
    completedAt: null,
    dueAt: { not: null },
  };
  const where: Prisma.CustomerActivityWhereInput = {
    ...base,
    ...(scope === 'overdue' ? { dueAt: { lt: today } } : {}),
    ...(scope === 'today' ? { dueAt: { gte: today, lt: tomorrow } } : {}),
    ...(scope === 'upcoming' ? { dueAt: { gte: tomorrow } } : {}),
  };

  const [rows, overdue, dueToday, upcoming] = await Promise.all([
    prisma.customerActivity.findMany({
      where,
      orderBy: { dueAt: 'asc' },
      take: 200,
      include: {
        user: { select: { id: true, name: true } },
        customer: {
          select: { id: true, name: true, mobile: true, segment: true, totalSpent: true, tags: true },
        },
      },
    }),
    prisma.customerActivity.count({ where: { ...base, dueAt: { lt: today } } }),
    prisma.customerActivity.count({ where: { ...base, dueAt: { gte: today, lt: tomorrow } } }),
    prisma.customerActivity.count({ where: { ...base, dueAt: { gte: tomorrow } } }),
  ]);

  return {
    items: rows.map((row) => ({
      ...serializeActivity(row),
      customer: row.customer,
      overdue: !!row.dueAt && row.dueAt < today,
    })),
    counts: { overdue, today: dueToday, upcoming },
  };
}

export async function listOccasions(storeId: string) {
  const rows = await prisma.customer.findMany({
    where: {
      storeId,
      deletedAt: null,
      isActive: true,
      OR: [{ birthday: { not: null } }, { anniversary: { not: null } }],
    },
    select: {
      id: true,
      name: true,
      mobile: true,
      birthday: true,
      anniversary: true,
      segment: true,
      loyaltyPoints: true,
      totalSpent: true,
      tags: true,
    },
  });

  const today = startOfDay();
  const build = (
    customer: (typeof rows)[number],
    kind: 'BIRTHDAY' | 'ANNIVERSARY',
    date: Date | null,
  ) => {
    if (!date) return null;
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    let next = new Date(today.getFullYear(), month, day);
    if (next < today) next = new Date(today.getFullYear() + 1, month, day);
    const daysAway = Math.round((next.getTime() - today.getTime()) / 86_400_000);
    return {
      id: `${customer.id}-${kind}`,
      customerId: customer.id,
      name: customer.name,
      mobile: customer.mobile,
      kind,
      date: `${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      daysAway,
      segment: customer.segment,
      loyaltyPoints: customer.loyaltyPoints,
      totalSpent: n(customer.totalSpent),
      tags: customer.tags,
    };
  };

  const items = rows
    .flatMap((customer) => [
      build(customer, 'BIRTHDAY', customer.birthday),
      build(customer, 'ANNIVERSARY', customer.anniversary),
    ])
    .filter((item): item is NonNullable<typeof item> => !!item)
    .filter((item) => item.daysAway <= 45)
    .sort((a, b) => a.daysAway - b.daysAway);

  return { items };
}

export async function recalculateSegments(storeId: string, userId: string, req: Request) {
  const customers = await prisma.customer.findMany({
    where: { storeId, deletedAt: null },
    select: {
      id: true,
      name: true,
      segment: true,
      totalPurchases: true,
      totalSpent: true,
      lastPurchaseAt: true,
    },
  });

  const changes: { id: string; name: string; from: string; to: string }[] = [];
  for (const customer of customers) {
    const next = deriveSegment({
      totalPurchases: n(customer.totalPurchases),
      totalSpent: n(customer.totalSpent),
      lastPurchaseAt: customer.lastPurchaseAt,
    });
    if (next !== customer.segment) {
      changes.push({ id: customer.id, name: customer.name, from: customer.segment, to: next });
    }
  }

  if (changes.length > 0) {
    await prisma.$transaction(
      changes.map((change) =>
        prisma.customer.update({ where: { id: change.id }, data: { segment: change.to as CustomerSegment } }),
      ),
    );
    await writeAudit({
      storeId,
      userId,
      action: 'CUSTOMER_SEGMENTS_RECALCULATED',
      entityType: 'Customer',
      entityId: storeId,
      after: { updated: changes.length, changes: changes.slice(0, 100) },
      req,
    });
  }

  const grouped = await prisma.customer.groupBy({
    by: ['segment'],
    where: { storeId, deletedAt: null },
    _count: { _all: true },
  });

  return {
    updated: changes.length,
    changes: changes.slice(0, 100),
    segments: grouped.map((row) => ({ segment: row.segment, count: row._count._all })),
  };
}

const CSV_COLUMNS = [
  'code',
  'name',
  'mobile',
  'email',
  'gstin',
  'segment',
  'creditLimit',
  'creditDays',
  'loyaltyPoints',
  'totalPurchases',
  'totalSpent',
  'outstanding',
  'tags',
  'birthday',
  'anniversary',
  'lastPurchaseAt',
  'isActive',
  'createdAt',
] as const;

function csvCell(value: unknown) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function exportCustomersCsv(storeId: string) {
  const rows = await prisma.customer.findMany({
    where: { storeId, deletedAt: null },
    include: {
      ledger: { orderBy: { seq: 'desc' }, take: 1, select: { balanceAfter: true } },
    },
    orderBy: { name: 'asc' },
  });

  const lines = [CSV_COLUMNS.join(',')];
  for (const customer of rows) {
    lines.push(
      [
        customer.code,
        customer.name,
        customer.mobile,
        customer.email,
        customer.gstin,
        customer.segment,
        n(customer.creditLimit),
        customer.creditDays,
        customer.loyaltyPoints,
        n(customer.totalPurchases),
        n(customer.totalSpent),
        n(customer.ledger[0]?.balanceAfter),
        customer.tags.join('|'),
        dateOnlyValue(customer.birthday),
        dateOnlyValue(customer.anniversary),
        customer.lastPurchaseAt?.toISOString() ?? '',
        customer.isActive,
        customer.createdAt.toISOString(),
      ]
        .map(csvCell)
        .join(','),
    );
  }

  // UTF-8 BOM keeps Indian names and the currency symbols intact in Excel.
  return `\ufeff${lines.join('\r\n')}`;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((cell) => cell.trim() !== ''));
}

const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/[\s_-]+/g, '');

export async function importCustomersCsv(
  storeId: string,
  userId: string,
  csv: string,
  req: Request,
) {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw badRequest('The CSV needs a header row and at least one customer');
  if (rows.length > 2001) throw badRequest('Import at most 2,000 customers at a time');

  const header = (rows[0] ?? []).map(normalizeHeader);
  const column = (...names: string[]) => {
    for (const name of names) {
      const index = header.indexOf(normalizeHeader(name));
      if (index >= 0) return index;
    }
    return -1;
  };
  const indexes = {
    name: column('name'),
    mobile: column('mobile', 'phone'),
    email: column('email'),
    gstin: column('gstin', 'gst'),
    creditLimit: column('creditlimit'),
    creditDays: column('creditdays'),
    notes: column('notes'),
    tags: column('tags'),
    birthday: column('birthday', 'dob'),
    anniversary: column('anniversary'),
    line1: column('line1', 'address'),
    line2: column('line2'),
    city: column('city'),
    stateCode: column('statecode', 'state'),
    pincode: column('pincode', 'pin'),
  };
  if (indexes.name < 0 || indexes.mobile < 0) {
    throw badRequest('The CSV needs at least "name" and "mobile" columns');
  }

  const errors: { row: number; message: string }[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const value = (index: number) => (index >= 0 ? (row[index] ?? '').trim() : '');
    const rowNumber = rowIndex + 1;
    const name = value(indexes.name);
    const mobile = value(indexes.mobile).replace(/\D/g, '').slice(-10);

    if (!name) {
      errors.push({ row: rowNumber, message: 'Name is missing' });
      continue;
    }
    if (!INDIAN_MOBILE_REGEX.test(mobile)) {
      errors.push({ row: rowNumber, message: 'Mobile is not a valid 10-digit number' });
      continue;
    }

    const email = value(indexes.email) || null;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errors.push({ row: rowNumber, message: 'Email is not valid' });
      continue;
    }
    const gstinRaw = value(indexes.gstin).toUpperCase();
    if (gstinRaw && !GSTIN_REGEX.test(gstinRaw)) {
      errors.push({ row: rowNumber, message: 'GSTIN is not valid' });
      continue;
    }
    const creditLimitRaw = value(indexes.creditLimit);
    const creditLimit = creditLimitRaw === '' ? undefined : Number(creditLimitRaw);
    if (creditLimit !== undefined && (!Number.isFinite(creditLimit) || creditLimit < 0)) {
      errors.push({ row: rowNumber, message: 'Credit limit must be a positive number' });
      continue;
    }
    const creditDaysRaw = value(indexes.creditDays);
    const creditDays = creditDaysRaw === '' ? undefined : Number(creditDaysRaw);
    if (creditDays !== undefined && (!Number.isInteger(creditDays) || creditDays < 0 || creditDays > 365)) {
      errors.push({ row: rowNumber, message: 'Credit days must be between 0 and 365' });
      continue;
    }
    const birthday = value(indexes.birthday);
    const anniversary = value(indexes.anniversary);
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (birthday && !datePattern.test(birthday)) {
      errors.push({ row: rowNumber, message: 'Birthday must be YYYY-MM-DD' });
      continue;
    }
    if (anniversary && !datePattern.test(anniversary)) {
      errors.push({ row: rowNumber, message: 'Anniversary must be YYYY-MM-DD' });
      continue;
    }
    const tags = value(indexes.tags)
      .split(/[|;]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 20);
    const addressLine1 = value(indexes.line1);

    try {
      const existing = await prisma.customer.findFirst({ where: { storeId, mobile } });
      if (existing) {
        await prisma.$transaction(async (tx) => {
          await tx.customer.update({
            where: { id: existing.id },
            data: {
              name,
              email,
              ...(gstinRaw ? { gstin: gstinRaw } : {}),
              ...(creditLimit !== undefined ? { creditLimit } : {}),
              ...(creditDays !== undefined ? { creditDays } : {}),
              ...(value(indexes.notes) ? { notes: value(indexes.notes) } : {}),
              ...(tags.length > 0 ? { tags } : {}),
              ...(birthday ? { birthday: toDateOnly(birthday) } : {}),
              ...(anniversary ? { anniversary: toDateOnly(anniversary) } : {}),
            },
          });
          if (addressLine1) {
            await tx.customerAddress.deleteMany({ where: { customerId: existing.id } });
            await tx.customerAddress.create({
              data: {
                customerId: existing.id,
                label: 'Primary',
                line1: addressLine1,
                line2: value(indexes.line2) || null,
                city: value(indexes.city) || null,
                stateCode: value(indexes.stateCode) || null,
                pincode: value(indexes.pincode) || null,
                isDefault: true,
              },
            });
          }
        });
        updated += 1;
      } else {
        await prisma.$transaction(async (tx) => {
          const code = await nextCustomerCode(tx, storeId);
          await tx.customer.create({
            data: {
              storeId,
              code,
              name,
              mobile,
              email,
              gstin: gstinRaw || null,
              creditLimit: creditLimit ?? 0,
              creditDays: creditDays ?? 0,
              notes: value(indexes.notes) || null,
              tags,
              birthday: birthday ? toDateOnly(birthday) : null,
              anniversary: anniversary ? toDateOnly(anniversary) : null,
              ...(addressLine1
                ? {
                    addresses: {
                      create: {
                        label: 'Primary',
                        line1: addressLine1,
                        line2: value(indexes.line2) || null,
                        city: value(indexes.city) || null,
                        stateCode: value(indexes.stateCode) || null,
                        pincode: value(indexes.pincode) || null,
                        isDefault: true,
                      },
                    },
                  }
                : {}),
            },
          });
        });
        created += 1;
      }
    } catch {
      skipped += 1;
      if (errors.length < 50) errors.push({ row: rowNumber, message: 'Could not save this row' });
    }
  }

  await writeAudit({
    storeId,
    userId,
    action: 'CUSTOMERS_IMPORTED',
    entityType: 'Customer',
    entityId: storeId,
    after: { created, updated, skipped, errors: errors.length },
    req,
  });

  return { created, updated, skipped, errors };
}

