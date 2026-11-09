import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';
import { round2 } from '@ps/shared';

const n = (v: unknown) => Number(v ?? 0);

export const REPORT_KEYS = [
  'sales-summary',
  'sales-detailed',
  'sales-by-product',
  'sales-by-customer',
  'sales-by-category',
  'gst-summary',
  'gst-hsn',
  'profit',
  'inventory-valuation',
  'purchases',
  'expenses',
  'receivables-aging',
  'payments',
] as const;

export type ReportKey = (typeof REPORT_KEYS)[number];

export const REPORT_TITLES: Record<ReportKey, string> = {
  'sales-summary': 'Sales Summary',
  'sales-detailed': 'Sales Detail',
  'sales-by-product': 'Sales by Product',
  'sales-by-customer': 'Sales by Customer',
  'sales-by-category': 'Sales by Category',
  'gst-summary': 'GST Summary',
  'gst-hsn': 'GST HSN Summary',
  profit: 'Profit & Loss',
  'inventory-valuation': 'Inventory Valuation',
  purchases: 'Purchase Register',
  expenses: 'Expense Register',
  'receivables-aging': 'Receivables Ageing',
  payments: 'Payment Register',
};

export interface ReportColumn {
  key: string;
  label: string;
  type: 'text' | 'int' | 'money' | 'qty' | 'date' | 'percent';
  align?: 'left' | 'right';
}

export interface ReportResult {
  key: ReportKey;
  title: string;
  range: { from: string | null; to: string | null };
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, unknown>;
  summary?: { label: string; value: number | string }[];
}

const money = (key: string, label: string): ReportColumn => ({ key, label, type: 'money', align: 'right' });
const int = (key: string, label: string): ReportColumn => ({ key, label, type: 'int', align: 'right' });
const qty = (key: string, label: string): ReportColumn => ({ key, label, type: 'qty', align: 'right' });
const text = (key: string, label: string): ReportColumn => ({ key, label, type: 'text', align: 'left' });
const date = (key: string, label: string): ReportColumn => ({ key, label, type: 'date', align: 'left' });

export function isReportKey(value: string): value is ReportKey {
  return (REPORT_KEYS as readonly string[]).includes(value);
}

export function parseReportRange(query: Record<string, unknown>) {
  const now = new Date();
  const from = query.from
    ? new Date(String(query.from))
    : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = query.to ? new Date(String(query.to)) : now;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw badRequest('Invalid date range');
  }
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  if (from > to) throw badRequest('The start date must be before the end date');
  return { from, to };
}

type Ctx = { storeId: string; from: Date; to: Date; query: Record<string, unknown> };

// ── Sales summary ────────────────────────────────────────────────────
async function salesSummary({ storeId, from, to, query }: Ctx): Promise<ReportResult> {
  const grouped = String(query.groupBy ?? 'day') === 'month' ? 'month' : 'day';
  const rows = await prisma.$queryRaw<
    {
      period: string;
      invoices: bigint;
      gross: string;
      discount: string;
      taxable: string;
      tax: string;
      total: string;
      paid: string;
      due: string;
    }[]
  >(Prisma.sql`
    SELECT to_char(date_trunc(${grouped}, "createdAt"), ${grouped === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD'}) AS period,
           COUNT(*)::bigint AS invoices,
           COALESCE(SUM("subtotal"), 0)::text AS gross,
           COALESCE(SUM("itemDiscount" + "billDiscount" + "loyaltyDiscount"), 0)::text AS discount,
           COALESCE(SUM("taxableAmount"), 0)::text AS taxable,
           COALESCE(SUM("cgst" + "sgst" + "igst" + "cess"), 0)::text AS tax,
           COALESCE(SUM("grandTotal"), 0)::text AS total,
           COALESCE(SUM("amountPaid"), 0)::text AS paid,
           COALESCE(SUM("balanceDue"), 0)::text AS due
    FROM "Invoice"
    WHERE "storeId" = ${storeId}::uuid AND "status" <> 'VOID'
      AND "createdAt" >= ${from} AND "createdAt" <= ${to}
    GROUP BY 1
    ORDER BY 1 ASC
  `);
  const totalRow = rows.reduce(
    (acc, row) => ({
      invoices: acc.invoices + Number(row.invoices),
      gross: acc.gross + n(row.gross),
      discount: acc.discount + n(row.discount),
      taxable: acc.taxable + n(row.taxable),
      tax: acc.tax + n(row.tax),
      total: acc.total + n(row.total),
      paid: acc.paid + n(row.paid),
      due: acc.due + n(row.due),
    }),
    { invoices: 0, gross: 0, discount: 0, taxable: 0, tax: 0, total: 0, paid: 0, due: 0 },
  );
  return {
    key: 'sales-summary',
    title: REPORT_TITLES['sales-summary'],
    range: { from: from.toISOString(), to: to.toISOString() },
    columns: [
      text('period', grouped === 'month' ? 'Month' : 'Date'),
      int('invoices', 'Invoices'),
      money('gross', 'Gross'),
      money('discount', 'Discount'),
      money('taxable', 'Taxable'),
      money('tax', 'Tax'),
      money('total', 'Total'),
      money('paid', 'Paid'),
      money('due', 'Due'),
    ],
    rows: rows.map((row) => ({
      period: row.period,
      invoices: Number(row.invoices),
      gross: n(row.gross),
      discount: n(row.discount),
      taxable: n(row.taxable),
      tax: n(row.tax),
      total: n(row.total),
      paid: n(row.paid),
      due: n(row.due),
    })),
    totals: {
      invoices: totalRow.invoices,
      gross: round2(totalRow.gross),
      discount: round2(totalRow.discount),
      taxable: round2(totalRow.taxable),
      tax: round2(totalRow.tax),
      total: round2(totalRow.total),
      paid: round2(totalRow.paid),
      due: round2(totalRow.due),
    },
  };
}

// ── Sales detail (line items) ────────────────────────────────────────
async function salesDetailed({ storeId, from, to }: Ctx): Promise<ReportResult> {
  const rows = await prisma.$queryRaw<
    {
      invoice_no: string;
      created_at: Date;
      customer: string;
      product: string;
      sku: string | null;
      hsn: string | null;
      quantity: string;
      unit_price: string;
      discount: string;
      taxable: string;
      tax_rate: string;
      tax: string;
      total: string;
      cost: string;
      profit: string;
    }[]
  >`
    SELECT v."invoiceNo" AS invoice_no,
           v."createdAt" AS created_at,
           COALESCE(v."customerName", 'Walk-in') AS customer,
           i."productName" AS product,
           i."sku" AS sku,
           i."hsn" AS hsn,
           i."quantity"::text AS quantity,
           i."unitPrice"::text AS unit_price,
           (i."discountAmount" + i."billDiscountShare")::text AS discount,
           i."taxableAmount"::text AS taxable,
           i."taxRate"::text AS tax_rate,
           i."taxAmount"::text AS tax,
           i."lineTotal"::text AS total,
           (i."costAtSale" * i."quantity")::text AS cost,
           (i."taxableAmount" - i."costAtSale" * i."quantity")::text AS profit
    FROM "InvoiceItem" i
    JOIN "Invoice" v ON v."id" = i."invoiceId"
    WHERE v."storeId" = ${storeId}::uuid AND v."status" <> 'VOID'
      AND v."createdAt" >= ${from} AND v."createdAt" <= ${to}
    ORDER BY v."createdAt" DESC, i."id" ASC
    LIMIT 5000
  `;
  const mapped = rows.map((row) => ({
    invoiceNo: row.invoice_no,
    createdAt: row.created_at,
    customer: row.customer,
    product: row.product,
    sku: row.sku,
    hsn: row.hsn,
    quantity: n(row.quantity),
    unitPrice: n(row.unit_price),
    discount: n(row.discount),
    taxable: n(row.taxable),
    taxRate: n(row.tax_rate),
    tax: n(row.tax),
    total: n(row.total),
    cost: n(row.cost),
    profit: round2(n(row.profit)),
  }));
  return {
    key: 'sales-detailed',
    title: REPORT_TITLES['sales-detailed'],
    range: { from: from.toISOString(), to: to.toISOString() },
    columns: [
      text('invoiceNo', 'Invoice'),
      date('createdAt', 'Date'),
      text('customer', 'Customer'),
      text('product', 'Item'),
      text('sku', 'SKU'),
      text('hsn', 'HSN'),
      qty('quantity', 'Qty'),
      money('unitPrice', 'Rate'),
      money('discount', 'Disc'),
      money('taxable', 'Taxable'),
      money('taxRate', 'GST %'),
      money('tax', 'Tax'),
      money('total', 'Total'),
      money('profit', 'Profit'),
    ],
    rows: mapped,
    totals: {
      quantity: round2(mapped.reduce((s, r) => s + r.quantity, 0)),
      taxable: round2(mapped.reduce((s, r) => s + r.taxable, 0)),
      tax: round2(mapped.reduce((s, r) => s + r.tax, 0)),
      total: round2(mapped.reduce((s, r) => s + r.total, 0)),
      profit: round2(mapped.reduce((s, r) => s + r.profit, 0)),
    },
  };
}

// ── Sales by product ─────────────────────────────────────────────────
async function salesByProduct({ storeId, from, to }: Ctx): Promise<ReportResult> {
  const rows = await prisma.$queryRaw<
    {
      product: string;
      sku: string | null;
      quantity: string;
      revenue: string;
      discount: string;
      tax: string;
      cost: string;
      profit: string;
      invoices: bigint;
    }[]
  >`
    SELECT i."productName" AS product,
           MAX(i."sku") AS sku,
           COALESCE(SUM(i."quantity"), 0)::text AS quantity,
           COALESCE(SUM(i."lineTotal"), 0)::text AS revenue,
           COALESCE(SUM(i."discountAmount" + i."billDiscountShare"), 0)::text AS discount,
           COALESCE(SUM(i."taxAmount"), 0)::text AS tax,
           COALESCE(SUM(i."costAtSale" * i."quantity"), 0)::text AS cost,
           COALESCE(SUM(i."taxableAmount" - i."costAtSale" * i."quantity"), 0)::text AS profit,
           COUNT(DISTINCT i."invoiceId")::bigint AS invoices
    FROM "InvoiceItem" i
    JOIN "Invoice" v ON v."id" = i."invoiceId"
    WHERE v."storeId" = ${storeId}::uuid AND v."status" <> 'VOID'
      AND v."createdAt" >= ${from} AND v."createdAt" <= ${to}
    GROUP BY i."productName"
    ORDER BY revenue DESC
  `;
  const mapped = rows.map((row) => ({
    product: row.product,
    sku: row.sku,
    quantity: n(row.quantity),
    revenue: n(row.revenue),
    discount: n(row.discount),
    tax: n(row.tax),
    cost: n(row.cost),
    profit: round2(n(row.profit)),
    invoices: Number(row.invoices),
  }));
  return {
    key: 'sales-by-product',
    title: REPORT_TITLES['sales-by-product'],
    range: { from: from.toISOString(), to: to.toISOString() },
    columns: [
      text('product', 'Product'),
      text('sku', 'SKU'),
      qty('quantity', 'Qty Sold'),
      int('invoices', 'Invoices'),
      money('revenue', 'Revenue'),
      money('discount', 'Discount'),
      money('tax', 'Tax'),
      money('cost', 'Cost'),
      money('profit', 'Profit'),
    ],
    rows: mapped,
    totals: {
      quantity: round2(mapped.reduce((s, r) => s + r.quantity, 0)),
      revenue: round2(mapped.reduce((s, r) => s + r.revenue, 0)),
      tax: round2(mapped.reduce((s, r) => s + r.tax, 0)),
      cost: round2(mapped.reduce((s, r) => s + r.cost, 0)),
      profit: round2(mapped.reduce((s, r) => s + r.profit, 0)),
    },
  };
}

// ── Sales by customer ────────────────────────────────────────────────
async function salesByCustomer({ storeId, from, to }: Ctx): Promise<ReportResult> {
  const rows = await prisma.$queryRaw<
    {
      customer: string;
      mobile: string | null;
      invoices: bigint;
      revenue: string;
      paid: string;
      due: string;
    }[]
  >`
    SELECT COALESCE(c."name", COALESCE(v."customerName", 'Walk-in')) AS customer,
           c."mobile" AS mobile,
           COUNT(v."id")::bigint AS invoices,
           COALESCE(SUM(v."grandTotal"), 0)::text AS revenue,
           COALESCE(SUM(v."amountPaid"), 0)::text AS paid,
           COALESCE(SUM(v."balanceDue"), 0)::text AS due
    FROM "Invoice" v
    LEFT JOIN "Customer" c ON c."id" = v."customerId"
    WHERE v."storeId" = ${storeId}::uuid AND v."status" <> 'VOID'
      AND v."createdAt" >= ${from} AND v."createdAt" <= ${to}
    GROUP BY COALESCE(c."name", COALESCE(v."customerName", 'Walk-in')), c."mobile"
    ORDER BY revenue DESC
  `;
  const mapped = rows.map((row) => ({
    customer: row.customer,
    mobile: row.mobile,
    invoices: Number(row.invoices),
    revenue: n(row.revenue),
    paid: n(row.paid),
    due: n(row.due),
  }));
  return {
    key: 'sales-by-customer',
    title: REPORT_TITLES['sales-by-customer'],
    range: { from: from.toISOString(), to: to.toISOString() },
    columns: [
      text('customer', 'Customer'),
      text('mobile', 'Mobile'),
      int('invoices', 'Invoices'),
      money('revenue', 'Revenue'),
      money('paid', 'Paid'),
      money('due', 'Due'),
    ],
    rows: mapped,
    totals: {
      invoices: mapped.reduce((s, r) => s + r.invoices, 0),
      revenue: round2(mapped.reduce((s, r) => s + r.revenue, 0)),
      paid: round2(mapped.reduce((s, r) => s + r.paid, 0)),
      due: round2(mapped.reduce((s, r) => s + r.due, 0)),
    },
  };
}

// ── Sales by category ────────────────────────────────────────────────
async function salesByCategory({ storeId, from, to }: Ctx): Promise<ReportResult> {
  const rows = await prisma.$queryRaw<
    { category: string; quantity: string; revenue: string; cost: string; profit: string }[]
  >`
    SELECT COALESCE(cat."name", 'Uncategorised') AS category,
           COALESCE(SUM(i."quantity"), 0)::text AS quantity,
           COALESCE(SUM(i."lineTotal"), 0)::text AS revenue,
           COALESCE(SUM(i."costAtSale" * i."quantity"), 0)::text AS cost,
           COALESCE(SUM(i."taxableAmount" - i."costAtSale" * i."quantity"), 0)::text AS profit
    FROM "InvoiceItem" i
    JOIN "Invoice" v ON v."id" = i."invoiceId"
    LEFT JOIN "Product" p ON p."id" = i."productId"
    LEFT JOIN "Category" cat ON cat."id" = p."categoryId"
    WHERE v."storeId" = ${storeId}::uuid AND v."status" <> 'VOID'
      AND v."createdAt" >= ${from} AND v."createdAt" <= ${to}
    GROUP BY COALESCE(cat."name", 'Uncategorised')
    ORDER BY revenue DESC
  `;
  const mapped = rows.map((row) => ({
    category: row.category,
    quantity: n(row.quantity),
    revenue: n(row.revenue),
    cost: n(row.cost),
    profit: round2(n(row.profit)),
  }));
  return {
    key: 'sales-by-category',
    title: REPORT_TITLES['sales-by-category'],
    range: { from: from.toISOString(), to: to.toISOString() },
    columns: [
      text('category', 'Category'),
      qty('quantity', 'Qty Sold'),
      money('revenue', 'Revenue'),
      money('cost', 'Cost'),
      money('profit', 'Profit'),
    ],
    rows: mapped,
    totals: {
      quantity: round2(mapped.reduce((s, r) => s + r.quantity, 0)),
      revenue: round2(mapped.reduce((s, r) => s + r.revenue, 0)),
      cost: round2(mapped.reduce((s, r) => s + r.cost, 0)),
      profit: round2(mapped.reduce((s, r) => s + r.profit, 0)),
    },
  };
}

// ── GST summary (by rate) ────────────────────────────────────────────
async function gstSummary({ storeId, from, to }: Ctx): Promise<ReportResult> {
  const rows = await prisma.$queryRaw<
    {
      rate: string;
      taxable: string;
      cgst: string;
      sgst: string;
      igst: string;
      cess: string;
      tax: string;
      total: string;
    }[]
  >`
    SELECT i."taxRate"::text AS rate,
           COALESCE(SUM(i."taxableAmount"), 0)::text AS taxable,
           COALESCE(SUM(i."cgst"), 0)::text AS cgst,
           COALESCE(SUM(i."sgst"), 0)::text AS sgst,
           COALESCE(SUM(i."igst"), 0)::text AS igst,
           COALESCE(SUM(v."cess" * CASE WHEN v."subtotal" > 0 THEN i."taxableAmount" / v."subtotal" ELSE 0 END), 0)::text AS cess,
           COALESCE(SUM(i."taxAmount"), 0)::text AS tax,
           COALESCE(SUM(i."lineTotal"), 0)::text AS total
    FROM "InvoiceItem" i
    JOIN "Invoice" v ON v."id" = i."invoiceId"
    WHERE v."storeId" = ${storeId}::uuid AND v."status" <> 'VOID'
      AND v."createdAt" >= ${from} AND v."createdAt" <= ${to}
    GROUP BY i."taxRate"
    ORDER BY i."taxRate" ASC
  `;
  const mapped = rows.map((row) => ({
    rate: n(row.rate),
    taxable: n(row.taxable),
    cgst: n(row.cgst),
    sgst: n(row.sgst),
    igst: n(row.igst),
    cess: round2(n(row.cess)),
    tax: n(row.tax),
    total: n(row.total),
  }));
  return {
    key: 'gst-summary',
    title: REPORT_TITLES['gst-summary'],
    range: { from: from.toISOString(), to: to.toISOString() },
    columns: [
      { key: 'rate', label: 'GST Rate', type: 'percent', align: 'right' },
      money('taxable', 'Taxable Value'),
      money('cgst', 'CGST'),
      money('sgst', 'SGST'),
      money('igst', 'IGST'),
      money('cess', 'Cess'),
      money('tax', 'Total Tax'),
      money('total', 'Invoice Value'),
    ],
    rows: mapped,
    totals: {
      taxable: round2(mapped.reduce((s, r) => s + r.taxable, 0)),
      cgst: round2(mapped.reduce((s, r) => s + r.cgst, 0)),
      sgst: round2(mapped.reduce((s, r) => s + r.sgst, 0)),
      igst: round2(mapped.reduce((s, r) => s + r.igst, 0)),
      cess: round2(mapped.reduce((s, r) => s + r.cess, 0)),
      tax: round2(mapped.reduce((s, r) => s + r.tax, 0)),
      total: round2(mapped.reduce((s, r) => s + r.total, 0)),
    },
  };
}

// ── GST HSN summary ──────────────────────────────────────────────────
async function gstHsn({ storeId, from, to }: Ctx): Promise<ReportResult> {
  const rows = await prisma.$queryRaw<
    {
      hsn: string | null;
      rate: string;
      quantity: string;
      taxable: string;
      cgst: string;
      sgst: string;
      igst: string;
      tax: string;
      total: string;
    }[]
  >`
    SELECT i."hsn" AS hsn,
           i."taxRate"::text AS rate,
           COALESCE(SUM(i."quantity"), 0)::text AS quantity,
           COALESCE(SUM(i."taxableAmount"), 0)::text AS taxable,
           COALESCE(SUM(i."cgst"), 0)::text AS cgst,
           COALESCE(SUM(i."sgst"), 0)::text AS sgst,
           COALESCE(SUM(i."igst"), 0)::text AS igst,
           COALESCE(SUM(i."taxAmount"), 0)::text AS tax,
           COALESCE(SUM(i."lineTotal"), 0)::text AS total
    FROM "InvoiceItem" i
    JOIN "Invoice" v ON v."id" = i."invoiceId"
    WHERE v."storeId" = ${storeId}::uuid AND v."status" <> 'VOID'
      AND v."createdAt" >= ${from} AND v."createdAt" <= ${to}
    GROUP BY i."hsn", i."taxRate"
    ORDER BY i."hsn" ASC NULLS LAST, i."taxRate" ASC
  `;
  const mapped = rows.map((row) => ({
    hsn: row.hsn ?? '—',
    rate: n(row.rate),
    quantity: n(row.quantity),
    taxable: n(row.taxable),
    cgst: n(row.cgst),
    sgst: n(row.sgst),
    igst: n(row.igst),
    tax: n(row.tax),
    total: n(row.total),
  }));
  return {
    key: 'gst-hsn',
    title: REPORT_TITLES['gst-hsn'],
    range: { from: from.toISOString(), to: to.toISOString() },
    columns: [
      text('hsn', 'HSN'),
      { key: 'rate', label: 'GST Rate', type: 'percent', align: 'right' },
      qty('quantity', 'Qty'),
      money('taxable', 'Taxable Value'),
      money('cgst', 'CGST'),
      money('sgst', 'SGST'),
      money('igst', 'IGST'),
      money('tax', 'Total Tax'),
      money('total', 'Invoice Value'),
    ],
    rows: mapped,
    totals: {
      taxable: round2(mapped.reduce((s, r) => s + r.taxable, 0)),
      cgst: round2(mapped.reduce((s, r) => s + r.cgst, 0)),
      sgst: round2(mapped.reduce((s, r) => s + r.sgst, 0)),
      igst: round2(mapped.reduce((s, r) => s + r.igst, 0)),
      tax: round2(mapped.reduce((s, r) => s + r.tax, 0)),
      total: round2(mapped.reduce((s, r) => s + r.total, 0)),
    },
  };
}

// ── Profit & loss ────────────────────────────────────────────────────
async function profitReport({ storeId, from, to }: Ctx): Promise<ReportResult> {
  const [sales, expenses] = await Promise.all([
    prisma.$queryRaw<{ revenue: string; cogs: string; tax: string }[]>`
      SELECT COALESCE(SUM(i."taxableAmount"), 0)::text AS revenue,
             COALESCE(SUM(i."costAtSale" * i."quantity"), 0)::text AS cogs,
             COALESCE(SUM(i."taxAmount"), 0)::text AS tax
      FROM "InvoiceItem" i
      JOIN "Invoice" v ON v."id" = i."invoiceId"
      WHERE v."storeId" = ${storeId}::uuid AND v."status" <> 'VOID'
        AND v."createdAt" >= ${from} AND v."createdAt" <= ${to}
    `,
    prisma.$queryRaw<{ category: string; total: string }[]>`
      SELECT c."name" AS category, COALESCE(SUM(e."amount"), 0)::text AS total
      FROM "Expense" e
      JOIN "ExpenseCategory" c ON c."id" = e."categoryId"
      WHERE e."storeId" = ${storeId}::uuid AND e."status" = 'ACTIVE'
        AND e."expenseDate" >= ${from} AND e."expenseDate" <= ${to}
      GROUP BY c."name"
      ORDER BY total DESC
    `,
  ]);
  const revenue = n(sales[0]?.revenue);
  const cogs = n(sales[0]?.cogs);
  const tax = n(sales[0]?.tax);
  const grossProfit = round2(revenue - cogs);
  const expenseTotal = round2(expenses.reduce((s, row) => s + n(row.total), 0));
  const netProfit = round2(grossProfit - expenseTotal);
  const rows = [
    { head: 'Sales', category: 'Taxable sales', amount: round2(revenue + tax) },
    { head: 'Sales', category: 'Less: GST collected', amount: round2(-tax) },
    { head: 'Sales', category: 'Net revenue', amount: round2(revenue) },
    { head: 'Cost of goods', category: 'Cost of goods sold', amount: round2(-cogs) },
    { head: 'Profit', category: 'Gross profit', amount: grossProfit },
    ...expenses.map((row) => ({
      head: 'Expenses',
      category: row.category,
      amount: round2(-n(row.total)),
    })),
    { head: 'Profit', category: 'Net profit', amount: netProfit },
  ];
  return {
    key: 'profit',
    title: REPORT_TITLES.profit,
    range: { from: from.toISOString(), to: to.toISOString() },
    columns: [text('head', 'Section'), text('category', 'Line'), money('amount', 'Amount')],
    rows,
    totals: { revenue: round2(revenue), cogs: round2(cogs), grossProfit, expenses: expenseTotal, netProfit },
    summary: [
      { label: 'Net revenue', value: round2(revenue) },
      { label: 'Gross profit', value: grossProfit },
      { label: 'Gross margin', value: revenue > 0 ? `${round2((grossProfit / revenue) * 100)}%` : '0%' },
      { label: 'Operating expenses', value: expenseTotal },
      { label: 'Net profit', value: netProfit },
    ],
  };
}

// ── Inventory valuation ──────────────────────────────────────────────
async function inventoryValuation({ storeId }: Ctx): Promise<ReportResult> {
  const rows = await prisma.$queryRaw<
    {
      product: string;
      sku: string;
      category: string | null;
      unit: string;
      quantity: string;
      avg_cost: string;
      stock_value: string;
      selling_price: string;
      retail_value: string;
      min_stock: string;
    }[]
  >`
    SELECT p."name" AS product,
           p."sku" AS sku,
           cat."name" AS category,
           u."name" AS unit,
           COALESCE(i."quantity", 0)::text AS quantity,
           COALESCE(i."avgCost", p."purchasePrice", 0)::text AS avg_cost,
           (COALESCE(i."quantity", 0) * COALESCE(i."avgCost", p."purchasePrice", 0))::text AS stock_value,
           p."sellingPrice"::text AS selling_price,
           (COALESCE(i."quantity", 0) * p."sellingPrice")::text AS retail_value,
           p."minStock"::text AS min_stock
    FROM "Product" p
    JOIN "Unit" u ON u."id" = p."unitId"
    LEFT JOIN "Category" cat ON cat."id" = p."categoryId"
    LEFT JOIN "Inventory" i ON i."productId" = p."id"
    WHERE p."storeId" = ${storeId}::uuid AND p."deletedAt" IS NULL
    ORDER BY stock_value DESC
  `;
  const mapped = rows.map((row) => ({
    product: row.product,
    sku: row.sku,
    category: row.category ?? '—',
    unit: row.unit,
    quantity: n(row.quantity),
    avgCost: n(row.avg_cost),
    stockValue: n(row.stock_value),
    sellingPrice: n(row.selling_price),
    retailValue: n(row.retail_value),
    status: n(row.quantity) <= 0 ? 'Out of stock' : n(row.quantity) <= n(row.min_stock) ? 'Low' : 'OK',
  }));
  return {
    key: 'inventory-valuation',
    title: REPORT_TITLES['inventory-valuation'],
    range: { from: null, to: null },
    columns: [
      text('product', 'Product'),
      text('sku', 'SKU'),
      text('category', 'Category'),
      text('unit', 'Unit'),
      qty('quantity', 'Stock'),
      money('avgCost', 'Avg Cost'),
      money('stockValue', 'Stock Value'),
      money('sellingPrice', 'Selling Price'),
      money('retailValue', 'Retail Value'),
      text('status', 'Status'),
    ],
    rows: mapped,
    totals: {
      quantity: round2(mapped.reduce((s, r) => s + r.quantity, 0)),
      stockValue: round2(mapped.reduce((s, r) => s + r.stockValue, 0)),
      retailValue: round2(mapped.reduce((s, r) => s + r.retailValue, 0)),
    },
  };
}

// ── Purchases ────────────────────────────────────────────────────────
async function purchasesReport({ storeId, from, to }: Ctx): Promise<ReportResult> {
  const rows = await prisma.$queryRaw<
    {
      purchase_number: string;
      invoice_date: Date;
      supplier: string;
      supplier_invoice: string | null;
      status: string;
      subtotal: string;
      tax: string;
      total: string;
      paid: string;
      balance: string;
    }[]
  >`
    SELECT p."purchaseNumber" AS purchase_number,
           p."invoiceDate" AS invoice_date,
           s."name" AS supplier,
           p."supplierInvoiceNo" AS supplier_invoice,
           p."status"::text AS status,
           p."subtotal"::text AS subtotal,
           p."taxAmount"::text AS tax,
           p."total"::text AS total,
           p."paidAmount"::text AS paid,
           p."balanceAmount"::text AS balance
    FROM "Purchase" p
    JOIN "Supplier" s ON s."id" = p."supplierId"
    WHERE p."storeId" = ${storeId}::uuid
      AND p."invoiceDate" >= ${from} AND p."invoiceDate" <= ${to}
    ORDER BY p."invoiceDate" DESC, p."createdAt" DESC
  `;
  const mapped = rows.map((row) => ({
    purchaseNumber: row.purchase_number,
    invoiceDate: row.invoice_date,
    supplier: row.supplier,
    supplierInvoice: row.supplier_invoice,
    status: row.status,
    subtotal: n(row.subtotal),
    tax: n(row.tax),
    total: n(row.total),
    paid: n(row.paid),
    balance: n(row.balance),
  }));
  const active = mapped.filter((row) => row.status !== 'CANCELLED');
  return {
    key: 'purchases',
    title: REPORT_TITLES.purchases,
    range: { from: from.toISOString(), to: to.toISOString() },
    columns: [
      text('purchaseNumber', 'Purchase No'),
      date('invoiceDate', 'Invoice Date'),
      text('supplier', 'Supplier'),
      text('supplierInvoice', 'Supplier Invoice'),
      text('status', 'Status'),
      money('subtotal', 'Taxable'),
      money('tax', 'Tax'),
      money('total', 'Total'),
      money('paid', 'Paid'),
      money('balance', 'Balance'),
    ],
    rows: mapped,
    totals: {
      subtotal: round2(active.reduce((s, r) => s + r.subtotal, 0)),
      tax: round2(active.reduce((s, r) => s + r.tax, 0)),
      total: round2(active.reduce((s, r) => s + r.total, 0)),
      paid: round2(active.reduce((s, r) => s + r.paid, 0)),
      balance: round2(active.reduce((s, r) => s + r.balance, 0)),
    },
  };
}

// ── Expenses ─────────────────────────────────────────────────────────
async function expensesReport({ storeId, from, to }: Ctx): Promise<ReportResult> {
  const rows = await prisma.$queryRaw<
    {
      expense_number: string;
      expense_date: Date;
      category: string;
      vendor: string | null;
      method: string;
      amount: string;
      status: string;
      reference: string | null;
    }[]
  >`
    SELECT e."expenseNumber" AS expense_number,
           e."expenseDate" AS expense_date,
           c."name" AS category,
           e."vendor" AS vendor,
           e."paymentMethod"::text AS method,
           e."amount"::text AS amount,
           e."status"::text AS status,
           e."reference" AS reference
    FROM "Expense" e
    JOIN "ExpenseCategory" c ON c."id" = e."categoryId"
    WHERE e."storeId" = ${storeId}::uuid
      AND e."expenseDate" >= ${from} AND e."expenseDate" <= ${to}
    ORDER BY e."expenseDate" DESC, e."createdAt" DESC
  `;
  const mapped = rows.map((row) => ({
    expenseNumber: row.expense_number,
    expenseDate: row.expense_date,
    category: row.category,
    vendor: row.vendor,
    method: row.method,
    amount: n(row.amount),
    status: row.status,
    reference: row.reference,
  }));
  const active = mapped.filter((row) => row.status === 'ACTIVE');
  return {
    key: 'expenses',
    title: REPORT_TITLES.expenses,
    range: { from: from.toISOString(), to: to.toISOString() },
    columns: [
      text('expenseNumber', 'Expense No'),
      date('expenseDate', 'Date'),
      text('category', 'Category'),
      text('vendor', 'Vendor'),
      text('method', 'Method'),
      text('reference', 'Reference'),
      money('amount', 'Amount'),
      text('status', 'Status'),
    ],
    rows: mapped,
    totals: { amount: round2(active.reduce((s, r) => s + r.amount, 0)) },
  };
}

// ── Receivables ageing ───────────────────────────────────────────────
async function receivablesAging({ storeId }: Ctx): Promise<ReportResult> {
  const rows = await prisma.$queryRaw<
    {
      customer: string;
      mobile: string | null;
      invoices: bigint;
      total_due: string;
      current: string;
      overdue_1_30: string;
      overdue_31_60: string;
      overdue_60_plus: string;
    }[]
  >`
    SELECT c."name" AS customer,
           c."mobile" AS mobile,
           COUNT(v."id")::bigint AS invoices,
           COALESCE(SUM(v."balanceDue"), 0)::text AS total_due,
           COALESCE(SUM(CASE WHEN v."dueDate" IS NULL OR v."dueDate" >= CURRENT_DATE THEN v."balanceDue" ELSE 0 END), 0)::text AS current,
           COALESCE(SUM(CASE WHEN v."dueDate" < CURRENT_DATE AND v."dueDate" >= CURRENT_DATE - 30 THEN v."balanceDue" ELSE 0 END), 0)::text AS overdue_1_30,
           COALESCE(SUM(CASE WHEN v."dueDate" < CURRENT_DATE - 30 AND v."dueDate" >= CURRENT_DATE - 60 THEN v."balanceDue" ELSE 0 END), 0)::text AS overdue_31_60,
           COALESCE(SUM(CASE WHEN v."dueDate" < CURRENT_DATE - 60 THEN v."balanceDue" ELSE 0 END), 0)::text AS overdue_60_plus
    FROM "Invoice" v
    JOIN "Customer" c ON c."id" = v."customerId"
    WHERE v."storeId" = ${storeId}::uuid AND v."status" <> 'VOID'
      AND v."balanceDue" > 0 AND c."deletedAt" IS NULL
    GROUP BY c."name", c."mobile"
    ORDER BY total_due DESC
  `;
  const mapped = rows.map((row) => ({
    customer: row.customer,
    mobile: row.mobile,
    invoices: Number(row.invoices),
    totalDue: n(row.total_due),
    current: n(row.current),
    overdue1to30: n(row.overdue_1_30),
    overdue31to60: n(row.overdue_31_60),
    overdue60plus: n(row.overdue_60_plus),
  }));
  return {
    key: 'receivables-aging',
    title: REPORT_TITLES['receivables-aging'],
    range: { from: null, to: null },
    columns: [
      text('customer', 'Customer'),
      text('mobile', 'Mobile'),
      int('invoices', 'Invoices'),
      money('totalDue', 'Total Due'),
      money('current', 'Not due'),
      money('overdue1to30', '1–30 days'),
      money('overdue31to60', '31–60 days'),
      money('overdue60plus', '60+ days'),
    ],
    rows: mapped,
    totals: {
      invoices: mapped.reduce((s, r) => s + r.invoices, 0),
      totalDue: round2(mapped.reduce((s, r) => s + r.totalDue, 0)),
      current: round2(mapped.reduce((s, r) => s + r.current, 0)),
      overdue1to30: round2(mapped.reduce((s, r) => s + r.overdue1to30, 0)),
      overdue31to60: round2(mapped.reduce((s, r) => s + r.overdue31to60, 0)),
      overdue60plus: round2(mapped.reduce((s, r) => s + r.overdue60plus, 0)),
    },
  };
}

// ── Payment register ─────────────────────────────────────────────────
async function paymentsReport({ storeId, from, to }: Ctx): Promise<ReportResult> {
  const rows = await prisma.$queryRaw<
    {
      received_at: Date;
      direction: string;
      party_type: string;
      party: string | null;
      method: string;
      amount: string;
      reference: string | null;
      notes: string | null;
    }[]
  >`
    SELECT p."receivedAt" AS received_at,
           p."direction"::text AS direction,
           p."partyType"::text AS party_type,
           COALESCE(c."name", s."name") AS party,
           p."method"::text AS method,
           p."amount"::text AS amount,
           p."reference" AS reference,
           p."notes" AS notes
    FROM "Payment" p
    LEFT JOIN "Customer" c ON p."partyType" = 'CUSTOMER' AND c."id" = p."partyId"
    LEFT JOIN "Supplier" s ON p."partyType" = 'SUPPLIER' AND s."id" = p."partyId"
    WHERE p."storeId" = ${storeId}::uuid
      AND p."receivedAt" >= ${from} AND p."receivedAt" <= ${to}
    ORDER BY p."receivedAt" DESC
  `;
  const mapped = rows.map((row) => ({
    receivedAt: row.received_at,
    direction: row.direction,
    partyType: row.party_type,
    party: row.party ?? '—',
    method: row.method,
    amount: n(row.amount),
    reference: row.reference,
    notes: row.notes,
  }));
  const inflow = round2(mapped.filter((r) => r.direction === 'IN').reduce((s, r) => s + r.amount, 0));
  const outflow = round2(mapped.filter((r) => r.direction === 'OUT').reduce((s, r) => s + r.amount, 0));
  return {
    key: 'payments',
    title: REPORT_TITLES.payments,
    range: { from: from.toISOString(), to: to.toISOString() },
    columns: [
      date('receivedAt', 'Date'),
      text('direction', 'Direction'),
      text('partyType', 'Party Type'),
      text('party', 'Party'),
      text('method', 'Method'),
      money('amount', 'Amount'),
      text('reference', 'Reference'),
      text('notes', 'Notes'),
    ],
    rows: mapped,
    totals: { inflow, outflow, net: round2(inflow - outflow) },
    summary: [
      { label: 'Money in', value: inflow },
      { label: 'Money out', value: outflow },
      { label: 'Net', value: round2(inflow - outflow) },
    ],
  };
}

const REPORTS: Record<ReportKey, (ctx: Ctx) => Promise<ReportResult>> = {
  'sales-summary': salesSummary,
  'sales-detailed': salesDetailed,
  'sales-by-product': salesByProduct,
  'sales-by-customer': salesByCustomer,
  'sales-by-category': salesByCategory,
  'gst-summary': gstSummary,
  'gst-hsn': gstHsn,
  profit: profitReport,
  'inventory-valuation': inventoryValuation,
  purchases: purchasesReport,
  expenses: expensesReport,
  'receivables-aging': receivablesAging,
  payments: paymentsReport,
};

export async function runReport(
  storeId: string,
  key: string,
  query: Record<string, unknown>,
): Promise<ReportResult> {
  if (!isReportKey(key)) throw badRequest('Unknown report');
  const { from, to } = parseReportRange(query);
  return REPORTS[key]({ storeId, from, to, query });
}
