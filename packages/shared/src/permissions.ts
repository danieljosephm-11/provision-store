export interface PermissionDef {
  key: string;
  module: string;
  description: string;
}

const p = (module: string, key: string, description: string): PermissionDef => ({
  key,
  module,
  description,
});

export const PERMISSIONS: PermissionDef[] = [
  p('dashboard', 'dashboard.view', 'View business dashboard'),

  p('pos', 'pos.sell', 'Create sales from the POS'),
  p('pos', 'pos.hold', 'Hold and resume bills'),
  p('pos', 'pos.discount', 'Apply item and bill discounts'),
  p('pos', 'pos.credit', 'Sell on customer credit'),
  p('pos', 'pos.void', 'Void an invoice'),
  p('pos', 'pos.return', 'Create sale returns and refunds'),

  p('products', 'product.read', 'View products'),
  p('products', 'product.create', 'Create products'),
  p('products', 'product.update', 'Edit products'),
  p('products', 'product.archive', 'Archive products'),
  p('products', 'product.import', 'Import products from Excel'),
  p('products', 'product.export', 'Export products'),

  p('catalog', 'category.manage', 'Manage categories'),
  p('catalog', 'brand.manage', 'Manage brands'),
  p('catalog', 'unit.manage', 'Manage units'),
  p('catalog', 'tax.manage', 'Manage GST tax rates'),

  p('inventory', 'inventory.read', 'View stock and movement history'),
  p('inventory', 'inventory.adjust', 'Adjust stock with a recorded movement'),
  p('inventory', 'inventory.transfer', 'Transfer stock between locations'),

  p('customers', 'customer.read', 'View customers'),
  p('customers', 'customer.create', 'Register customers'),
  p('customers', 'customer.update', 'Edit customers'),
  p('customers', 'customer.delete', 'Deactivate customers'),
  p('customers', 'customer.credit.manage', 'Change customer credit limits'),
  p('customers', 'customer.payment', 'Record customer payments'),
  p('customers', 'customer.activity', 'Log customer interactions and follow-ups'),
  p('customers', 'customer.campaign', 'Create and run customer campaigns'),

  p('suppliers', 'supplier.read', 'View suppliers'),
  p('suppliers', 'supplier.create', 'Create suppliers'),
  p('suppliers', 'supplier.update', 'Edit suppliers'),
  p('suppliers', 'supplier.delete', 'Deactivate suppliers'),
  p('suppliers', 'supplier.payment', 'Record supplier payments'),

  p('purchases', 'purchase.read', 'View purchases and purchase orders'),
  p('purchases', 'purchase.create', 'Create purchase orders and purchases'),
  p('purchases', 'purchase.receive', 'Receive stock against a purchase'),
  p('purchases', 'purchase.return', 'Create purchase returns'),
  p('purchases', 'purchase.pay', 'Pay suppliers against purchases'),

  p('invoices', 'invoice.read', 'View invoices'),
  p('invoices', 'invoice.void', 'Void invoices'),
  p('returns', 'return.read', 'View returns'),
  p('returns', 'return.create', 'Create returns'),

  p('expenses', 'expense.read', 'View expenses'),
  p('expenses', 'expense.create', 'Record expenses'),
  p('expenses', 'expense.update', 'Edit expenses'),
  p('expenses', 'expense.delete', 'Reverse expenses'),
  p('expenses', 'expense.category.manage', 'Manage expense categories'),

  p('reports', 'report.view', 'View reports'),
  p('reports', 'report.export', 'Export reports as PDF/Excel'),

  p('users', 'user.read', 'View employees'),
  p('users', 'user.create', 'Create employees'),
  p('users', 'user.update', 'Edit employees'),
  p('users', 'user.delete', 'Deactivate employees'),
  p('roles', 'role.read', 'View roles and permissions'),
  p('roles', 'role.manage', 'Edit role permissions'),

  p('settings', 'settings.read', 'View store settings'),
  p('settings', 'settings.update', 'Edit store settings'),
  p('audit', 'audit.read', 'View audit logs'),
  p('backup', 'backup.manage', 'Run and manage backups'),
];

export const PERMISSION_KEYS = PERMISSIONS.map((x) => x.key);

export const SYSTEM_ROLES = ['Admin', 'Manager', 'Cashier', 'Stock Manager', 'Accountant'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

const ALL = PERMISSION_KEYS;

const MANAGER: string[] = ALL.filter(
  (k) => !['role.manage', 'settings.update', 'backup.manage', 'tax.manage'].includes(k),
);

const CASHIER: string[] = [
  'dashboard.view',
  'pos.sell',
  'pos.hold',
  'pos.discount',
  'pos.credit',
  'pos.return',
  'product.read',
  'inventory.read',
  'customer.read',
  'customer.create',
  'customer.update',
  'customer.payment',
  'customer.activity',
  'invoice.read',
  'return.read',
  'return.create',
  'report.view',
];

const STOCK_MANAGER: string[] = [
  'dashboard.view',
  'product.read',
  'product.create',
  'product.update',
  'product.archive',
  'product.import',
  'product.export',
  'category.manage',
  'brand.manage',
  'unit.manage',
  'inventory.read',
  'inventory.adjust',
  'inventory.transfer',
  'supplier.read',
  'supplier.create',
  'supplier.update',
  'supplier.payment',
  'purchase.read',
  'purchase.create',
  'purchase.receive',
  'purchase.return',
  'purchase.pay',
  'invoice.read',
  'expense.read',
  'report.view',
  'report.export',
];

const ACCOUNTANT: string[] = [
  'dashboard.view',
  'product.read',
  'inventory.read',
  'customer.read',
  'customer.payment',
  'customer.credit.manage',
  'supplier.read',
  'supplier.payment',
  'purchase.read',
  'purchase.pay',
  'invoice.read',
  'return.read',
  'expense.read',
  'expense.create',
  'expense.update',
  'expense.delete',
  'expense.category.manage',
  'report.view',
  'report.export',
  'settings.read',
  'audit.read',
];

export const ROLE_PERMISSIONS: Record<SystemRole, string[]> = {
  Admin: ALL,
  Manager: MANAGER,
  Cashier: CASHIER,
  'Stock Manager': STOCK_MANAGER,
  Accountant: ACCOUNTANT,
};

export function hasPermission(permissions: string[] | undefined, key: string): boolean {
  return !!permissions && permissions.includes(key);
}
