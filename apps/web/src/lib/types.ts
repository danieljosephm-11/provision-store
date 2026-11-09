import type { AuthUser } from '@ps/shared';

export type { AuthUser };

export interface Meta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: Meta;
}

export interface Single<T> {
  item: T;
}

// ── Store ────────────────────────────────────────────────────────────
export interface Store {
  id: string;
  name: string;
  legalName: string | null;
  gstin: string | null;
  stateCode: string;
  address: string | null;
  city: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  invoicePrefix: string;
  invoiceTerms: string | null;
  billFooter: string | null;
  taxEnabled: boolean;
  allowNegativeStock: boolean;
  loyaltyEnabled: boolean;
  loyaltyEarnPerAmount: number;
  loyaltyPointValue: number;
  timezone: string;
  financialYearStartMonth: number;
  createdAt: string;
  updatedAt: string;
}

// ── Catalog ──────────────────────────────────────────────────────────
export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  productCount: number;
}

export interface Brand {
  id: string;
  name: string;
  isActive: boolean;
  productCount: number;
}

export interface Unit {
  id: string;
  storeId: string;
  name: string;
  code: string;
  allowsDecimal: boolean;
  isSystem: boolean;
  productCount: number;
}

export interface TaxRate {
  id: string;
  storeId: string;
  name: string;
  rate: number;
  cessRate: number;
  hsnCode: string | null;
  isDefault: boolean;
  isActive: boolean;
  productCount: number;
}

export interface CatalogRef {
  id: string;
  name: string;
}

export interface ProductTaxRate {
  id: string;
  name: string;
  rate: number;
  cessRate: number;
  hsnCode?: string | null;
}

export interface CatalogOptions {
  categories: Category[];
  brands: Brand[];
  units: Unit[];
  taxRates: TaxRate[];
}

// ── Products ─────────────────────────────────────────────────────────
export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  imageUrl: string | null;
  category: CatalogRef | null;
  brand: CatalogRef | null;
  unit: { id: string; name: string; code: string; allowsDecimal?: boolean };
  taxRate: ProductTaxRate | null;
  sellingPrice: number;
  mrp: number;
  priceIncludesTax: boolean;
  hsnCode: string | null;
  minStock: number;
  trackBatches: boolean;
  trackExpiry: boolean;
  status: 'ACTIVE' | 'ARCHIVED';
  stock: number;
  lowStock: boolean;
  outOfStock: boolean;
  purchasePrice?: number;
  stockValue?: number;
  margin?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductLookup {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  sellingPrice: number;
  mrp: number;
  priceIncludesTax: boolean;
  taxRate: number;
  taxRateId: string | null;
  unit: { id: string; name: string; code: string; allowsDecimal?: boolean };
  stock: number;
  trackBatches: boolean;
  imageUrl: string | null;
  hsnCode: string | null;
}

// ── Customers ────────────────────────────────────────────────────────
export interface Customer {
  id: string;
  code: string;
  name: string;
  mobile: string;
  email: string | null;
  gstin: string | null;
  creditLimit: number;
  creditDays: number;
  loyaltyPoints: number;
  segment: string;
  totalPurchases: number;
  totalSpent: number;
  lastPurchaseAt: string | null;
  birthday: string | null;
  anniversary: string | null;
  tags: string[];
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  outstanding: number;
  availableCredit: number;
}

export interface CustomerActivity {
  id: string;
  type: string;
  subject: string;
  body: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
}

export interface CustomerCampaignLink {
  id: string;
  status: string;
  sentAt: string | null;
  campaign: {
    id: string;
    name: string;
    channel: string;
    status: string;
    message: string;
    launchedAt: string | null;
  };
}

export interface CustomerInsights {
  averageOrderValue: number;
  daysSinceLastPurchase: number | null;
  creditUtilization: number;
  favouriteProducts: {
    productId: string | null;
    name: string;
    category: string | null;
    quantity: number;
    revenue: number;
  }[];
  openFollowUp: { id: string; subject: string; dueAt: string | null } | null;
  returnCount: number;
  monthlySpend: { month: string; total: number }[];
}

export interface TimelineItem {
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
}

export interface FollowUpItem extends CustomerActivity {
  customer: {
    id: string;
    name: string;
    mobile: string;
    segment: string;
    totalSpent: number;
    tags: string[];
  };
  overdue: boolean;
}

export interface FollowUpResponse {
  items: FollowUpItem[];
  counts: { overdue: number; today: number; upcoming: number };
}

export interface OccasionItem {
  id: string;
  customerId: string;
  name: string;
  mobile: string;
  kind: 'BIRTHDAY' | 'ANNIVERSARY';
  date: string;
  daysAway: number;
  segment: string;
  loyaltyPoints: number;
  totalSpent: number;
  tags: string[];
}

export interface CampaignRecipient {
  id: string;
  status: string;
  sentAt: string | null;
  message: string;
  customer: {
    id: string;
    name: string;
    mobile: string;
    segment: string;
    loyaltyPoints: number;
    totalSpent: number;
    outstanding: number;
  };
}

export interface Campaign {
  id: string;
  name: string;
  channel: string;
  message: string;
  segment: string | null;
  minSpend: number;
  inactiveDays: number;
  includeInactive: boolean;
  status: string;
  audienceCount: number;
  sentCount: number;
  recipientCount: number;
  createdAt: string;
  launchedAt: string | null;
  completedAt: string | null;
  author: { id: string; name: string } | null;
}

export interface CampaignDetail extends Campaign {
  recipients: CampaignRecipient[];
}

export interface CrmOverview {
  totals: {
    customers: number;
    active: number;
    newThisMonth: number;
    repeat: number;
    repeatRate: number;
    atRisk: number;
    averageLifetimeValue: number;
    lifetimeSales: number;
  };
  followUps: { counts: FollowUpResponse['counts']; items: FollowUpItem[] };
  occasions: OccasionItem[];
  segments: { segment: string; count: number }[];
  topCustomers: {
    id: string;
    name: string;
    mobile: string;
    segment: string;
    totalSpent: number;
    totalPurchases: number;
    lastPurchaseAt: string | null;
  }[];
  receivables: {
    id: string;
    name: string;
    mobile: string;
    outstanding: number;
    creditLimit: number;
    creditDays: number;
  }[];
  recentCampaigns: Campaign[];
}

export interface LedgerEntry {
  id: string;
  seq: number;
  entryDate: string;
  type: string;
  description: string | null;
  debit: number;
  credit: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  user?: { id: string; name: string } | null;
}

export interface CustomerAddress {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  stateCode: string | null;
  pincode: string | null;
  isDefault: boolean;
}

export interface CustomerDetail extends Customer {
  addresses: CustomerAddress[];
  ledger: LedgerEntry[];
  invoices: (InvoiceListRow & { createdAt: string })[];
  payments: CustomerPayment[];
  loyaltyTransactions: { id: string; points: number; type: string; note: string | null; createdAt: string }[];
  activities: CustomerActivity[];
  campaigns: CustomerCampaignLink[];
  insights: CustomerInsights;
}

export interface CustomerPayment {
  id: string;
  customerId: string;
  amount: number;
  method: string;
  reference: string | null;
  paidAt: string;
  note: string | null;
}

// ── Suppliers ────────────────────────────────────────────────────────
export interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  mobile: string;
  email: string | null;
  gstin: string | null;
  address: string | null;
  city: string | null;
  stateCode: string | null;
  pincode: string | null;
  openingBalance: number;
  creditDays: number;
  isActive: boolean;
  createdAt: string;
  outstanding: number;
  purchaseCount: number;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  purchaseId: string | null;
  amount: number;
  method: string;
  reference: string | null;
  paidAt: string;
  note: string | null;
}

export interface SupplierDetail extends Supplier {
  ledger: LedgerEntry[];
  purchases: {
    id: string;
    purchaseNumber: string;
    invoiceDate: string;
    total: number;
    paidAmount: number;
    balanceAmount: number;
    status: string;
  }[];
  payments: SupplierPayment[];
}

// ── Sales ────────────────────────────────────────────────────────────
export interface InvoiceListRow {
  id: string;
  invoiceNo: string;
  status: 'COMPLETED' | 'VOID' | string;
  paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID' | string;
  customerId: string | null;
  customerName: string | null;
  customerMobile: string | null;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
  itemCount: number;
  returnCount: number;
  createdAt: string;
  createdBy: string;
}

export interface InvoiceItem {
  id: string;
  productId: string | null;
  batchId: string | null;
  productName: string;
  sku: string | null;
  hsn: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  mrp: number;
  priceIncludesTax: boolean;
  grossAmount: number;
  discountAmount: number;
  discountPercent: number;
  billDiscountShare: number;
  taxableAmount: number;
  taxRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxAmount: number;
  lineTotal: number;
  costAtSale: number;
  returnedQuantity: number;
}

export interface InvoicePayment {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  receivedAt: string;
  direction: string;
  paymentId: string;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  financialYear: string;
  status: string;
  customerId: string | null;
  customerName: string | null;
  customerMobile: string | null;
  placeOfSupplyState: string | null;
  subtotal: number;
  itemDiscount: number;
  billDiscount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  taxAmount: number;
  roundOff: number;
  loyaltyPointsRedeemed: number;
  loyaltyDiscount: number;
  pointsEarned: number;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
  paymentStatus: string;
  notes: string | null;
  dueDate: string | null;
  idempotencyKey: string | null;
  clientRef: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  customer: { id: string; name: string; mobile: string; gstin: string | null; creditLimit: number } | null;
  createdByUser: { id: string; name: string } | null;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  returns: { id: string; returnNo: string; total: number; createdAt: string; status: string }[];
}

export interface CreateInvoiceResponse {
  item: Invoice;
  replayed: boolean;
  changeDue: number;
}

export interface SaleReturnItem {
  id: string;
  invoiceItemId: string;
  productId: string | null;
  productName: string | null;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  lineTotal: number;
  restock: boolean;
  batchId: string | null;
}

export interface SaleReturn {
  id: string;
  returnNo: string;
  invoiceId: string;
  invoiceNo: string | null;
  customerId: string | null;
  customer: { id: string; name: string; mobile: string } | null;
  returnDate: string;
  reason: string | null;
  refundMethod: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  restock: boolean;
  status: string;
  createdByUser: { id: string; name: string } | null;
  createdAt: string;
  payout?: number;
  creditApplied?: number;
  items: SaleReturnItem[];
}

export interface HeldBill {
  id: string;
  name: string;
  customerId: string | null;
  customer: { id: string; name: string; mobile: string } | null;
  payload: Record<string, unknown>;
  subtotal: number;
  createdByUser: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

// ── Purchases ────────────────────────────────────────────────────────
export interface PurchaseListRow {
  id: string;
  purchaseNumber: string;
  supplierInvoiceNo: string | null;
  supplierId: string;
  supplier: { id: string; name: string; mobile: string };
  status: string;
  invoiceDate: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  balanceAmount: number;
  itemCount: number;
  returnCount: number;
  createdAt: string;
}

export interface PurchaseItem {
  id: string;
  productId: string;
  product: { id: string; name: string; sku: string };
  quantity: number;
  freeQuantity: number;
  unitCost: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  batchNo: string | null;
  expiryDate: string | null;
  returnedQuantity?: number;
}

export interface Purchase {
  id: string;
  purchaseNumber: string;
  supplierInvoiceNo: string | null;
  supplierId: string;
  supplier: { id: string; name: string; mobile: string; gstin: string | null };
  purchaseOrderId: string | null;
  status: string;
  invoiceDate: string;
  receivedDate: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  balanceAmount: number;
  notes: string | null;
  items: PurchaseItem[];
  createdByUser: { id: string; name: string } | null;
  createdAt: string;
  returns: { id: string; returnNumber: string; total: number; returnDate: string; status: string }[];
  purchaseOrder: { id: string; poNumber: string } | null;
}

export interface PurchaseOrderListRow {
  id: string;
  poNumber: string;
  supplierId: string;
  supplier: { id: string; name: string; mobile: string };
  status: string;
  orderDate: string;
  expectedDate: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  itemCount: number;
  purchaseCount: number;
  createdAt: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplier: { id: string; name: string; mobile: string; gstin: string | null };
  status: string;
  orderDate: string;
  expectedDate: string | null;
  notes: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  items: {
    id: string;
    productId: string;
    product: { id: string; name: string; sku: string };
    quantity: number;
    receivedQuantity: number;
    unitCost: number;
    taxRate: number;
    lineTotal: number;
  }[];
  purchases: { id: string; purchaseNumber: string; total: number; createdAt: string }[];
  createdByUser?: { id: string; name: string } | null;
  createdAt: string;
}

export interface PurchaseReturn {
  id: string;
  returnNumber: string;
  purchaseId: string;
  purchaseNumber: string;
  supplierId: string;
  supplier: { id: string; name: string; mobile: string };
  returnDate: string;
  reason: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  status: string;
  createdByUser: { id: string; name: string } | null;
  createdAt: string;
  items: {
    id: string;
    purchaseItemId: string;
    productId: string;
    product: { id: string; name: string; sku: string };
    quantity: number;
    unitCost: number;
    taxRate: number;
    taxAmount: number;
    lineTotal: number;
  }[];
}

// ── Expenses ─────────────────────────────────────────────────────────
export interface ExpenseCategory {
  id: string;
  name: string;
  isSystem: boolean;
  isActive: boolean;
  expenseCount: number;
}

export interface Expense {
  id: string;
  expenseNumber: string;
  categoryId: string;
  category: { id: string; name: string };
  expenseDate: string;
  amount: number;
  paymentMethod: string;
  vendor: string | null;
  reference: string | null;
  notes: string | null;
  receiptUrl: string | null;
  status: string;
  createdByUser: { id: string; name: string } | null;
  createdAt: string;
}

export interface ExpenseSummary {
  from: string;
  to: string;
  total: number;
  items: { category: string; total: number; count: number }[];
}

// ── Inventory ────────────────────────────────────────────────────────
export interface InventoryRow {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  unit: { id: string; name: string; code: string };
  category: CatalogRef | null;
  brand: CatalogRef | null;
  taxRate: ProductTaxRate | null;
  sellingPrice: number;
  purchasePrice: number;
  priceIncludesTax: boolean;
  trackBatches: boolean;
  trackExpiry: boolean;
  quantity: number;
  minStock: number;
  avgCost: number;
  costValue: number;
  retailValue: number;
  lowStock: boolean;
  outOfStock: boolean;
  updatedAt: string | null;
}

export interface StockMovement {
  id: string;
  seq: number;
  type: string;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  unitCost: number | null;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  product: { id: string; name: string; sku: string; unit: { code: string } };
  batch: { id: string; batchNo: string; expiryDate: string | null } | null;
  user: { id: string; name: string } | null;
  createdAt: string;
}

export interface Valuation {
  totals: {
    quantity: number;
    costValue: number;
    retailValue: number;
    products: number;
    potentialMargin: number;
  };
  byCategory: {
    category: string;
    quantity: number;
    costValue: number;
    retailValue: number;
    products: number;
  }[];
}

export interface ExpiringBatch {
  id: string;
  batchNo: string;
  expiryDate: string | null;
  quantity: number;
  purchasePrice: number;
  product: { id: string; name: string; sku: string; unit: { code: string } };
  daysRemaining: number | null;
  expired: boolean;
}

export interface Location {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface StockTransfer {
  id: string;
  referenceNo: string;
  fromLocationId: string;
  toLocationId: string;
  note: string | null;
  createdAt: string;
  items: { id: string; productId: string; quantity: number; product: { id: string; name: string; sku: string } | null }[];
}

// ── Dashboard ────────────────────────────────────────────────────────
export interface DashboardData {
  range: { from: string; to: string };
  today: { invoices: number; sales: number; averageBill: number };
  period: {
    invoices: number;
    sales: number;
    tax: number;
    averageBill: number;
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMargin: number;
    expenses: number;
    netProfit: number;
    outstanding: number;
  };
  receivables: { total: number; customers: number };
  payables: { total: number; suppliers: number };
  counts: {
    products: number;
    customers: number;
    lowStock: number;
    outOfStock: number;
    expiring: number;
    expiringValue: number;
  };
  trends: { day: string; total: number; invoices: number }[];
  topProducts: { name: string; quantity: number; revenue: number; profit: number }[];
  topCustomers: { name: string; total: number; invoices: number }[];
  categorySales: { name: string; total: number }[];
  paymentBreakdown: { method: string; direction: string; total: number }[];
  recentInvoices: {
    id: string;
    invoiceNo: string;
    customerName: string | null;
    grandTotal: number;
    paymentStatus: string;
    status: string;
    createdAt: string;
  }[];
}

// ── Reports ──────────────────────────────────────────────────────────
export interface ReportSummaryItem {
  key: string;
  title: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  type: 'text' | 'int' | 'money' | 'qty' | 'date' | 'percent';
  align?: 'left' | 'right';
}

export interface ReportResult {
  key: string;
  title: string;
  range: { from: string | null; to: string | null };
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, unknown>;
  summary?: { label: string; value: number | string }[];
}

// ── Users / roles ────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: { id: string; name: string };
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissionKeys: string[];
  createdAt: string;
}

export interface Permission {
  key: string;
  module: string;
  description: string;
}

export interface PermissionList {
  items: Permission[];
  grouped: Record<string, Permission[]>;
}

// ── Audit ────────────────────────────────────────────────────────────
export interface AuditLog {
  id: string;
  storeId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}
