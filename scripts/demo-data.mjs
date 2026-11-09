/*
 * Presentation data for the CRM walkthrough.
 *
 * Everything is created through the public API so the same validation,
 * permissions, stock movements and ledger rules apply as in the UI.
 * A final Prisma pass spreads the generated invoices, payments and
 * activities across the last seven months so the CRM dashboards show
 * meaningful monthly spend, at-risk customers and a live follow-up queue.
 *
 * Usage:
 *   API_URL=http://localhost:4000/api/v1 node scripts/demo-data.mjs
 *
 * The script is idempotent:
 *   - products are matched by SKU
 *   - customers are matched by mobile
 *   - invoices are matched by clientRef (API idempotency key)
 *   - activities are matched by customer + type + subject
 *   - campaigns are matched by name
 *
 * Safe to run against the local demo database. It never deletes business
 * data; it only creates or fills in what is missing.
 */
const rawBase = (process.env.API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
const base = rawBase.endsWith('/api/v1') ? rawBase : `${rawBase}/api/v1`;
const email = process.env.DEMO_EMAIL ?? 'admin@provisionstore.local';
const password = process.env.DEMO_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;
if (!password) throw new Error('Set DEMO_PASSWORD or SEED_ADMIN_PASSWORD before loading demo data.');
const backdate = process.env.DEMO_BACKDATE !== 'false';
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:5432/provision_store?schema=public';

let token = '';
const stats = { products: 0, customers: 0, invoices: 0, payments: 0, activities: 0, campaigns: 0 };

const DAY = 86_400_000;
const now = new Date();
const pad = (value) => String(value).padStart(2, '0');
const isoDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const addDays = (date, days) => new Date(date.getTime() + days * DAY);
const daysAgo = (days) => addDays(now, -days);
const daysFromNow = (days) => addDays(now, days);
const daysFromNowInput = (days) => {
  const date = daysFromNow(days);
  return `${isoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(method, path, body, retries = 0) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('application/json') ? await res.json() : await res.text();
  if (res.status === 429 && retries < 4) {
    await sleep(1500 * (retries + 1));
    return request(method, path, body, retries + 1);
  }
  if (!res.ok) {
    const message = typeof data === 'object' && data?.error?.message ? data.error.message : String(data);
    const error = new Error(`${method} ${path} -> ${res.status}: ${message}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, body);
const patch = (path, body) => request('PATCH', path, body);

async function login() {
  const data = await request('POST', '/auth/login', { email, password });
  token = data.accessToken;
  if (!token) throw new Error('Login succeeded without an access token');
  console.log(`Signed in as ${data.user?.name ?? email} (${data.user?.role?.name ?? 'role'})`);
}

/* ── Catalogue ─────────────────────────────────────────────────────── */

const PRODUCTS = [
  { key: 'atta', name: 'Aashirvaad Whole Wheat Atta 5kg', sku: 'DEMO-ATTA-5KG', category: 'Groceries', unit: 'PKT', price: 285, mrp: 310, cost: 245, hsn: '1101' },
  { key: 'rice10', name: 'Sona Masoori Rice 10kg', sku: 'DEMO-RICE-10KG', category: 'Groceries', unit: 'PKT', price: 720, mrp: 780, cost: 620, hsn: '1006' },
  { key: 'basmati5', name: 'India Gate Basmati Rice 5kg', sku: 'DEMO-BASMATI-5KG', category: 'Groceries', unit: 'PKT', price: 650, mrp: 720, cost: 560, hsn: '1006' },
  { key: 'oil', name: 'Fortune Sunflower Oil 1L', sku: 'DEMO-OIL-1L', category: 'Groceries', unit: 'LTR', price: 145, mrp: 160, cost: 128, hsn: '1512' },
  { key: 'milk', name: 'Amul Taaza Toned Milk 1L', sku: 'DEMO-MILK-1L', category: 'Dairy & Bakery', unit: 'LTR', price: 58, mrp: 60, cost: 52, hsn: '0401' },
  { key: 'biscuits', name: 'Britannia Good Day Biscuits 200g', sku: 'DEMO-BISCUIT-200G', category: 'Snacks', unit: 'PKT', price: 40, mrp: 45, cost: 34, hsn: '1905' },
  { key: 'tea', name: 'Tata Tea Premium 500g', sku: 'DEMO-TEA-500G', category: 'Beverages', unit: 'PKT', price: 245, mrp: 265, cost: 215, hsn: '0902' },
  { key: 'nescafe', name: 'Nescafe Classic Coffee 100g', sku: 'DEMO-COFFEE-100G', category: 'Beverages', unit: 'PKT', price: 290, mrp: 315, cost: 250, hsn: '2101' },
  { key: 'colgate', name: 'Colgate Strong Teeth 200g', sku: 'DEMO-COLGATE-200G', category: 'Personal Care', unit: 'PCS', price: 105, mrp: 115, cost: 88, hsn: '3306' },
  { key: 'surf', name: 'Surf Excel Easy Wash 1kg', sku: 'DEMO-SURF-1KG', category: 'Household', unit: 'PKT', price: 135, mrp: 150, cost: 118, hsn: '3402' },
  { key: 'handwash', name: 'Dettol Handwash 750ml', sku: 'DEMO-HANDWASH-750ML', category: 'Personal Care', unit: 'PCS', price: 199, mrp: 220, cost: 165, hsn: '3401' },
  { key: 'bananas', name: 'Fresh Bananas 1kg', sku: 'DEMO-BANANA-1KG', category: 'Fruits & Vegetables', unit: 'KG', price: 60, mrp: 70, cost: 45, hsn: '0803' },
];

async function ensureProducts() {
  const options = (await get('/catalog/options')).item;
  const categoryByName = new Map(options.categories.map((row) => [row.name, row]));
  const unitByCode = new Map(options.units.map((row) => [row.code, row]));
  const taxRate = options.taxRates.find((row) => Number(row.rate) === 5) ?? options.taxRates[0];

  const existing = new Map();
  let page = 1;
  for (;;) {
    const list = await get(`/products?page=${page}&pageSize=100`);
    for (const row of list.items) existing.set(row.sku, row);
    if (page >= (list.meta?.totalPages ?? 1)) break;
    page += 1;
  }

  const byKey = new Map();
  for (const product of PRODUCTS) {
    const found = existing.get(product.sku);
    if (found) {
      byKey.set(product.key, found);
      continue;
    }
    const category = categoryByName.get(product.category);
    const unit = unitByCode.get(product.unit) ?? unitByCode.get('PCS');
    if (!category || !unit) throw new Error(`Missing catalog option for ${product.name}`);
    const created = await post('/products', {
      name: product.name,
      sku: product.sku,
      categoryId: category.id,
      unitId: unit.id,
      taxRateId: taxRate.id,
      purchasePrice: product.cost,
      sellingPrice: product.price,
      mrp: product.mrp,
      priceIncludesTax: true,
      hsnCode: product.hsn,
      minStock: 20,
      trackBatches: false,
      trackExpiry: false,
      status: 'ACTIVE',
    });
    byKey.set(product.key, created.item);
    stats.products += 1;
    console.log(`  + product ${product.name}`);
  }

  // Opening stock so every invoice can be billed from real inventory.
  for (const product of PRODUCTS) {
    const row = byKey.get(product.key);
    if (!row) continue;
    const list = await get(`/inventory/products/${row.id}`);
    const available = Number(list.item?.available ?? list.item?.onHand ?? 0);
    if (available < 120) {
      await post('/inventory/adjust', {
        productId: row.id,
        type: 'OPENING',
        quantity: 500,
        note: 'Opening stock for showroom demo',
      });
      console.log(`  + opening stock ${product.name}`);
    }
  }

  console.log(
    `Catalogue ready: ${byKey.size} products (${stats.products} created), GST ${taxRate.rate}%`,
  );
  return byKey;
}

/* ── Customers ─────────────────────────────────────────────────────── */

const CUSTOMERS = [
  {
    key: 'priya',
    name: 'Priya Raman',
    mobile: '9841012001',
    email: 'priya.raman@example.com',
    creditLimit: 50000,
    creditDays: 30,
    birthday: '1990-11-12',
    anniversary: '2018-02-14',
    tags: ['VIP', 'high-value', 'festive'],
    joinedDaysAgo: 430,
    notes: 'Prefers WhatsApp for offers. Usually buys monthly household staples.',
    address: { line1: '12, Kasturi Street', line2: 'T. Nagar', city: 'Chennai', stateCode: '33', pincode: '600017' },
  },
  {
    key: 'karthik',
    name: 'Karthik Subramanian',
    mobile: '9841012002',
    email: 'karthik.s@example.com',
    creditLimit: 40000,
    creditDays: 30,
    birthday: '1987-12-03',
    anniversary: '2015-06-20',
    tags: ['wholesale', 'high-value'],
    joinedDaysAgo: 390,
    notes: 'Buys in bulk for a small canteen. Pays by bank transfer.',
    address: { line1: '44, Station Road', line2: null, city: 'Chennai', stateCode: '33', pincode: '600042' },
  },
  {
    key: 'meena',
    name: 'Meena Iyer',
    mobile: '9841012003',
    email: 'meena.iyer@example.com',
    creditLimit: 25000,
    creditDays: 15,
    birthday: '1992-11-25',
    anniversary: null,
    tags: ['loyal', 'festive'],
    joinedDaysAgo: 340,
    notes: 'Allergic to peanuts — check before recommending snacks.',
    address: { line1: '7, Bharathi Nagar', line2: null, city: 'Chennai', stateCode: '33', pincode: '600041' },
  },
  {
    key: 'arjun',
    name: 'Arjun Nair',
    mobile: '9841012004',
    email: 'arjun.nair@example.com',
    creditLimit: 15000,
    creditDays: 15,
    birthday: '1995-12-10',
    anniversary: null,
    tags: ['regular'],
    joinedDaysAgo: 210,
    notes: null,
    address: { line1: '23, Lake View Apartments', line2: null, city: 'Chennai', stateCode: '33', pincode: '600096' },
  },
  {
    key: 'divya',
    name: 'Divya Krishnan',
    mobile: '9841012005',
    email: 'divya.k@example.com',
    creditLimit: 20000,
    creditDays: 30,
    birthday: '1991-11-18',
    anniversary: '2020-11-15',
    tags: ['credit', 'regular'],
    joinedDaysAgo: 260,
    notes: 'Usually settles the credit balance within two weeks.',
    address: { line1: '5, Green Park', line2: 'Adyar', city: 'Chennai', stateCode: '33', pincode: '600020' },
  },
  {
    key: 'suresh',
    name: 'Suresh Babu',
    mobile: '9841012006',
    email: 'suresh.babu@example.com',
    creditLimit: 30000,
    creditDays: 30,
    birthday: '1985-01-22',
    anniversary: null,
    tags: ['at-risk', 'credit'],
    joinedDaysAgo: 320,
    notes: 'Moved house recently. Prefers weekend delivery.',
    address: { line1: '18, Anna Nagar West', line2: null, city: 'Chennai', stateCode: '33', pincode: '600040' },
  },
  {
    key: 'lakshmi',
    name: 'Lakshmi Narayanan',
    mobile: '9841012007',
    email: 'lakshmi.n@example.com',
    creditLimit: 20000,
    creditDays: 15,
    birthday: '1988-12-20',
    anniversary: '2012-05-09',
    tags: ['at-risk', 'wholesale'],
    joinedDaysAgo: 480,
    notes: 'Wholesale buyer. Always pays by cheque.',
    address: { line1: '31, Bazaar Street', line2: null, city: 'Chennai', stateCode: '33', pincode: '600079' },
  },
  {
    key: 'vikram',
    name: 'Vikram Shetty',
    mobile: '9841012008',
    email: 'vikram.shetty@example.com',
    creditLimit: 10000,
    creditDays: 0,
    birthday: '1993-11-30',
    anniversary: null,
    tags: ['at-risk'],
    joinedDaysAgo: 300,
    notes: 'One-time buyer. Worth a win-back call.',
    address: { line1: '9, Beach Road', line2: null, city: 'Chennai', stateCode: '33', pincode: '600090' },
  },
  {
    key: 'ananya',
    name: 'Ananya Menon',
    mobile: '9841012009',
    email: 'ananya.menon@example.com',
    creditLimit: 10000,
    creditDays: 15,
    birthday: '1998-12-05',
    anniversary: null,
    tags: ['new', 'festive'],
    joinedDaysAgo: 4,
    notes: 'First purchase this week. Send the loyalty programme welcome message.',
    address: { line1: '16, OMR Service Road', line2: null, city: 'Chennai', stateCode: '33', pincode: '600119' },
  },
  {
    key: 'rahul',
    name: 'Rahul Verma',
    mobile: '9841012010',
    email: 'rahul.verma@example.com',
    creditLimit: 0,
    creditDays: 0,
    birthday: null,
    anniversary: null,
    tags: ['new', 'lead'],
    joinedDaysAgo: 3,
    notes: 'Referral lead interested in a monthly grocery subscription.',
    address: { line1: '2, Velachery Main Road', line2: null, city: 'Chennai', stateCode: '33', pincode: '600100' },
  },
  {
    key: 'farhana',
    name: 'Farhana Begum',
    mobile: '9841012011',
    email: 'farhana.begum@example.com',
    creditLimit: 35000,
    creditDays: 30,
    birthday: '1989-11-20',
    anniversary: '2014-12-01',
    tags: ['loyal', 'credit', 'festive'],
    joinedDaysAgo: 280,
    notes: 'Places a large festive order every year.',
    address: { line1: '27, Peters Road', line2: 'Royapettah', city: 'Chennai', stateCode: '33', pincode: '600014' },
  },
  {
    key: 'ganesh',
    name: 'Ganesh Kumar',
    mobile: '9841012012',
    email: 'ganesh.kumar@example.com',
    creditLimit: 50000,
    creditDays: 45,
    birthday: '1980-12-18',
    anniversary: null,
    tags: ['credit', 'wholesale', 'VIP'],
    joinedDaysAgo: 520,
    notes: 'Key wholesale account — handle with priority.',
    address: { line1: '60, GST Road', line2: 'Chromepet', city: 'Chennai', stateCode: '33', pincode: '600044' },
  },
];

async function ensureCustomers() {
  const byMobile = new Map();
  let page = 1;
  for (;;) {
    const list = await get(`/customers?page=${page}&pageSize=100&includeInactive=true`);
    for (const row of list.items) byMobile.set(row.mobile, row);
    if (page >= (list.meta?.totalPages ?? 1)) break;
    page += 1;
  }

  const byKey = new Map();
  for (const customer of CUSTOMERS) {
    let row = byMobile.get(customer.mobile);
    if (!row) {
      const created = await post('/customers', {
        name: customer.name,
        mobile: customer.mobile,
        email: customer.email,
        gstin: null,
        creditLimit: customer.creditLimit,
        creditDays: customer.creditDays,
        birthday: customer.birthday,
        anniversary: customer.anniversary,
        tags: customer.tags,
        notes: customer.notes,
        isActive: true,
        address: customer.address,
      });
      row = created.item;
      stats.customers += 1;
      console.log(`  + customer ${customer.name}`);
    } else {
      // Keep the presentation fields current on reruns.
      await patch(`/customers/${row.id}`, {
        name: customer.name,
        email: customer.email,
        creditLimit: customer.creditLimit,
        creditDays: customer.creditDays,
        birthday: customer.birthday,
        anniversary: customer.anniversary,
        tags: customer.tags,
        notes: customer.notes,
        isActive: true,
        address: customer.address,
      });
    }
    byKey.set(customer.key, row);
  }
  console.log(`Customers ready: ${byKey.size} (${stats.customers} created)`);
  return byKey;
}

/* ── Invoices ──────────────────────────────────────────────────────── */

// `days` is how long ago the invoice happened. `dueDays` is how much of the
// bill remains unpaid at demo time (0 means fully paid).
const INVOICES = [
  // Priya — high value, very recent, fully paid
  { customer: 'priya', days: 150, items: [['atta', 4], ['rice10', 2], ['oil', 4], ['milk', 6], ['biscuits', 4], ['tea', 2]] },
  { customer: 'priya', days: 95, items: [['basmati5', 2], ['rice10', 3], ['atta', 2], ['oil', 6], ['milk', 8], ['tea', 2], ['nescafe', 2], ['biscuits', 5]] },
  { customer: 'priya', days: 35, items: [['rice10', 4], ['basmati5', 4], ['atta', 2], ['oil', 8], ['milk', 10], ['tea', 3], ['biscuits', 6], ['surf', 2]] },
  { customer: 'priya', days: 3, items: [['atta', 2], ['rice10', 1], ['oil', 3], ['milk', 6], ['tea', 2], ['biscuits', 6], ['nescafe', 2]] },

  // Karthik — high value wholesale, recent, fully paid
  { customer: 'karthik', days: 120, items: [['rice10', 5], ['atta', 3], ['oil', 6], ['milk', 6], ['tea', 2], ['biscuits', 5]] },
  { customer: 'karthik', days: 60, items: [['basmati5', 3], ['rice10', 2], ['oil', 4], ['tea', 2], ['nescafe', 1], ['surf', 2]] },
  { customer: 'karthik', days: 30, items: [['atta', 4], ['rice10', 2], ['oil', 6], ['milk', 8], ['tea', 2], ['biscuits', 6]] },
  { customer: 'karthik', days: 8, items: [['basmati5', 2], ['rice10', 2], ['oil', 4], ['milk', 6], ['tea', 2], ['surf', 2], ['colgate', 2], ['nescafe', 1]] },

  // Meena — loyal, recent
  { customer: 'meena', days: 110, items: [['atta', 2], ['oil', 2], ['milk', 6], ['tea', 1], ['biscuits', 6], ['colgate', 2]] },
  { customer: 'meena', days: 70, items: [['rice10', 2], ['oil', 3], ['milk', 6], ['tea', 1], ['surf', 1]] },
  { customer: 'meena', days: 40, items: [['atta', 3], ['rice10', 1], ['oil', 4], ['milk', 6], ['tea', 1], ['biscuits', 4]] },
  { customer: 'meena', days: 12, items: [['basmati5', 1], ['oil', 3], ['milk', 6], ['tea', 2], ['bananas', 2], ['handwash', 1]] },

  // Arjun — regular, recent
  { customer: 'arjun', days: 45, items: [['atta', 1], ['oil', 2], ['milk', 6], ['biscuits', 4], ['bananas', 2]] },
  { customer: 'arjun', days: 7, items: [['rice10', 1], ['oil', 2], ['milk', 6], ['tea', 1], ['biscuits', 4]] },

  // Divya — regular with a live credit balance
  { customer: 'divya', days: 25, items: [['atta', 1], ['oil', 2], ['milk', 4], ['tea', 1], ['biscuits', 4]] },
  { customer: 'divya', days: 10, items: [['rice10', 2], ['oil', 3], ['milk', 6], ['tea', 1], ['colgate', 1], ['handwash', 1]], targetDue: 1500 },

  // Suresh — at risk with a live credit balance
  { customer: 'suresh', days: 140, items: [['rice10', 3], ['atta', 3], ['oil', 4], ['milk', 6], ['tea', 2], ['surf', 2]] },
  { customer: 'suresh', days: 75, items: [['basmati5', 1], ['rice10', 2], ['oil', 4], ['milk', 6], ['tea', 2], ['biscuits', 6], ['colgate', 2]], targetDue: 3000 },

  // Lakshmi — inactive with a live credit balance
  { customer: 'lakshmi', days: 200, items: [['rice10', 4], ['atta', 2], ['oil', 4], ['milk', 6], ['tea', 2], ['surf', 2]] },
  { customer: 'lakshmi', days: 125, items: [['basmati5', 1], ['rice10', 1], ['oil', 3], ['milk', 6], ['tea', 1], ['colgate', 1], ['handwash', 1]], targetDue: 1000 },

  // Vikram — one purchase, long lapsed
  { customer: 'vikram', days: 210, items: [['atta', 1], ['oil', 1], ['milk', 4], ['tea', 1], ['biscuits', 4], ['bananas', 1]] },

  // Ananya — new customer
  { customer: 'ananya', days: 2, items: [['basmati5', 1], ['oil', 2], ['milk', 4], ['tea', 1], ['biscuits', 4], ['bananas', 1], ['handwash', 1]] },

  // Farhana — loyal with a live credit balance
  { customer: 'farhana', days: 100, items: [['rice10', 3], ['atta', 3], ['oil', 4], ['milk', 6], ['tea', 2], ['surf', 2], ['colgate', 2]] },
  { customer: 'farhana', days: 50, items: [['basmati5', 2], ['oil', 4], ['milk', 8], ['tea', 2], ['biscuits', 6], ['nescafe', 1]] },
  { customer: 'farhana', days: 15, items: [['rice10', 2], ['oil', 3], ['milk', 6], ['tea', 1], ['handwash', 1], ['colgate', 1]], targetDue: 2000 },

  // Ganesh — key wholesale account, high value, largest balance
  { customer: 'ganesh', days: 180, items: [['rice10', 6], ['atta', 4], ['oil', 8], ['milk', 8], ['tea', 3], ['surf', 3], ['colgate', 3]] },
  { customer: 'ganesh', days: 120, items: [['basmati5', 4], ['rice10', 3], ['oil', 6], ['milk', 8], ['tea', 3], ['biscuits', 8]] },
  { customer: 'ganesh', days: 60, items: [['rice10', 5], ['atta', 4], ['oil', 8], ['milk', 8], ['tea', 3], ['surf', 3], ['handwash', 3]] },
  { customer: 'ganesh', days: 20, items: [['basmati5', 4], ['rice10', 4], ['oil', 8], ['milk', 10], ['tea', 4], ['surf', 3], ['colgate', 3]], targetDue: 7800 },
];

function plannedInvoices() {
  return INVOICES.map((plan, index) => {
    const customer = CUSTOMERS.find((row) => row.key === plan.customer);
    const at = daysAgo(plan.days);
    // Keep the day stable across reruns so clientRefs and dates line up.
    at.setHours(11 + (index % 6), (index * 7) % 60, 0, 0);
    const total = plan.items.reduce((sum, [key, qty]) => {
      const product = PRODUCTS.find((row) => row.key === key);
      return sum + product.price * qty;
    }, 0);
    return {
      ...plan,
      index,
      customerRow: customer,
      at,
      dueDate: addDays(at, customer?.creditDays ?? 0),
      clientRef: `DEMO-${plan.customer.toUpperCase()}-${plan.days}D`,
      expectedTotal: total,
    };
  }).sort((a, b) => a.at.getTime() - b.at.getTime());
}

async function ensureInvoice(plan, productByKey, customerByKey) {
  const customer = customerByKey.get(plan.customer);
  if (!customer) throw new Error(`Customer missing for invoice plan ${plan.customer}`);
  const items = plan.items.map(([key, quantity]) => {
    const product = productByKey.get(key);
    if (!product) throw new Error(`Product missing for invoice plan: ${key}`);
    return { productId: product.id, quantity };
  });

  const isCredit = plan.targetDue !== undefined;
  const created = await post('/invoices', {
    customerId: customer.id,
    items,
    payments: isCredit ? [] : [{ method: 'CASH', amount: 999_999 }],
    dueDate: isCredit ? plan.dueDate.toISOString() : null,
    notes: isCredit
      ? `Credit sale · ${plan.customerRow.creditDays} day terms · demo account`
      : 'Counter sale · demo account',
    clientRef: plan.clientRef,
    roundToRupee: true,
  });

  let invoice = created.item;
  if (created.replayed) {
    const fresh = await get(`/invoices/${invoice.id}`);
    invoice = fresh.item;
  } else {
    stats.invoices += 1;
  }

  // Converge partial credit invoices to the intended live balance.
  if (isCredit) {
    const balance = Number(invoice.balanceDue ?? 0);
    const target = Math.min(plan.targetDue, Number(invoice.grandTotal ?? plan.expectedTotal));
    if (balance - target > 0.01) {
      const collect = Math.round((balance - target) * 100) / 100;
      await post(`/invoices/${invoice.id}/payments`, {
        method: 'CASH',
        amount: collect,
        reference: `DEMO-PART-${plan.clientRef}`,
      });
      stats.payments += 1;
      const fresh = await get(`/invoices/${invoice.id}`);
      invoice = fresh.item;
    }
  }

  return { invoice, plan };
}

async function ensureInvoices(productByKey, customerByKey) {
  const results = [];
  for (const plan of plannedInvoices()) {
    const result = await ensureInvoice(plan, productByKey, customerByKey);
    results.push(result);
  }
  console.log(`Invoices ready: ${results.length} (${stats.invoices} created this run)`);
  return results;
}

/* ── Activities and follow-ups ─────────────────────────────────────── */

const ACTIVITIES = [
  { customer: 'priya', type: 'NOTE', subject: 'Prefers WhatsApp for offers', body: 'Do not call during work hours. WhatsApp is best after 6 pm.', daysAgo: 20 },
  { customer: 'priya', type: 'CALL', subject: 'Discussed Diwali gifting order', body: 'Wants 12 gift hampers with atta, oil and tea. Follow up with pricing.', daysAgo: 6 },
  { customer: 'priya', type: 'FOLLOW_UP', subject: 'Confirm Diwali hamper quantity', body: 'Call to confirm 12 hampers and delivery date.', dueIn: 3, daysAgo: 1 },

  { customer: 'karthik', type: 'WHATSAPP', subject: 'Shared wholesale price list', body: 'Sent the November rate card and payment terms.', daysAgo: 10 },
  { customer: 'karthik', type: 'FOLLOW_UP', subject: 'Collect balance for October consignment', body: 'Check bank transfer status for the October invoice.', dueIn: -2, daysAgo: 7 },

  { customer: 'meena', type: 'NOTE', subject: 'Allergic to peanuts', body: 'Check ingredient labels before recommending snacks.', daysAgo: 30 },
  { customer: 'meena', type: 'FOLLOW_UP', subject: 'Wish Meena for her birthday', body: 'Send a WhatsApp greeting and a small loyalty bonus.', dueIn: 16, daysAgo: 2 },

  { customer: 'divya', type: 'CALL', subject: 'Reminder about pending balance', body: 'Spoke about the ₹1,500 balance. She will pay by UPI this week.', daysAgo: 2 },
  { customer: 'divya', type: 'FOLLOW_UP', subject: 'Collect outstanding on credit invoice', body: 'Confirm UPI payment and update the ledger.', dueIn: 0, daysAgo: 1 },

  { customer: 'suresh', type: 'NOTE', subject: 'Moved house recently', body: 'Prefers weekend delivery. New address captured on the profile.', daysAgo: 40 },
  { customer: 'suresh', type: 'FOLLOW_UP', subject: 'Win-back call — no purchase in 2 months', body: 'Offer the festive basket and ask what changed.', dueIn: -5, daysAgo: 12 },

  { customer: 'lakshmi', type: 'NOTE', subject: 'Wholesale buyer, pays by cheque', body: 'Always confirm cheque clearance before the next dispatch.', daysAgo: 80 },
  { customer: 'lakshmi', type: 'FOLLOW_UP', subject: 'Festive stock requirement', body: 'Ask for the December wholesale requirement.', dueIn: 10, daysAgo: 3 },

  { customer: 'vikram', type: 'FOLLOW_UP', subject: 'Win-back: 6 months lapsed', body: 'One-time buyer. Offer a welcome-back discount.', dueIn: -20, daysAgo: 25 },

  { customer: 'ananya', type: 'NOTE', subject: 'First purchase — thanked on WhatsApp', body: 'Sent the loyalty programme welcome message.', daysAgo: 2 },

  { customer: 'rahul', type: 'FOLLOW_UP', subject: 'Intro call — new lead from referral', body: 'Interested in a monthly grocery subscription. Share the starter bundle.', dueIn: 0, daysAgo: 1 },
  { customer: 'rahul', type: 'NOTE', subject: 'Referral source: Karthik', body: 'Referred by Karthik Subramanian.', daysAgo: 3 },

  { customer: 'farhana', type: 'CALL', subject: 'Discussed festive gifting', body: 'Wants a quote for 20 gift boxes before the end of the month.', daysAgo: 12 },
  { customer: 'farhana', type: 'FOLLOW_UP', subject: 'Collect balance on credit invoice', body: 'Confirm the ₹2,000 balance payment.', dueIn: 2, daysAgo: 2 },

  { customer: 'ganesh', type: 'NOTE', subject: 'Key wholesale account — handle with priority', body: 'Monthly order of rice, atta and oil. Always call before dispatch.', daysAgo: 90 },
  { customer: 'ganesh', type: 'CALL', subject: 'Reviewed monthly wholesale order', body: 'Confirmed the November quantities and delivery schedule.', daysAgo: 15 },
  { customer: 'ganesh', type: 'FOLLOW_UP', subject: 'Collect ₹7,800 outstanding', body: 'Large balance pending. Agree a part-payment plan.', dueIn: -3, daysAgo: 9 },
];

async function ensureActivity(plan, customerByKey) {
  const customer = customerByKey.get(plan.customer);
  if (!customer) throw new Error(`Customer missing for activity: ${plan.customer}`);
  const detail = await get(`/customers/${customer.id}`);
  const existing = (detail.item.activities ?? []).find(
    (row) => row.type === plan.type && row.subject === plan.subject,
  );

  const body = {
    type: plan.type,
    subject: plan.subject,
    body: plan.body ?? null,
    dueAt:
      plan.type === 'FOLLOW_UP'
        ? plan.dueIn === 0
          ? daysFromNowInput(0)
          : daysFromNowInput(plan.dueIn)
        : null,
    completed: false,
  };

  // Reset the seeded queue on every run so rehearsals do not erode the demo.
  if (existing) {
    const updated = await patch(`/customers/${customer.id}/activities/${existing.id}`, body);
    return updated.item;
  }

  const created = await post(`/customers/${customer.id}/activities`, body);
  stats.activities += 1;
  return created.item;
}

async function ensureActivities(customerByKey) {
  const results = [];
  for (const plan of ACTIVITIES) {
    const activity = await ensureActivity(plan, customerByKey);
    const at = daysAgo(plan.daysAgo);
    at.setHours(10 + (results.length % 8), (results.length * 5) % 60, 0, 0);
    results.push({ id: activity.id, at });
  }
  console.log(`Activities ready: ${results.length} (${stats.activities} created this run)`);
  return results;
}

/* ── Campaigns ─────────────────────────────────────────────────────── */

const CAMPAIGNS = [
  {
    name: 'Diwali VIP preview',
    channel: 'WHATSAPP',
    message:
      'Hi {firstName}, as one of our most valued customers you are invited to an exclusive Diwali preview at {store}. Show this message for a complimentary gift with your next purchase. You have {points} loyalty points waiting!',
    segment: 'HIGH_VALUE',
    minSpend: 15000,
    inactiveDays: 0,
    includeInactive: false,
    launch: false,
    createdDaysAgo: 1,
  },
  {
    name: 'Win-back: 60-day lapsed',
    channel: 'WHATSAPP',
    message:
      'Hi {firstName}, we have missed you at {store}! Here is 10% off your next visit — just show this message at the counter. Your loyalty balance is {points} points.',
    segment: null,
    minSpend: 0,
    inactiveDays: 60,
    includeInactive: false,
    launch: true,
    markSent: 1,
    createdDaysAgo: 5,
  },
];

async function ensureCampaigns() {
  const list = await get('/crm/campaigns');
  const byName = new Map((list.items ?? []).map((row) => [row.name, row]));
  const results = [];

  // Campaigns are created here but launched after the history spread, because
  // the audience is evaluated against live spend and recency at launch time.
  for (const plan of CAMPAIGNS) {
    let campaign = byName.get(plan.name);
    if (!campaign) {
      const created = await post('/crm/campaigns', {
        name: plan.name,
        channel: plan.channel,
        message: plan.message,
        segment: plan.segment,
        minSpend: plan.minSpend,
        inactiveDays: plan.inactiveDays,
        includeInactive: plan.includeInactive,
      });
      campaign = created.item;
      stats.campaigns += 1;
      console.log(`  + campaign ${plan.name}`);
    }
    results.push({ id: campaign.id, plan });
  }

  console.log(`Campaigns ready: ${results.length} (${stats.campaigns} created this run)`);
  return results;
}

async function launchCampaigns(campaignResults) {
  for (const entry of campaignResults) {
    const { id, plan } = entry;
    if (!plan.launch) continue;

    let detail = (await get(`/crm/campaigns/${id}`)).item;
    if (detail.status === 'DRAFT') {
      const launched = await post(`/crm/campaigns/${id}/launch`);
      detail = launched.item;
      console.log(`  > launched ${plan.name} to ${detail.audienceCount} customers`);
    }

    if (detail.status === 'RUNNING' && (plan.markSent ?? 0) > 0) {
      const fresh = (await get(`/crm/campaigns/${id}`)).item;
      const alreadySent = (fresh.recipients ?? []).filter((row) => row.status === 'SENT').length;
      const target = Math.max(0, plan.markSent - alreadySent);
      const pending = (fresh.recipients ?? []).filter((row) => row.status !== 'SENT');
      for (const recipient of pending.slice(0, target)) {
        await post(`/crm/campaigns/${id}/recipients/${recipient.id}/sent`);
        console.log(`  > marked a message sent for ${plan.name}`);
      }
    }
  }
}

/* ── History spread ────────────────────────────────────────────────── */

async function spreadHistory(invoiceResults, activityResults) {
  if (!backdate) {
    console.log('Backdating disabled (DEMO_BACKDATE=false)');
    return;
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await prisma.$transaction(
      async (tx) => {
        // Ledger and loyalty rows are append-only by guard trigger. Backdating
        // seeded history is the one legitimate exception, so suspend user
        // triggers for this transaction only.
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);

        const invoicePlans = new Map(
          invoiceResults.map((row) => [row.invoice.id, row.plan]),
        );

        for (const [invoiceId, plan] of invoicePlans) {
          await tx.invoice.update({
            where: { id: invoiceId },
            data: {
              createdAt: plan.at,
              dueDate: plan.targetDue !== undefined ? plan.dueDate : null,
            },
          });

          await tx.customerLedger.updateMany({
            where: { referenceType: 'INVOICE', referenceId: invoiceId },
            data: { entryDate: plan.at, createdAt: plan.at },
          });

          await tx.loyaltyTransaction.updateMany({
            where: { referenceType: 'INVOICE', referenceId: invoiceId },
            data: { createdAt: plan.at },
          });

          const allocations = await tx.paymentAllocation.findMany({
            where: { invoiceId },
            select: { paymentId: true },
          });
          if (allocations.length > 0) {
            await tx.payment.updateMany({
              where: { id: { in: allocations.map((row) => row.paymentId) } },
              data: { receivedAt: plan.at, createdAt: plan.at },
            });
          }
        }

        for (const activity of activityResults) {
          await tx.customerActivity.update({
            where: { id: activity.id },
            data: { createdAt: activity.at },
          });
        }

        // Customer lifetime fields: first purchase date feeds "customer since",
        // while the latest invoice date feeds at-risk and segment calculations.
        for (const customer of CUSTOMERS) {
          const row = await tx.customer.findFirst({ where: { mobile: customer.mobile } });
          if (!row) continue;
          const plans = plannedInvoices().filter((plan) => plan.customer === customer.key);
          const latest = plans.length
            ? plans.reduce((acc, plan) => (plan.at > acc ? plan.at : acc), plans[0].at)
            : null;
          const joinedAt = plans.length
            ? addDays(
                plans.reduce((acc, plan) => (plan.at < acc ? plan.at : acc), plans[0].at),
                -Math.max(30, Math.round(customer.joinedDaysAgo / 3)),
              )
            : daysAgo(customer.joinedDaysAgo);
          await tx.customer.update({
            where: { id: row.id },
            data: {
              createdAt: joinedAt,
              lastPurchaseAt: latest,
            },
          });
        }
      },
      { timeout: 120_000, maxWait: 20_000 },
    );

    console.log(
      `History spread across invoices, payments, loyalty, activities and customers (${databaseUrl.replace(/:[^:@/]+@/, ':***@')})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

/* ── Campaign history ──────────────────────────────────────────────── */

async function spreadCampaignDates(campaignResults) {
  if (!backdate) return;
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    for (const campaign of campaignResults) {
      const createdAt = daysAgo(campaign.plan.createdDaysAgo);
      await prisma.customerCampaign.update({
        where: { id: campaign.id },
        data: {
          createdAt,
          ...(campaign.plan.launch ? { launchedAt: addDays(createdAt, 1) } : {}),
        },
      });
      if (campaign.plan.markSent) {
        await prisma.campaignRecipient.updateMany({
          where: { campaignId: campaign.id, status: 'SENT' },
          data: { createdAt: addDays(createdAt, 1), sentAt: addDays(createdAt, 1) },
        });
      }
    }
    console.log('Campaign dates spread across the last few days');
  } finally {
    await prisma.$disconnect();
  }
}

/* ── Verification ──────────────────────────────────────────────────── */

async function verify() {
  const overview = (await get('/crm/overview')).item;
  const customers = await get('/customers?page=1&pageSize=100');
  const followUps = await get('/customers/follow-ups?scope=open');
  const occasions = await get('/customers/occasions');
  const campaigns = await get('/crm/campaigns');
  const invoiceList = await get('/invoices?page=1&pageSize=100');
  const dues = await get('/customers/summary');

  console.log('\n── CRM snapshot ─────────────────────────────────────────');
  console.log(`Customers          ${customers.meta.total}`);
  console.log(`Invoices           ${invoiceList.meta.total}`);
  console.log(`Repeat customers   ${overview.totals.repeat} (${overview.totals.repeatRate}%)`);
  console.log(`At risk (60+ days) ${overview.totals.atRisk}`);
  console.log(`Receivables        ${overview.receivables.length} customers / ₹${dues.item.totalOutstanding}`);
  console.log(`Follow-ups         ${followUps.counts.overdue} overdue, ${followUps.counts.today} today, ${followUps.counts.upcoming} upcoming`);
  console.log(`Occasions (45d)    ${occasions.item.items.length}`);
  console.log(`Campaigns          ${campaigns.items.length}`);
  for (const row of campaigns.items) {
    console.log(`  · ${row.name}: ${row.status}, ${row.sentCount}/${row.audienceCount || row.recipientCount} sent`);
  }
  console.log('─────────────────────────────────────────────────────────');
}

async function main() {
  console.log(`Demo data → ${base}`);
  await login();
  const products = await ensureProducts();
  const customers = await ensureCustomers();
  const invoices = await ensureInvoices(products, customers);
  const activities = await ensureActivities(customers);
  await spreadHistory(invoices, activities);

  // Recalculate segments after backdating so the segment mix, campaign
  // audiences and the CRM overview all match the seeded history.
  await post('/customers/segments/recalculate');

  const campaigns = await ensureCampaigns();
  await launchCampaigns(campaigns);
  await spreadCampaignDates(campaigns);
  await verify();

  console.log('\nDemo data ready. Sign in at http://localhost:5173 and open /crm.');
}

main().catch((error) => {
  console.error('\nDemo data failed:', error.message);
  if (error.data) console.error(JSON.stringify(error.data, null, 2));
  process.exit(1);
});
