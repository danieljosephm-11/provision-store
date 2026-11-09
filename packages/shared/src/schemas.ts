import { z } from 'zod';
import { GSTIN_REGEX, INDIAN_MOBILE_REGEX, PINCODE_REGEX } from './money';

export const uuidSchema = z.string().uuid('Invalid identifier');
const optionalUuid = z.string().uuid().nullish();
const optionalText = (max = 500) => z.string().trim().max(max).nullish();
const money = z.coerce.number().min(0, 'Cannot be negative').max(999999999, 'Amount too large');
const qty = z.coerce.number().positive('Must be greater than zero').max(9999999, 'Quantity too large');

export const discountSchema = z.object({
  type: z.enum(['percent', 'flat']),
  value: z.coerce.number().min(0).max(1000000),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sortBy: z.string().max(40).optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type PaginationQuery = z.infer<typeof paginationSchema>;

// ── Auth ─────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required').max(200),
});
export const forgotPasswordSchema = z.object({ email: z.string().trim().email() });
export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z
    .string()
    .min(10, 'Use at least 10 characters')
    .max(200)
    .regex(/[A-Z]/, 'Include an uppercase letter')
    .regex(/[a-z]/, 'Include a lowercase letter')
    .regex(/[0-9]/, 'Include a number'),
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(10, 'Use at least 10 characters')
    .max(200)
    .regex(/[A-Z]/, 'Include an uppercase letter')
    .regex(/[a-z]/, 'Include a lowercase letter')
    .regex(/[0-9]/, 'Include a number'),
});

// ── Catalog ──────────────────────────────────────────────────────────
export const productSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  sku: z.string().trim().min(1, 'SKU is required').max(60),
  barcode: z.string().trim().max(80).nullish(),
  categoryId: optionalUuid,
  brandId: optionalUuid,
  unitId: uuidSchema,
  taxRateId: optionalUuid,
  description: optionalText(2000),
  imageUrl: optionalText(500),
  purchasePrice: money.default(0),
  sellingPrice: money.default(0),
  mrp: money.default(0),
  priceIncludesTax: z.boolean().default(true),
  hsnCode: z.string().trim().regex(/^[0-9]{4,8}$/, 'HSN must be 4-8 digits').nullish(),
  minStock: z.coerce.number().min(0).default(0),
  trackBatches: z.boolean().default(false),
  trackExpiry: z.boolean().default(false),
  status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE'),
});
export type ProductInput = z.infer<typeof productSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: optionalUuid,
  isActive: z.boolean().default(true),
});
export const brandSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const unitSchema = z.object({
  name: z.string().trim().min(1).max(40),
  code: z.string().trim().min(1).max(10).transform((v) => v.toUpperCase()),
  allowsDecimal: z.boolean().default(false),
});
export const taxRateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  rate: z.coerce.number().min(0).max(100),
  cessRate: z.coerce.number().min(0).max(100).default(0),
  hsnCode: z.string().trim().regex(/^[0-9]{4,8}$/).nullish(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

// ── Customers ────────────────────────────────────────────────────────
const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .nullish()
  .or(z.literal('').transform(() => null));

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  mobile: z.string().trim().regex(INDIAN_MOBILE_REGEX, 'Enter a valid 10-digit Indian mobile'),
  email: z.string().trim().email('Invalid email').nullish().or(z.literal('').transform(() => null)),
  gstin: z.string().trim().toUpperCase().regex(GSTIN_REGEX, 'Invalid GSTIN').nullish().or(z.literal('').transform(() => null)),
  creditLimit: money.default(0),
  creditDays: z.coerce.number().int().min(0).max(365).default(0),
  notes: optionalText(1000),
  birthday: dateOnly,
  anniversary: dateOnly,
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  isActive: z.boolean().default(true),
  address: z
    .object({
      line1: z.string().trim().min(1),
      line2: optionalText(200),
      city: optionalText(80),
      stateCode: optionalText(2),
      pincode: z.string().trim().regex(PINCODE_REGEX).nullish(),
    })
    .nullish(),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const customerPaymentSchema = z.object({
  amount: qty,
  method: z.enum(['CASH', 'UPI', 'CARD', 'CREDIT', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']),
  reference: optionalText(120),
  paidAt: z.string().optional(),
  note: optionalText(500),
});

// ── CRM ──────────────────────────────────────────────────────────────
export const CUSTOMER_ACTIVITY_TYPES = [
  'NOTE',
  'CALL',
  'WHATSAPP',
  'EMAIL',
  'MEETING',
  'FOLLOW_UP',
] as const;
export type CustomerActivityTypeInput = (typeof CUSTOMER_ACTIVITY_TYPES)[number];

export const customerSegmentSchema = z.enum(['NEW', 'REGULAR', 'LOYAL', 'HIGH_VALUE', 'INACTIVE']);
export type CustomerSegmentInput = z.infer<typeof customerSegmentSchema>;

export const customerActivitySchema = z.object({
  type: z.enum(CUSTOMER_ACTIVITY_TYPES),
  subject: z.string().trim().min(1, 'Add a short subject').max(160),
  body: optionalText(2000),
  dueAt: z
    .string()
    .trim()
    .min(1)
    .nullish()
    .or(z.literal('').transform(() => null)),
  completed: z.boolean().default(false),
});
export type CustomerActivityInput = z.infer<typeof customerActivitySchema>;

export const customerActivityUpdateSchema = z.object({
  type: z.enum(CUSTOMER_ACTIVITY_TYPES).optional(),
  subject: z.string().trim().min(1).max(160).optional(),
  body: optionalText(2000),
  dueAt: z
    .string()
    .trim()
    .min(1)
    .nullish()
    .or(z.literal('').transform(() => null)),
  completed: z.boolean().optional(),
});
export type CustomerActivityUpdateInput = z.infer<typeof customerActivityUpdateSchema>;

export const CAMPAIGN_CHANNELS = ['WHATSAPP', 'SMS', 'EMAIL'] as const;
export type CampaignChannelInput = (typeof CAMPAIGN_CHANNELS)[number];

export const campaignSchema = z.object({
  name: z.string().trim().min(1, 'Name the campaign').max(120),
  channel: z.enum(CAMPAIGN_CHANNELS),
  message: z.string().trim().min(1, 'Write the message').max(1000),
  segment: customerSegmentSchema.nullish().or(z.literal('').transform(() => null)),
  minSpend: money.default(0),
  inactiveDays: z.coerce.number().int().min(0).max(3650).default(0),
  includeInactive: z.boolean().default(false),
});
export type CampaignInput = z.infer<typeof campaignSchema>;

export const campaignAudienceSchema = campaignSchema.pick({
  segment: true,
  minSpend: true,
  inactiveDays: true,
  includeInactive: true,
});
export type CampaignAudienceInput = z.infer<typeof campaignAudienceSchema>;

export const customerImportSchema = z.object({
  csv: z.string().min(1, 'Paste or upload a CSV first').max(2_000_000),
});


// ── Suppliers ────────────────────────────────────────────────────────
export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contactPerson: optionalText(120),
  mobile: z.string().trim().regex(INDIAN_MOBILE_REGEX, 'Enter a valid 10-digit mobile'),
  email: z.string().trim().email().nullish().or(z.literal('').transform(() => null)),
  gstin: z.string().trim().toUpperCase().regex(GSTIN_REGEX, 'Invalid GSTIN').nullish().or(z.literal('').transform(() => null)),
  address: optionalText(500),
  city: optionalText(80),
  stateCode: optionalText(2),
  pincode: z.string().trim().regex(PINCODE_REGEX).nullish(),
  openingBalance: money.default(0),
  creditDays: z.coerce.number().int().min(0).max(365).default(0),
  isActive: z.boolean().default(true),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const supplierPaymentSchema = z.object({
  amount: qty,
  method: z.enum(['CASH', 'UPI', 'CARD', 'CREDIT', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']),
  reference: optionalText(120),
  purchaseId: optionalUuid,
  paidAt: z.string().optional(),
  note: optionalText(500),
});

// ── Inventory ────────────────────────────────────────────────────────
export const inventoryAdjustSchema = z.object({
  productId: uuidSchema,
  type: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY', 'OPENING']),
  quantity: qty,
  note: z.string().trim().min(3, 'Add a reason for this movement').max(500),
  batchId: optionalUuid,
});

// ── Purchases ────────────────────────────────────────────────────────
export const purchaseItemSchema = z.object({
  productId: uuidSchema,
  quantity: qty,
  freeQuantity: z.coerce.number().min(0).default(0),
  unitCost: money,
  discountAmount: money.default(0),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  batchNo: optionalText(60),
  expiryDate: z.string().nullish(),
});
export const purchaseCreateSchema = z.object({
  supplierId: uuidSchema,
  supplierInvoiceNo: optionalText(80),
  invoiceDate: z.string().min(1, 'Invoice date is required'),
  purchaseOrderId: optionalUuid,
  discountAmount: money.default(0),
  paidAmount: money.default(0),
  notes: optionalText(1000),
  items: z.array(purchaseItemSchema).min(1, 'Add at least one product'),
});
export const purchaseOrderCreateSchema = z.object({
  supplierId: uuidSchema,
  orderDate: z.string().min(1),
  expectedDate: z.string().nullish(),
  notes: optionalText(1000),
  items: z
    .array(
      z.object({
        productId: uuidSchema,
        quantity: qty,
        unitCost: money,
        taxRate: z.coerce.number().min(0).max(100).default(0),
      }),
    )
    .min(1),
});
export const purchaseReturnCreateSchema = z.object({
  purchaseId: uuidSchema,
  reason: optionalText(500),
  items: z
    .array(z.object({ purchaseItemId: uuidSchema, quantity: qty }))
    .min(1),
});

// ── Sales ────────────────────────────────────────────────────────────
export const invoiceItemSchema = z.object({
  productId: uuidSchema,
  quantity: qty,
  unitPrice: z.coerce.number().min(0).optional(),
  discount: discountSchema.nullish(),
  batchId: optionalUuid,
});
export const invoicePaymentSchema = z.object({
  method: z.enum(['CASH', 'UPI', 'CARD', 'CREDIT', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']),
  amount: money,
  reference: optionalText(120),
});
export const invoiceCreateSchema = z.object({
  customerId: optionalUuid,
  customerName: optionalText(120),
  customerMobile: z.string().trim().regex(INDIAN_MOBILE_REGEX).nullish(),
  placeOfSupplyState: z.string().trim().length(2).nullish(),
  items: z.array(invoiceItemSchema).min(1, 'Add at least one product'),
  billDiscount: discountSchema.nullish(),
  payments: z.array(invoicePaymentSchema).default([]),
  redeemPoints: z.coerce.number().int().min(0).default(0),
  notes: optionalText(1000),
  dueDate: z.string().nullish(),
  clientRef: optionalText(120),
  roundToRupee: z.boolean().default(true),
});
export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;

export const saleReturnCreateSchema = z.object({
  invoiceId: uuidSchema,
  reason: optionalText(500),
  refundMethod: z.enum(['CASH', 'UPI', 'CARD', 'CREDIT', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']),
  restock: z.boolean().default(true),
  items: z.array(z.object({ invoiceItemId: uuidSchema, quantity: qty })).min(1),
});

// ── Expenses ─────────────────────────────────────────────────────────
export const expenseSchema = z.object({
  categoryId: uuidSchema,
  expenseDate: z.string().min(1),
  amount: qty,
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'CREDIT', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']).default('CASH'),
  vendor: optionalText(120),
  reference: optionalText(120),
  notes: optionalText(1000),
  receiptUrl: optionalText(500),
});

// ── Users / roles / settings ─────────────────────────────────────────
export const userCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().regex(INDIAN_MOBILE_REGEX).nullish().or(z.literal('').transform(() => null)),
  password: z.string().min(10).max(200),
  roleId: uuidSchema,
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'),
});
export const userUpdateSchema = userCreateSchema.omit({ password: true }).partial().extend({
  password: z.string().min(10).max(200).optional(),
});
export const rolePermissionsSchema = z.object({ permissionKeys: z.array(z.string()).min(1) });

export const storeSchema = z.object({
  name: z.string().trim().min(1).max(160),
  legalName: optionalText(160),
  gstin: z.string().trim().toUpperCase().regex(GSTIN_REGEX, 'Invalid GSTIN').nullish().or(z.literal('').transform(() => null)),
  stateCode: z.string().trim().length(2),
  address: optionalText(300),
  city: optionalText(80),
  pincode: z.string().trim().regex(PINCODE_REGEX).nullish(),
  phone: z.string().trim().max(20).nullish(),
  email: z.string().trim().email().nullish().or(z.literal('').transform(() => null)),
  invoicePrefix: z.string().trim().min(1).max(10),
  invoiceTerms: optionalText(1000),
  billFooter: optionalText(500),
  taxEnabled: z.boolean(),
  allowNegativeStock: z.boolean(),
  loyaltyEnabled: z.boolean(),
  loyaltyEarnPerAmount: money,
  loyaltyPointValue: z.coerce.number().min(0),
  financialYearStartMonth: z.coerce.number().int().min(1).max(12),
  logoUrl: optionalText(500),
});

export const changeStatusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']) });
