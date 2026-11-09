# API Reference

Base URL:

```
http://localhost:4000/api/v1
```

In production, serve the web app and API from the same origin; the examples below assume `/api/v1` is reachable on your host.

---

## Conventions

### Authentication

Every endpoint except those marked **Public** requires a bearer access token:

```
Authorization: Bearer <accessToken>
```

Obtain one with `POST /auth/login`. Access tokens last 15 minutes. Refresh with `POST /auth/refresh`, which uses the `ps_refresh` httpOnly cookie and rotates it. The browser client does this automatically.

### Errors

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary",
    "details": { "field": ["message"] },
    "requestId": "uuid"
  }
}
```

| Status | Meaning |
| --- | --- |
| `400` | Malformed request |
| `401` | Missing/expired session; refresh or sign in |
| `403` | Authenticated but lacks the permission |
| `404` | Not found, or not in your store |
| `409` | Conflict (duplicate, invalid state transition, insufficient stock, credit limit) |
| `422` | Zod validation failure; `details` lists issues |
| `429` | Rate limited |
| `500` | Unexpected error; quote the `requestId` |

### Lists and pagination

Paginated endpoints accept:

| Query | Default | Notes |
| --- | --- | --- |
| `page` | `1` | 1-based |
| `pageSize` | `20` | max `200` |

Response:

```json
{
  "items": [],
  "meta": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 1 }
}
```

Some small configuration lists return `{ items }` without `meta`.

Money is returned as a number in rupees. Dates are ISO 8601 UTC strings.

### Idempotency

`POST /invoices` accepts:

- `Idempotency-Key: <string>` header, or
- `clientRef` in the body

If an invoice already exists for that store and key, the API returns the existing invoice with `replayed: true` instead of creating a duplicate. Always send one from the POS.

---

## Auth

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/login` | Public | Email + password; sets refresh cookie, returns access token and user |
| POST | `/auth/refresh` | Public (cookie) | Rotate refresh token, issue a new access token |
| POST | `/auth/logout` | Public (cookie) | Revoke the refresh token and clear the cookie |
| GET | `/auth/me` | Authenticated | Current user, role, permissions, store flags |
| POST | `/auth/forgot-password` | Public | Start password reset |
| POST | `/auth/reset-password` | Public | Complete reset with token |
| POST | `/auth/change-password` | Authenticated | Change own password |
| PATCH | `/auth/profile` | Authenticated | Update own name/phone |

Login is rate-limited more strictly than other endpoints.

---

## Store

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/store/public` | Public | Minimal store identity for the login screen |
| GET | `/store` | `settings.read` | Full store settings |
| PATCH | `/store` | `settings.update` | Update settings (audited, before/after) |

Tax rates are never store-wide defaults applied silently; each product references its own GST rate.

---

## Users, roles and audit

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/users` | `user.read` |
| GET | `/users/:id` | `user.read` |
| POST | `/users` | `user.create` |
| PATCH | `/users/:id` | `user.update` |
| POST | `/users/:id/status` | `user.update` |
| POST | `/users/:id/reset-password` | `user.update` |
| DELETE | `/users/:id` | `user.delete` |
| GET | `/roles` | `role.read` |
| GET | `/roles/permissions` | `role.read` |
| POST | `/roles` | `role.manage` |
| PATCH | `/roles/:id` | `role.manage` |
| DELETE | `/roles/:id` | `role.manage` |
| GET | `/audit-logs` | `audit.read` |

`GET /roles/permissions` returns both a flat `items` array and a `grouped` map keyed by module.

Audit filters: `action`, `entityType`, `userId`, `from`, `to` (plus pagination). `from`/`to` are inclusive dates (`YYYY-MM-DD`).

---

## Catalog

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/catalog/options` | any product/catalog permission or `pos.sell` |
| GET | `/catalog/categories` | `product.read` or `category.manage` |
| POST | `/catalog/categories` | `category.manage` |
| PATCH | `/catalog/categories/:id` | `category.manage` |
| DELETE | `/catalog/categories/:id` | `category.manage` |
| GET | `/catalog/brands` | `product.read` or `brand.manage` |
| POST | `/catalog/brands` | `brand.manage` |
| PATCH | `/catalog/brands/:id` | `brand.manage` |
| DELETE | `/catalog/brands/:id` | `brand.manage` |
| GET | `/catalog/units` | `product.read` or `unit.manage` |
| POST | `/catalog/units` | `unit.manage` |
| PATCH | `/catalog/units/:id` | `unit.manage` |
| DELETE | `/catalog/units/:id` | `unit.manage` |
| GET | `/catalog/tax-rates` | `product.read` or `tax.manage` |
| POST | `/catalog/tax-rates` | `tax.manage` |
| PATCH | `/catalog/tax-rates/:id` | `tax.manage` |
| DELETE | `/catalog/tax-rates/:id` | `tax.manage` |

`GET /catalog/options` returns `{ categories, brands, units, taxRates }` in one call for product forms.

---

## Products

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/products` | `product.read` |
| GET | `/products/:id` | `product.read` |
| POST | `/products` | `product.create` |
| PATCH | `/products/:id` | `product.update` |
| POST | `/products/:id/archive` | `product.archive` |
| POST | `/products/:id/restore` | `product.archive` |
| GET | `/products/lookup/:code` | `pos.sell` or `product.read` |
| GET | `/products/barcode/:text` | `product.read` |
| GET | `/products/low-stock` | `product.read` |
| GET | `/products/out-of-stock` | `product.read` |
| GET | `/products/export` | `product.export` |
| GET | `/products/import-template` | `product.import` |
| POST | `/products/import` | `product.import` — multipart `file` |
| POST | `/products/import-image` | `product.update` — multipart `file` |

`lookup/:code` matches SKU or barcode and returns the product plus live stock, used by the POS scanner.

---

## Inventory

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/inventory` | `inventory.read` |
| GET | `/inventory/low-stock` | `inventory.read` |
| GET | `/inventory/out-of-stock` | `inventory.read` |
| GET | `/inventory/valuation` | `inventory.read` |
| GET | `/inventory/expiring` | `inventory.read` |
| GET | `/inventory/movements` | `inventory.read` |
| GET | `/inventory/products/:productId` | `inventory.read` |
| POST | `/inventory/adjust` | `inventory.adjust` |
| GET | `/inventory/locations` | `inventory.read` |
| POST | `/inventory/locations` | `inventory.transfer` |
| PATCH | `/inventory/locations/:id` | `inventory.transfer` |
| DELETE | `/inventory/locations/:id` | `inventory.transfer` |
| GET | `/inventory/transfers` | `inventory.read` |
| POST | `/inventory/transfers` | `inventory.transfer` |

Adjustments and transfers require a reason/note and write immutable stock movements.

---

## Sales

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/invoices` | `invoice.read` |
| POST | `/invoices` | `pos.sell` |
| GET | `/invoices/:id` | `invoice.read` |
| GET | `/invoices/:id/pdf` | `invoice.read` |
| GET | `/invoices/:id/thermal` | `invoice.read` |
| POST | `/invoices/:id/void` | `pos.void` or `invoice.void` |
| POST | `/invoices/:id/payments` | `customer.payment` or `pos.sell` |
| GET | `/held-bills` | `pos.hold` |
| POST | `/held-bills` | `pos.hold` |
| PATCH | `/held-bills/:id` | `pos.hold` |
| DELETE | `/held-bills/:id` | `pos.hold` |
| GET | `/returns` | `return.read` |
| POST | `/returns` | `return.create` or `pos.return` |
| GET | `/returns/:id` | `return.read` |

Invoice create body (abridged):

```json
{
  "customerId": null,
  "clientRef": "pos-1-1730000000",
  "priceIncludesTax": true,
  "interState": false,
  "billDiscount": { "type": "percent", "value": 0 },
  "roundToRupee": true,
  "loyaltyPointsToRedeem": 0,
  "items": [
    { "productId": "uuid", "quantity": 2, "unitPrice": 55, "discount": null }
  ],
  "payments": [
    { "mode": "CASH", "amount": 110 }
  ],
  "notes": null
}
```

Void and return endpoints require a reason. Void reverses stock, ledger and loyalty, and keeps the invoice number.

---

## Customers

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/customers` | `customer.read` |
| GET | `/customers/summary` | `customer.read` |
| POST | `/customers` | `customer.create` |
| GET | `/customers/:id` | `customer.read` |
| PATCH | `/customers/:id` | `customer.update` |
| POST | `/customers/:id/deactivate` | `customer.delete` |
| GET | `/customers/:id/ledger` | `customer.read` |
| POST | `/customers/:id/payments` | `customer.payment` |

Credit sales are blocked when `outstanding + newBalance > creditLimit`. The limit is enforced strictly; it cannot be overridden from the POS.

---

## Suppliers

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/suppliers` | `supplier.read` |
| POST | `/suppliers` | `supplier.create` |
| GET | `/suppliers/:id` | `supplier.read` |
| PATCH | `/suppliers/:id` | `supplier.update` |
| POST | `/suppliers/:id/deactivate` | `supplier.delete` |
| GET | `/suppliers/:id/ledger` | `supplier.read` |
| POST | `/suppliers/:id/payments` | `supplier.payment` |

---

## Purchases

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/purchases` | `purchase.read` |
| POST | `/purchases` | `purchase.create` |
| GET | `/purchases/:id` | `purchase.read` |
| POST | `/purchases/:id/cancel` | `purchase.create` |
| POST | `/purchases/:id/payments` | `purchase.pay` or `supplier.payment` |
| GET | `/purchase-orders` | `purchase.read` |
| POST | `/purchase-orders` | `purchase.create` |
| GET | `/purchase-orders/:id` | `purchase.read` |
| POST | `/purchase-orders/:id/cancel` | `purchase.create` |
| GET | `/purchase-returns` | `purchase.read` |
| POST | `/purchase-returns` | `purchase.return` |

Purchase lines support batch number and expiry. Line `discountAmount` is an **absolute money amount**, not a percentage. Receiving a purchase increases stock and updates weighted-average cost atomically.

---

## Expenses

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/expense-categories` | `expense.read` |
| POST | `/expense-categories` | `expense.category.manage` |
| PATCH | `/expense-categories/:id` | `expense.category.manage` |
| DELETE | `/expense-categories/:id` | `expense.category.manage` |
| GET | `/expenses` | `expense.read` |
| GET | `/expenses/summary` | `expense.read` |
| POST | `/expenses` | `expense.create` |
| GET | `/expenses/:id` | `expense.read` |
| PATCH | `/expenses/:id` | `expense.update` |
| POST | `/expenses/:id/reverse` | `expense.delete` |

Expense list items include `summary.activeTotal`. `GET /expenses/summary?from&to` returns `{ from, to, total, items }`. Reversal requires a reason.

---

## Dashboard

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/dashboard` | `dashboard.view` or `report.view` |

Optional query: `from`, `to`. Returns today and period sales, profit, payment mix, top products, low stock, receivables and a trend series.

---

## Reports

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/reports` | `report.view` |
| GET | `/reports/:key` | `report.view` |
| GET | `/reports/:key/export?format=xlsx` | `report.export` |
| GET | `/reports/:key/export?format=pdf` | `report.export` |

Available keys:

| Key | Report |
| --- | --- |
| `sales-summary` | Daily sales totals |
| `sales-detailed` | Invoice-level sales |
| `sales-by-product` | Product performance |
| `sales-by-customer` | Customer revenue and dues |
| `sales-by-category` | Category performance |
| `gst-summary` | GST liability by rate |
| `gst-hsn` | HSN-wise GST summary |
| `profit` | Revenue, cost and margin |
| `inventory-valuation` | Stock value at weighted-average cost |
| `purchases` | Purchase register |
| `expenses` | Expense register |
| `receivables-aging` | Outstanding customer balances by age |
| `payments` | Payment register by mode |

All reports accept `from` and `to` (`YYYY-MM-DD`, inclusive). The response drives the on-screen table and the Excel/PDF export so they always agree.

---

## Health

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/health` | Public |

Returns `200` with `{ status: "ok", uptime, timestamp }` when the database responds, or `503` with `{ status: "degraded", database: "unreachable" }`.

---

## Uploads

Files are served from `/uploads/<filename>` on the API origin. In production, proxy `/uploads/` to the API or move the directory behind object storage. Uploaded product images are referenced by URL in the product record.
