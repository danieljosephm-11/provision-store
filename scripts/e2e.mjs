/*
 * End-to-end business flow against a running API.
 *
 * Exercises the full money/stock path against a disposable database:
 *   product → supplier → purchase (stock in) → POS cash sale → credit sale
 *   → customer payment → sale return (restock + refund) → purchase return
 *   → supplier payment → expense + reversal → idempotency → RBAC → reports.
 *
 * Usage: API_URL=http://localhost:4001/api/v1 node scripts/e2e.mjs
 * Expected to run against provision_store_test, never the production DB.
 */
const base = process.env.API_URL ?? 'http://localhost:4001/api/v1';
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
if (!adminPassword) throw new Error('Set SEED_ADMIN_PASSWORD in this shell before running the end-to-end test.');
const stamp = Date.now().toString(36).toUpperCase();
const digits = String(Date.now()).slice(-9).padStart(9, '0');
const supplierMobile = `9${digits}`;
const customerMobile = `8${digits}`;

let token = '';
const results = [];

function record(ok, label, detail) {
  results.push({ ok, label, detail: detail ?? '' });
  const mark = ok ? 'OK  ' : 'FAIL';
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ''}`);
}

function near(actual, expected, tolerance = 0.005) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

async function req(method, path, body, extraHeaders = {}, asToken = token) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(asToken ? { authorization: `Bearer ${asToken}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') ?? '';
  let data = null;
  if (type.includes('application/json')) data = await res.json();
  else data = { buffer: await res.arrayBuffer(), contentType: type };
  return { status: res.status, data, headers: res.headers };
}

function assert(label, condition, detail) {
  record(!!condition, label, typeof detail === 'function' ? detail() : detail);
  return !!condition;
}

async function login(email, password) {
  const { status, data } = await req('POST', '/auth/login', { email, password }, {}, '');
  if (status !== 200) throw new Error(`Login failed for ${email}: ${status} ${JSON.stringify(data)}`);
  return data.accessToken;
}

// ── 1. Authentication ────────────────────────────────────────────────
token = await login('admin@provisionstore.local', adminPassword);
record(true, 'Admin login', 'access token issued');

const options = (await req('GET', '/catalog/options')).data.item;
const unit = options.units.find((u) => u.code === 'PCS') ?? options.units[0];
const taxRate = options.taxRates.find((t) => Number(t.rate) === 5) ?? options.taxRates[0];
const category = options.categories[0];
assert('Catalog options available', unit && taxRate && category, `unit ${unit?.code}, GST ${taxRate?.rate}%, category ${category?.name}`);

// ── 2. Product ───────────────────────────────────────────────────────
const sku = `E2E-${stamp}`;
const productRes = await req('POST', '/products', {
  name: `E2E Whole Wheat Atta 5kg ${stamp}`,
  sku,
  unitId: unit.id,
  categoryId: category.id,
  taxRateId: taxRate.id,
  purchasePrice: 80,
  sellingPrice: 105,
  mrp: 110,
  priceIncludesTax: false,
  hsnCode: '1101',
  minStock: 10,
});
const product = productRes.data.item;
assert('Create product', productRes.status === 201 && product?.id, `SKU ${sku}, sale price ₹105 + ${taxRate.rate}% GST`);

// ── 3. Supplier ──────────────────────────────────────────────────────
const supplierRes = await req('POST', '/suppliers', {
  name: `E2E Wholesale Supplier ${stamp}`,
  contactPerson: 'E2E Contact',
  mobile: supplierMobile,
  gstin: '33ABCDE1234F1Z5',
  address: '12 Test Street',
  city: 'Chennai',
  stateCode: '33',
  pincode: '600001',
  openingBalance: 0,
  creditDays: 15,
});
const supplier = supplierRes.data.item;
assert(
  'Create supplier',
  supplierRes.status === 201 && supplier?.id,
  `status ${supplierRes.status}, outstanding ₹${supplier?.outstanding ?? 0}${supplierRes.data.error ? `, ${supplierRes.data.error.message}` : ''}`,
);

// ── 4. Purchase (stock in) ───────────────────────────────────────────
const purchaseRes = await req('POST', '/purchases', {
  supplierId: supplier.id,
  supplierInvoiceNo: `E2E-P-${stamp}`,
  invoiceDate: new Date().toISOString(),
  items: [{ productId: product.id, quantity: 100, unitCost: 80, taxRate: 5 }],
  paidAmount: 0,
});
const purchase = purchaseRes.data.item;
assert(
  'Create purchase (100 units)',
  purchaseRes.status === 201 && near(purchase?.total, 8400) && near(purchase?.balanceAmount, 8400),
  `total ₹${purchase?.total}, balance ₹${purchase?.balanceAmount}`,
);

const stockAfterPurchase = (await req('GET', `/inventory?search=${encodeURIComponent(sku)}`)).data.items[0];
assert('Stock after purchase = 100', near(stockAfterPurchase?.quantity, 100), `qty ${stockAfterPurchase?.quantity}`);

// ── 5. Cash sale with tender + change ────────────────────────────────
const cashInvoiceBody = {
  items: [{ productId: product.id, quantity: 5 }],
  payments: [{ method: 'CASH', amount: 600 }],
  clientRef: `e2e-cash-${stamp}`,
  roundToRupee: true,
};
const cashRes = await req('POST', '/invoices', cashInvoiceBody);
const cashInvoice = cashRes.data.item;
assert(
  'Create cash invoice (5 units)',
  cashRes.status === 201 && near(cashInvoice?.grandTotal, 551) && near(cashRes.data.changeDue, 49),
  `grand total ₹${cashInvoice?.grandTotal}, change due ₹${cashRes.data.changeDue}, no ${cashInvoice?.invoiceNo}`,
);
assert(
  'GST split is CGST 13.12 / SGST 13.13',
  near(cashInvoice?.cgst, 13.12) && near(cashInvoice?.sgst, 13.13),
  `CGST ₹${cashInvoice?.cgst}, SGST ₹${cashInvoice?.sgst}`,
);
assert('Cash invoice marked PAID', cashInvoice?.paymentStatus === 'PAID' && near(cashInvoice?.balanceDue, 0), `status ${cashInvoice?.paymentStatus}`);

const stockAfterCash = (await req('GET', `/inventory?search=${encodeURIComponent(sku)}`)).data.items[0];
assert('Stock after cash sale = 95', near(stockAfterCash?.quantity, 95), `qty ${stockAfterCash?.quantity}`);

// ── 6. Idempotent retry of the same sale ─────────────────────────────
const replayRes = await req('POST', '/invoices', cashInvoiceBody);
const stockAfterReplay = (await req('GET', `/inventory?search=${encodeURIComponent(sku)}`)).data.items[0];
assert(
  'Duplicate invoice is replayed, not re-billed',
  replayRes.status === 200 &&
    replayRes.data.replayed === true &&
    replayRes.data.item?.id === cashInvoice.id &&
    near(stockAfterReplay?.quantity, 95),
  `replayed=${replayRes.data.replayed}, stock ${stockAfterReplay?.quantity}`,
);

// ── 7. Customer + credit sale + payment ──────────────────────────────
const customerRes = await req('POST', '/customers', {
  name: `E2E Credit Customer ${stamp}`,
  mobile: customerMobile,
  creditLimit: 5000,
  creditDays: 15,
});
const customer = customerRes.data.item;
assert('Create credit customer', customerRes.status === 201 && customer?.id, `credit limit ₹${customer?.creditLimit}`);

const creditRes = await req('POST', '/invoices', {
  customerId: customer.id,
  items: [{ productId: product.id, quantity: 2 }],
  payments: [],
  clientRef: `e2e-credit-${stamp}`,
});
const creditInvoice = creditRes.data.item;
assert(
  'Create credit invoice (2 units)',
  creditRes.status === 201 && near(creditInvoice?.grandTotal, 221) && near(creditInvoice?.balanceDue, 221),
  `total ₹${creditInvoice?.grandTotal}, due ₹${creditInvoice?.balanceDue}, status ${creditInvoice?.paymentStatus}`,
);

const customerAfterSale = (await req('GET', `/customers/${customer.id}`)).data.item;
assert('Customer outstanding = 221', near(customerAfterSale?.outstanding, 221), `outstanding ₹${customerAfterSale?.outstanding}`);

const paymentRes = await req('POST', `/customers/${customer.id}/payments`, {
  amount: 221,
  method: 'UPI',
  reference: `E2E-UPI-${stamp}`,
});
const customerAfterPayment = (await req('GET', `/customers/${customer.id}`)).data.item;
assert(
  'Record customer UPI payment in full',
  paymentRes.status === 201 && near(customerAfterPayment?.outstanding, 0),
  `outstanding after payment ₹${customerAfterPayment?.outstanding}`,
);

const stockAfterCredit = (await req('GET', `/inventory?search=${encodeURIComponent(sku)}`)).data.items[0];
assert('Stock after credit sale = 93', near(stockAfterCredit?.quantity, 93), `qty ${stockAfterCredit?.quantity}`);

// ── 8. Sale return (restock + cash refund) ───────────────────────────
const cashInvoiceFull = (await req('GET', `/invoices/${cashInvoice.id}`)).data.item;
const cashLine = cashInvoiceFull.items.find((i) => i.productId === product.id);
const returnRes = await req('POST', '/returns', {
  invoiceId: cashInvoice.id,
  reason: 'E2E damaged pack returned',
  refundMethod: 'CASH',
  restock: true,
  items: [{ invoiceItemId: cashLine.id, quantity: 1 }],
});
const saleReturn = returnRes.data.item;
assert(
  'Create sale return (1 unit, restock)',
  returnRes.status === 201 && near(saleReturn?.total, 110.25) && near(saleReturn?.payout, 110.25),
  `refund ₹${saleReturn?.payout}, return ${saleReturn?.returnNo}`,
);

const stockAfterReturn = (await req('GET', `/inventory?search=${encodeURIComponent(sku)}`)).data.items[0];
assert('Stock after sale return = 94', near(stockAfterReturn?.quantity, 94), `qty ${stockAfterReturn?.quantity}`);

// ── 9. Purchase return (stock out + supplier debit) ──────────────────
const purchaseFull = (await req('GET', `/purchases/${purchase.id}`)).data.item;
const purchaseLine = purchaseFull.items[0];
const purchaseReturnRes = await req('POST', '/purchase-returns', {
  purchaseId: purchase.id,
  reason: 'E2E short-dated stock returned to supplier',
  items: [{ purchaseItemId: purchaseLine.id, quantity: 2 }],
});
const purchaseReturn = purchaseReturnRes.data.item;
assert(
  'Create purchase return (2 units)',
  purchaseReturnRes.status === 201 && near(purchaseReturn?.total, 168),
  `total ₹${purchaseReturn?.total}, number ${purchaseReturn?.returnNumber}`,
);

const stockAfterPurchaseReturn = (await req('GET', `/inventory?search=${encodeURIComponent(sku)}`)).data.items[0];
assert('Stock after purchase return = 92', near(stockAfterPurchaseReturn?.quantity, 92), `qty ${stockAfterPurchaseReturn?.quantity}`);

// ── 10. Supplier payment ─────────────────────────────────────────────
const supplierPayRes = await req('POST', `/purchases/${purchase.id}/payments`, {
  amount: 1000,
  method: 'BANK_TRANSFER',
  reference: `E2E-NEFT-${stamp}`,
});
const supplierAfter = (await req('GET', `/suppliers/${supplier.id}`)).data.item;
assert(
  'Record supplier payment, outstanding = 7232',
  supplierPayRes.status === 201 && near(supplierAfter?.outstanding, 7232),
  `outstanding ₹${supplierAfter?.outstanding}`,
);

// ── 11. Expense + reversal ───────────────────────────────────────────
const expenseCategories = (await req('GET', '/expense-categories')).data.items;
const expenseRes = await req('POST', '/expenses', {
  categoryId: expenseCategories[0].id,
  expenseDate: new Date().toISOString(),
  amount: 500,
  paymentMethod: 'CASH',
  vendor: `E2E Vendor ${stamp}`,
  notes: 'E2E expense to verify reversal handling',
});
const expense = expenseRes.data.item;
assert('Create expense ₹500', expenseRes.status === 201 && near(expense?.amount, 500), `status ${expense?.status}`);

const reverseRes = await req('POST', `/expenses/${expense.id}/reverse`, { reason: 'E2E reversal check' });
const expenseAfterReverse = (await req('GET', `/expenses?search=${encodeURIComponent(stamp)}`)).data.items[0];
assert(
  'Reverse expense',
  reverseRes.status === 200 && expenseAfterReverse?.status === 'REVERSED',
  `status ${expenseAfterReverse?.status}`,
);

// ── 12. RBAC boundary ────────────────────────────────────────────────
const roles = (await req('GET', '/roles')).data.items;
const cashierRole = roles.find((r) => r.name === 'Cashier');
const cashierEmail = `e2e.cashier.${stamp.toLowerCase()}@provisionstore.local`;
const cashierRes = await req('POST', '/users', {
  name: `E2E Cashier ${stamp}`,
  email: cashierEmail,
  password: 'Cashier@12345',
  roleId: cashierRole.id,
});
assert('Create cashier user', cashierRes.status === 201 && cashierRes.data.item?.id, cashierEmail);

const cashierToken = await login(cashierEmail, 'Cashier@12345');
const blockedUntilChange = await req('GET', '/invoices?page=1&pageSize=1', undefined, {}, cashierToken);
assert(
  'New user must change password before any route',
  blockedUntilChange.status === 403 && blockedUntilChange.data.error?.code === 'PASSWORD_CHANGE_REQUIRED',
  `status ${blockedUntilChange.status}, code ${blockedUntilChange.data?.error?.code}`,
);

const newCashierPassword = 'Cashier@54321';
const changed = await req(
  'POST',
  '/auth/change-password',
  { currentPassword: 'Cashier@12345', newPassword: newCashierPassword },
  {},
  cashierToken,
);
assert('Cashier completes forced password change', changed.status === 200, `status ${changed.status}`);

const cashierToken2 = await login(cashierEmail, newCashierPassword);
const denied = await req('GET', '/users', undefined, {}, cashierToken2);
const allowed = await req('GET', '/invoices?page=1&pageSize=1', undefined, {}, cashierToken2);
assert('Cashier blocked from user management (403)', denied.status === 403, `status ${denied.status}`);
assert('Cashier allowed to read invoices', allowed.status === 200, `status ${allowed.status}`);

// ── 13. Reporting reflects the transactions ──────────────────────────
const from = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const to = new Date().toISOString().slice(0, 10);
const range = `from=${from}&to=${to}`;
const salesSummary = (await req('GET', `/reports/sales-summary?${range}`)).data.item;
const gstSummary = (await req('GET', `/reports/gst-summary?${range}`)).data.item;
const profit = (await req('GET', `/reports/profit?${range}`)).data.item;
const dashboard = (await req('GET', `/dashboard?${range}`)).data.item;
assert('Sales report includes the period sales', Number(salesSummary?.totals?.total ?? 0) > 0, `total ₹${salesSummary?.totals?.total}`);
assert('GST report returns totals', Number(gstSummary?.totals?.tax ?? 0) > 0, `tax ₹${gstSummary?.totals?.tax}`);
assert('Profit report returns totals', profit?.totals != null, JSON.stringify(profit?.totals ?? {}).slice(0, 120));
assert('Dashboard period sales > 0', Number(dashboard?.period?.sales ?? 0) > 0, `₹${dashboard?.period?.sales}`);

// ── 14. Invoice PDF + thermal output ─────────────────────────────────
const pdfRes = await req('GET', `/invoices/${cashInvoice.id}/pdf`);
const thermalRes = await req('GET', `/invoices/${cashInvoice.id}/thermal`);
assert('Invoice PDF renders', pdfRes.status === 200 && pdfRes.headers.get('content-type')?.includes('pdf'), pdfRes.headers.get('content-type'));
assert('Thermal receipt renders', thermalRes.status === 200, thermalRes.headers.get('content-type'));

// ── 15. Audit trail ──────────────────────────────────────────────────
const audit = (await req('GET', '/audit-logs?pageSize=200')).data.items;
const actions = new Set(audit.map((a) => a.action));
for (const action of ['PRODUCT_CREATED', 'PURCHASE_CREATED', 'INVOICE_CREATED', 'SALE_RETURN_CREATED', 'PURCHASE_RETURN_CREATED', 'EXPENSE_CREATED']) {
  assert(`Audit log captured ${action}`, actions.has(action), action);
}

// ── Summary ──────────────────────────────────────────────────────────
const failures = results.filter((r) => !r.ok);
console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
if (failures.length) {
  console.log('Failures:');
  for (const f of failures) console.log(` - ${f.label}${f.detail ? ` (${f.detail})` : ''}`);
}
process.exit(failures.length ? 1 : 0);
