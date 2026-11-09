-- Hardening migration: constraints, search indexes and append-only guarantees.
-- These rules are enforced by PostgreSQL so they hold even if application code regresses.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Fast product / customer / supplier search
CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx" ON "Product" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_sku_trgm_idx" ON "Product" USING gin ("sku" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Customer_name_trgm_idx" ON "Customer" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Customer_mobile_trgm_idx" ON "Customer" USING gin ("mobile" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Supplier_name_trgm_idx" ON "Supplier" USING gin ("name" gin_trgm_ops);

-- One default location and one default tax rate per store
CREATE UNIQUE INDEX IF NOT EXISTS "Location_one_default_per_store"
  ON "Location" ("storeId") WHERE "isDefault" = true;
CREATE UNIQUE INDEX IF NOT EXISTS "TaxRate_one_default_per_store"
  ON "TaxRate" ("storeId") WHERE "isDefault" = true;

-- Non-negative financial data
ALTER TABLE "Product" ADD CONSTRAINT "Product_prices_non_negative"
  CHECK ("purchasePrice" >= 0 AND "sellingPrice" >= 0 AND "mrp" >= 0 AND "minStock" >= 0);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_totals_non_negative"
  CHECK ("grandTotal" >= 0 AND "amountPaid" >= 0 AND "balanceDue" >= 0);
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_totals_non_negative"
  CHECK ("lineTotal" >= 0 AND "taxableAmount" >= 0);
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_cost_non_negative" CHECK ("unitCost" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "CustomerLedger" ADD CONSTRAINT "CustomerLedger_amounts_non_negative"
  CHECK ("debit" >= 0 AND "credit" >= 0);
ALTER TABLE "SupplierLedger" ADD CONSTRAINT "SupplierLedger_amounts_non_negative"
  CHECK ("debit" >= 0 AND "credit" >= 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_avg_cost_non_negative" CHECK ("avgCost" >= 0);

-- Append-only tables: financial history and audit trails may never be rewritten.
CREATE OR REPLACE FUNCTION ps_prevent_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only and cannot be modified or deleted', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AuditLog_append_only" ON "AuditLog";
CREATE TRIGGER "AuditLog_append_only" BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION ps_prevent_mutation();

DROP TRIGGER IF EXISTS "StockMovement_append_only" ON "StockMovement";
CREATE TRIGGER "StockMovement_append_only" BEFORE UPDATE OR DELETE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION ps_prevent_mutation();

DROP TRIGGER IF EXISTS "CustomerLedger_append_only" ON "CustomerLedger";
CREATE TRIGGER "CustomerLedger_append_only" BEFORE UPDATE OR DELETE ON "CustomerLedger"
  FOR EACH ROW EXECUTE FUNCTION ps_prevent_mutation();

DROP TRIGGER IF EXISTS "SupplierLedger_append_only" ON "SupplierLedger";
CREATE TRIGGER "SupplierLedger_append_only" BEFORE UPDATE OR DELETE ON "SupplierLedger"
  FOR EACH ROW EXECUTE FUNCTION ps_prevent_mutation();

DROP TRIGGER IF EXISTS "LoyaltyTransaction_append_only" ON "LoyaltyTransaction";
CREATE TRIGGER "LoyaltyTransaction_append_only" BEFORE UPDATE OR DELETE ON "LoyaltyTransaction"
  FOR EACH ROW EXECUTE FUNCTION ps_prevent_mutation();

-- Reporting indexes
CREATE INDEX IF NOT EXISTS "Invoice_store_status_date_idx" ON "Invoice" ("storeId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Invoice_fy_idx" ON "Invoice" ("storeId", "financialYear");
CREATE INDEX IF NOT EXISTS "Purchase_store_date_idx" ON "Purchase" ("storeId", "invoiceDate");
CREATE INDEX IF NOT EXISTS "Payment_store_date_idx" ON "Payment" ("storeId", "receivedAt");
