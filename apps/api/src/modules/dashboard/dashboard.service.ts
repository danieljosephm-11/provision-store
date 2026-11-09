import { prisma } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';
import { round2 } from '@ps/shared';

const n = (v: unknown) => Number(v ?? 0);

function parseRange(query: Record<string, unknown>) {
  const now = new Date();
  const from = query.from
    ? new Date(String(query.from))
    : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const to = query.to ? new Date(String(query.to)) : new Date(now);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw badRequest('Invalid date range');
  }
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  if (from > to) throw badRequest('The start date must be before the end date');
  return { from, to };
}

export async function dashboard(storeId: string, query: Record<string, unknown>) {
  const { from, to } = parseRange(query);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [
    periodSales,
    todaySales,
    profit,
    trends,
    topProducts,
    topCustomers,
    categorySales,
    paymentRows,
    stockCounts,
    expiring,
    receivables,
    payables,
    activeProducts,
    activeCustomers,
    recentInvoices,
    expenses,
  ] = await Promise.all([
    prisma.$queryRaw<{ invoices: bigint; total: string; due: string; tax: string }[]>`
      SELECT COUNT(*)::bigint AS invoices,
             COALESCE(SUM("grandTotal"), 0)::text AS total,
             COALESCE(SUM("balanceDue"), 0)::text AS due,
             COALESCE(SUM("cgst" + "sgst" + "igst" + "cess"), 0)::text AS tax
      FROM "Invoice"
      WHERE "storeId" = ${storeId}::uuid AND "status" <> 'VOID'
        AND "createdAt" >= ${from} AND "createdAt" <= ${to}
    `,
    prisma.$queryRaw<{ invoices: bigint; total: string }[]>`
      SELECT COUNT(*)::bigint AS invoices, COALESCE(SUM("grandTotal"), 0)::text AS total
      FROM "Invoice"
      WHERE "storeId" = ${storeId}::uuid AND "status" <> 'VOID'
        AND "createdAt" >= ${todayStart} AND "createdAt" <= ${todayEnd}
    `,
    prisma.$queryRaw<{ revenue: string; cogs: string }[]>`
      SELECT COALESCE(SUM(i."taxableAmount"), 0)::text AS revenue,
             COALESCE(SUM(i."costAtSale" * i."quantity"), 0)::text AS cogs
      FROM "InvoiceItem" i
      JOIN "Invoice" v ON v."id" = i."invoiceId"
      WHERE v."storeId" = ${storeId}::uuid AND v."status" <> 'VOID'
        AND v."createdAt" >= ${from} AND v."createdAt" <= ${to}
    `,
    prisma.$queryRaw<{ day: string; total: string; invoices: bigint }[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
             COALESCE(SUM("grandTotal"), 0)::text AS total,
             COUNT(*)::bigint AS invoices
      FROM "Invoice"
      WHERE "storeId" = ${storeId}::uuid AND "status" <> 'VOID'
        AND "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY day ORDER BY day ASC
    `,
    prisma.$queryRaw<
      { name: string; quantity: string; revenue: string; profit: string }[]
    >`
      SELECT i."productName" AS name,
             COALESCE(SUM(i."quantity"), 0)::text AS quantity,
             COALESCE(SUM(i."lineTotal"), 0)::text AS revenue,
             COALESCE(SUM(i."taxableAmount" - i."costAtSale" * i."quantity"), 0)::text AS profit
      FROM "InvoiceItem" i
      JOIN "Invoice" v ON v."id" = i."invoiceId"
      WHERE v."storeId" = ${storeId}::uuid AND v."status" <> 'VOID'
        AND v."createdAt" >= ${from} AND v."createdAt" <= ${to}
      GROUP BY i."productName"
      ORDER BY revenue DESC
      LIMIT 8
    `,
    prisma.$queryRaw<{ name: string; total: string; invoices: bigint }[]>`
      SELECT c."name" AS name,
             COALESCE(SUM(v."grandTotal"), 0)::text AS total,
             COUNT(*)::bigint AS invoices
      FROM "Invoice" v
      JOIN "Customer" c ON c."id" = v."customerId"
      WHERE v."storeId" = ${storeId}::uuid AND v."status" <> 'VOID'
        AND v."createdAt" >= ${from} AND v."createdAt" <= ${to}
      GROUP BY c."name"
      ORDER BY total DESC
      LIMIT 6
    `,
    prisma.$queryRaw<{ name: string; total: string }[]>`
      SELECT COALESCE(c."name", 'Uncategorised') AS name,
             COALESCE(SUM(i."lineTotal"), 0)::text AS total
      FROM "InvoiceItem" i
      JOIN "Invoice" v ON v."id" = i."invoiceId"
      LEFT JOIN "Product" p ON p."id" = i."productId"
      LEFT JOIN "Category" c ON c."id" = p."categoryId"
      WHERE v."storeId" = ${storeId}::uuid AND v."status" <> 'VOID'
        AND v."createdAt" >= ${from} AND v."createdAt" <= ${to}
      GROUP BY COALESCE(c."name", 'Uncategorised')
      ORDER BY total DESC
      LIMIT 8
    `,
    prisma.$queryRaw<{ method: string; direction: string; total: string }[]>`
      SELECT "method"::text AS method, "direction"::text AS direction, COALESCE(SUM("amount"), 0)::text AS total
      FROM "Payment"
      WHERE "storeId" = ${storeId}::uuid AND "receivedAt" >= ${from} AND "receivedAt" <= ${to}
      GROUP BY "method", "direction"
    `,
    prisma.$queryRaw<{ low: bigint; out: bigint }[]>`
      SELECT
        COUNT(*) FILTER (WHERE i."quantity" > 0 AND i."quantity" <= p."minStock")::bigint AS low,
        COUNT(*) FILTER (WHERE i."quantity" IS NULL OR i."quantity" <= 0)::bigint AS out
      FROM "Product" p
      LEFT JOIN "Inventory" i ON i."productId" = p."id"
      WHERE p."storeId" = ${storeId}::uuid AND p."deletedAt" IS NULL AND p."status" = 'ACTIVE'
    `,
    prisma.$queryRaw<{ count: bigint; value: string }[]>`
      SELECT COUNT(*)::bigint AS count, COALESCE(SUM(b."quantity" * b."purchasePrice"), 0)::text AS value
      FROM "ProductBatch" b
      JOIN "Product" p ON p."id" = b."productId"
      WHERE p."storeId" = ${storeId}::uuid AND p."deletedAt" IS NULL
        AND b."expiryDate" IS NOT NULL AND b."expiryDate" <= ${new Date(Date.now() + 30 * 86_400_000)}
        AND b."quantity" > 0
    `,
    prisma.$queryRaw<{ total: string; customers: bigint }[]>`
      SELECT COALESCE(SUM(l."balanceAfter"), 0)::text AS total, COUNT(*)::bigint AS customers
      FROM (
        SELECT DISTINCT ON ("customerId") "customerId", "balanceAfter"
        FROM "CustomerLedger" WHERE "storeId" = ${storeId}::uuid
        ORDER BY "customerId", "seq" DESC
      ) l
      JOIN "Customer" c ON c."id" = l."customerId"
      WHERE c."deletedAt" IS NULL AND c."isActive" = true AND l."balanceAfter" > 0
    `,
    prisma.$queryRaw<{ total: string; suppliers: bigint }[]>`
      SELECT COALESCE(SUM(l."balanceAfter"), 0)::text AS total, COUNT(*)::bigint AS suppliers
      FROM (
        SELECT DISTINCT ON ("supplierId") "supplierId", "balanceAfter"
        FROM "SupplierLedger" WHERE "storeId" = ${storeId}::uuid
        ORDER BY "supplierId", "seq" DESC
      ) l
      JOIN "Supplier" s ON s."id" = l."supplierId"
      WHERE s."deletedAt" IS NULL AND s."isActive" = true AND l."balanceAfter" > 0
    `,
    prisma.product.count({ where: { storeId, deletedAt: null, status: 'ACTIVE' } }),
    prisma.customer.count({ where: { storeId, deletedAt: null, isActive: true } }),
    prisma.invoice.findMany({
      where: { storeId, status: { not: 'VOID' } },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true,
        invoiceNo: true,
        customerName: true,
        grandTotal: true,
        paymentStatus: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.expense.aggregate({
      where: { storeId, status: 'ACTIVE', expenseDate: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
  ]);

  const sales = periodSales[0];
  const todayRow = todaySales[0];
  const profitRow = profit[0];
  const revenue = n(profitRow?.revenue);
  const cogs = n(profitRow?.cogs);
  const tax = n(sales?.tax);
  const total = n(sales?.total);
  const expenseTotal = round2(n(expenses._sum.amount));

  return {
    range: { from, to },
    today: {
      invoices: Number(todayRow?.invoices ?? 0),
      sales: n(todayRow?.total),
      averageBill: Number(todayRow?.invoices ?? 0)
        ? round2(n(todayRow?.total) / Number(todayRow?.invoices))
        : 0,
    },
    period: {
      invoices: Number(sales?.invoices ?? 0),
      sales: total,
      tax,
      averageBill: Number(sales?.invoices ?? 0) ? round2(total / Number(sales?.invoices)) : 0,
      revenue,
      cogs: round2(cogs),
      grossProfit: round2(revenue - cogs),
      grossMargin: revenue > 0 ? round2(((revenue - cogs) / revenue) * 100) : 0,
      expenses: expenseTotal,
      netProfit: round2(revenue - cogs - expenseTotal),
      outstanding: n(sales?.due),
    },
    receivables: {
      total: n(receivables[0]?.total),
      customers: Number(receivables[0]?.customers ?? 0),
    },
    payables: {
      total: n(payables[0]?.total),
      suppliers: Number(payables[0]?.suppliers ?? 0),
    },
    counts: {
      products: activeProducts,
      customers: activeCustomers,
      lowStock: Number(stockCounts[0]?.low ?? 0),
      outOfStock: Number(stockCounts[0]?.out ?? 0),
      expiring: Number(expiring[0]?.count ?? 0),
      expiringValue: n(expiring[0]?.value),
    },
    trends: trends.map((row) => ({ day: row.day, total: n(row.total), invoices: Number(row.invoices) })),
    topProducts: topProducts.map((row) => ({
      name: row.name,
      quantity: n(row.quantity),
      revenue: n(row.revenue),
      profit: round2(n(row.profit)),
    })),
    topCustomers: topCustomers.map((row) => ({
      name: row.name,
      total: n(row.total),
      invoices: Number(row.invoices),
    })),
    categorySales: categorySales.map((row) => ({ name: row.name, total: n(row.total) })),
    paymentBreakdown: paymentRows.map((row) => ({
      method: row.method,
      direction: row.direction,
      total: n(row.total),
    })),
    recentInvoices: recentInvoices.map((invoice) => ({
      ...invoice,
      grandTotal: n(invoice.grandTotal),
    })),
  };
}
