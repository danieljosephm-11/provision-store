/* Smoke test all mounted API modules against a running local server. */
const base = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
if (!adminPassword) throw new Error('Set SEED_ADMIN_PASSWORD in this shell before running the smoke test.');

let token = '';
async function req(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') ?? '';
  let data = null;
  if (type.includes('application/json')) data = await res.json();
  else data = `[${type} ${res.headers.get('content-length') ?? '?'} bytes]`;
  return { status: res.status, data };
}

const results = [];
async function check(label, method, path, body, headers, expectedStatus) {
  try {
    const { status, data } = await req(method, path, body, headers);
    const ok = expectedStatus !== undefined ? status === expectedStatus : status < 400;
    let detail = '';
    if (!ok) detail = JSON.stringify(data).slice(0, 220);
    else if (Array.isArray(data?.items)) detail = `${data.items.length} items`;
    else if (data?.item && typeof data.item === 'object' && !Array.isArray(data.item))
      detail = Object.keys(data.item).slice(0, 4).join(',');
    results.push({ ok, label, status, detail });
  } catch (error) {
    results.push({ ok: false, label, status: 'ERR', detail: String(error).slice(0, 200) });
  }
}

const login = await req('POST', '/auth/login', {
  email: 'admin@provisionstore.local',
  password: adminPassword,
});
if (login.status !== 200) {
  console.error('Login failed:', login.status, login.data);
  process.exit(1);
}
token = login.data.accessToken;
console.log('Login OK, user:', login.data.user?.name, '| permissions:', login.data.user?.permissions?.length);

await check('health', 'GET', '/health');
await check('auth/me', 'GET', '/auth/me');
await check('store', 'GET', '/store');
await check('catalog/options', 'GET', '/catalog/options');
await check('catalog/categories', 'GET', '/catalog/categories');
await check('catalog/tax-rates', 'GET', '/catalog/tax-rates');
await check('products', 'GET', '/products');
await check('products/low-stock', 'GET', '/products/low-stock');
await check('inventory', 'GET', '/inventory');
await check('inventory/valuation', 'GET', '/inventory/valuation');
await check('invoices', 'GET', '/invoices');
await check('held-bills', 'GET', '/held-bills');
await check('returns', 'GET', '/returns');
await check('customers', 'GET', '/customers');
await check('customers/summary', 'GET', '/customers/summary');
await check('suppliers', 'GET', '/suppliers');
await check('purchases', 'GET', '/purchases');
await check('purchase-orders', 'GET', '/purchase-orders');
await check('purchase-returns', 'GET', '/purchase-returns');
await check('expense-categories', 'GET', '/expense-categories');
await check('expenses', 'GET', '/expenses');
await check('expenses/summary', 'GET', '/expenses/summary');
await check('dashboard', 'GET', '/dashboard');
await check('reports', 'GET', '/reports');
await check('report sales-summary', 'GET', '/reports/sales-summary');
await check('report sales-detailed', 'GET', '/reports/sales-detailed');
await check('report sales-by-product', 'GET', '/reports/sales-by-product');
await check('report sales-by-customer', 'GET', '/reports/sales-by-customer');
await check('report sales-by-category', 'GET', '/reports/sales-by-category');
await check('report gst-summary', 'GET', '/reports/gst-summary');
await check('report gst-hsn', 'GET', '/reports/gst-hsn');
await check('report profit', 'GET', '/reports/profit');
await check('report inventory-valuation', 'GET', '/reports/inventory-valuation');
await check('report purchases', 'GET', '/reports/purchases');
await check('report expenses', 'GET', '/reports/expenses');
await check('report receivables-aging', 'GET', '/reports/receivables-aging');
await check('report payments', 'GET', '/reports/payments');
await check('export xlsx', 'GET', '/reports/sales-summary/export?format=xlsx');
await check('export pdf', 'GET', '/reports/inventory-valuation/export?format=pdf');
await check('audit-logs', 'GET', '/audit-logs');
await check('users', 'GET', '/users');
await check('roles', 'GET', '/roles');
token = '';
await check('unauth check', 'GET', '/reports', undefined, undefined, 401);

for (const r of results) {
  const mark = r.ok ? 'OK  ' : 'FAIL';
  console.log(`${mark} ${String(r.status).padEnd(4)} ${r.label.padEnd(32)} ${r.detail}`);
}
const failures = results.filter((r) => !r.ok);
console.log(`\n${results.length - failures.length}/${results.length} passed`);
process.exit(failures.length ? 1 : 0);
