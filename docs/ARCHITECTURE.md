# Architecture and Invariants

This document explains how the system is put together and which rules must never be broken. It is aimed at maintainers and reviewers.

---

## 1. Monorepo

```
apps/api        Express 5 REST API, Prisma, PostgreSQL
apps/web        React 18 SPA built with Vite
packages/shared Billing engine, Zod schemas, permissions, domain types, constants
```

`@ps/shared` is imported directly from TypeScript source by both apps. There is no separate build step and no duplicated business rule. If a validation rule changes, both the form and the API change together.

Path aliasing:

- Web: `@/` → `apps/web/src`
- API: relative imports; shared via `@ps/shared`

---

## 2. Request lifecycle (API)

```
HTTP request
  ├─ helmet, CORS, body parsing, cookies
  ├─ requestId           → req.requestId, response header
  ├─ pino HTTP logging
  ├─ rate limiter        → per-IP limits, stricter on auth
  ├─ authenticate        → verify access JWT, load user + permissions
  ├─ requirePermission   → 403 if the role lacks the key
  ├─ validate(schema)    → Zod parse, 422 with issue details
  ├─ controller          → orchestration only
  ├─ service / transaction
  │    ├─ Prisma writes
  │    ├─ stock movements
  │    ├─ ledgers
  │    └─ writeAudit
  └─ error middleware    → { error: { code, message, details, requestId } }
```

Controllers do not contain business rules that belong in a transaction. Financial operations call one service function that owns the whole transaction.

### Response shapes

| Shape | Example |
| --- | --- |
| List | `{ items, meta: { page, pageSize, total, totalPages } }` |
| Single | `{ item }` |
| Invoice create | `{ item, replayed, changeDue }` |
| Error | `{ error: { code, message, details, requestId } }` |

Dates are ISO strings. Money is a JSON number representing rupees with at most two decimals; internally it is handled in paise.

---

## 3. Authentication and sessions

- **Access token** — JWT, 15 minutes, signed with `JWT_ACCESS_SECRET`, held only in memory in the browser. It is never written to `localStorage`.
- **Refresh token** — opaque random value in an `httpOnly`, `SameSite=Lax` cookie named `ps_refresh`, scoped to `/api/v1/auth`, valid for 30 days.
- Refresh tokens are stored **hashed** (`tokenHash`) with a `familyId`.
- Every refresh **rotates** the token: the old row is revoked and linked to its replacement.
- If a revoked token is presented again, the entire family is revoked — the system assumes theft.
- Logout revokes the current token and clears the cookie.
- Login always performs a password hash comparison, even for unknown emails, to avoid user enumeration.
- Password hashing is bcrypt with cost 12.

Revoking a user (status change, password reset, deactivation) invalidates their refresh tokens and blocks token refresh; their in-memory access token expires within 15 minutes.

### RBAC

- `Permission` rows have a string `key` (also used as the primary key).
- `RolePermission.permissionId` references `Permission.key`.
- The Admin role is protected and implicitly has all permissions, including future ones.
- System roles cannot be deleted; roles with assigned users cannot be deleted.
- The API checks permissions on **every protected route**. The web UI only hides controls for convenience.

The permission catalogue lives in `packages/shared/src/permissions.ts` and is seeded into the database.

---

## 4. Database invariants

### Enforced by PostgreSQL

The hardening migration adds guarantees that survive application bugs:

- unique partial indexes: one default stock location and one default tax rate per store
- `CHECK` constraints: non-negative prices, invoice totals, ledger amounts, costs and quantities; positive payment amounts and invoice/purchase quantities
- append-only triggers on:
  - `AuditLog`
  - `StockMovement`
  - `CustomerLedger`
  - `SupplierLedger`
  - `LoyaltyTransaction`

Any `UPDATE` or `DELETE` on those tables raises an exception. Corrections are made by inserting a reversing row.

- trigram (`pg_trgm`) indexes on product name/SKU, customer name/mobile and supplier name

### Enforced by the service layer

- Every stock-changing operation runs in a Prisma transaction and locks the inventory row (`SELECT … FOR UPDATE`).
- Every customer/supplier ledger write locks the party row before computing the new balance.
- Document numbers are allocated inside the same transaction as the document.
- Invoices, purchases and returns are never hard-deleted. They are voided, cancelled or reversed with an audit entry.
- Soft deletion uses `deletedAt`; list queries filter it out.

---

## 5. Billing engine

`packages/shared/src/billing.ts` is the single source of truth. The web POS preview and the API both call it, so what the cashier sees is what gets stored.

All intermediate values are integer **paise**.

Order of operations:

1. `gross = quantity × unitPrice`
2. line discount (percent or flat), capped at gross
3. bill discount allocated **pro-rata** across lines by discounted value; the last line absorbs the rounding remainder
4. GST:
   - **inclusive** price: `taxable = net / (1 + gstRate + cessRate)`, tax is the difference
   - **exclusive** price: `taxable = net`, tax is added
5. intra-state splits GST into CGST and SGST (SGST absorbs the odd paisa); inter-state uses IGST
6. optional round-off to the nearest rupee; `roundOff` is stored separately

Loyalty redemption is **not** part of GST math. It is applied after tax:

```
grandTotal     = taxable + tax + cess + roundOff
loyaltyDiscount = points × pointValue   (capped at grandTotal)
payable        = grandTotal − loyaltyDiscount
```

Credit is a payment mode, not cash tender. A credit sale increases the customer's outstanding balance and writes a ledger debit; payments later reduce it.

Returns use `refundForReturn`, which refunds tax-inclusive value proportionally to the returned quantity.

### Why paise

Floating point cannot represent 0.1 exactly. Summing many line totals in rupees drifts. Converting to integer paise at the boundary makes totals deterministic, testable and reconcilable.

---

## 6. Invoice creation

Inside one transaction:

1. Resolve the idempotency key from `Idempotency-Key` or `clientRef`. If an invoice already exists for this store and key, return it with `replayed: true`.
2. Recompute every line with `computeInvoice` — never trust client totals.
3. Verify stock availability (unless `allowNegativeStock` is on) and lock inventory rows.
4. Verify credit limit for credit sales.
5. Allocate the invoice number from `DocumentSequence` (`FOR UPDATE`).
6. Insert the invoice, items, payments, stock movements, customer ledger entry, loyalty transactions and audit entry.
7. Decrement stock with weighted-average cost preserved.
8. Return the stored invoice, `changeDue` for cash tenders and any replay flag.

The idempotency key is stored on the invoice and indexed per store. Network retries therefore cannot double-charge or double-decrement stock.

Document format:

```
<PREFIX>/<FINANCIAL_YEAR>/<5-digit sequence>
INV/2026-27/00001
```

The financial year label respects the store's `financialYearStartMonth`.

---

## 7. Stock

- `Inventory` holds quantity, reserved quantity and average cost per product per location.
- `StockMovement` is the immutable ledger: purchase, sale, return, adjustment, transfer, opening, reversal.
- Sales and purchase returns decrease stock; purchases, sale returns and positive adjustments increase it.
- Transfers write paired out/in movements and update both locations in one transaction.
- `allowNegativeStock` is a per-store setting. When off, billing fails with a clear error if stock is insufficient.
- Valuation uses weighted-average cost. Purchases recalculate the average.

---

## 8. Financial history

| Record | Mutation policy |
| --- | --- |
| Invoice | never deleted; void creates reversing stock, ledger and payment entries |
| Payment | inserted, never edited; corrections are new payments or reversals |
| Customer/Supplier ledger | append-only |
| Stock movement | append-only |
| Loyalty transaction | append-only |
| Expense | edits audited; reversal creates a reversing record |
| Audit log | append-only |

A voided invoice keeps its number and appears in reports as voided; it is excluded from revenue. The audit log records who voided it, when and why.

---

## 9. Audit log

`writeAudit` is called by sensitive writes and never throws into the request path. Each entry stores:

- store, user, action (e.g. `INVOICE_CREATED`), entity type and ID
- `before` and `after` JSON snapshots where applicable
- IP, user agent and request ID

Audit entries are immutable. The Audit log page supports filtering by action, entity, user and date, and shows the JSON diff.

---

## 10. Reports

Reports are server-computed from SQL/Prisma aggregations, never from a client-side copy of the data. Each report returns:

```ts
{
  key, title, range,
  columns: { key, label, type, align? }[],
  rows: Record<string, unknown>[],
  totals?, summary?
}
```

The web app renders the same column metadata and exports Excel/PDF through the API. Report exports require `report.export`, viewing requires `report.view`.

Date ranges are inclusive and interpreted in the store timezone for dashboard labelling, while timestamps are stored in UTC.

---

## 11. Frontend

- React Router with `React.lazy` per page; the app shell stays mounted while pages load.
- TanStack Query owns server state. Mutations invalidate the relevant keys; no manual cache patching except deliberate optimistic updates.
- Access token lives in a module variable in `lib/api.ts`. A 401 triggers a single refresh attempt and replays the request; concurrent requests share the refresh promise.
- `AuthProvider` exposes `user`, `can()`, `login`, `logout` and `refreshUser()`. `refreshUser` re-reads `/auth/me` after role or store changes.
- Route guards: `ProtectedRoute` requires a session; `RequirePermission` checks one or more permission keys and renders the forbidden page.
- Forms use controlled state plus shared Zod schemas. Errors are shown inline and from the API.
- Money is formatted with `Intl.NumberFormat('en-IN')`; dates use `en-IN` short format.
- Keyboard support in the POS: barcode/search focus, Enter to add, quantity and discount editing, payment shortcuts.

---

## 12. Testing

| Layer | Tool | What is covered |
| --- | --- | --- |
| Billing math | Vitest | inclusive/exclusive GST, cess, discounts, pro-rata allocation, inter-state, rounding, refunds, payment sums |
| Type safety | `tsc --noEmit` | API and web |
| Live API | `scripts/smoke.mjs` | 43 endpoints including login, every module list, all reports, exports and a genuine 401 |
| Manual | checklist | POS flow, void, return, purchase receipt, settings, roles |

When adding a rule to the billing engine, add a unit test first. When adding an endpoint, extend the smoke script.

---

## 13. Adding a module

1. Add Prisma models and a migration (`npm run db:migrate`).
2. Add Zod schemas to `packages/shared/src/schemas.ts` and types to `types.ts`.
3. Add permission keys to `permissions.ts` and assign them to system roles; reseed.
4. Create `apps/api/src/modules/<name>/` with `*.routes.ts`, `*.controller.ts` and, for financial logic, `*.service.ts`.
5. Mount the router in `apps/api/src/app.ts` with `authenticate`.
6. Add the route and a lazy page in `apps/web/src/App.tsx`, plus a nav entry in `app-shell.tsx` with its permission.
7. Add an audit action for every sensitive write.
8. Add tests and a smoke entry.
9. Document it in `docs/API.md`.

---

## 14. Deliberate constraints

- Single store per deployment. Multi-store would require a store selector, per-store sequences and cross-store permission scoping; the schema is store-scoped, but the UI and session assume one store.
- Single API instance (see deployment notes).
- No offline mode. The POS requires a connection to the API; idempotency makes retries safe but does not provide offline billing.
- No e-invoicing/IRN integration. The system produces GST-compliant invoices and HSN summaries, not government portal submissions.
- Uploaded images are served from local disk; use a shared volume or object storage before scaling horizontally.
