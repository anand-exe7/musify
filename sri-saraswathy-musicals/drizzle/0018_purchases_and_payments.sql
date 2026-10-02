-- Purchases reform
-- ---------------------------------------------------------------------------
-- Adds a purchase header (`purchases`) above the existing `stock_inward` lines
-- and a payment ledger (`vendor_payments`) that records settlements after the
-- fact. Pre-reform `stock_inward` rows (no header) are back-filled as paid purchases.
-- Written idempotently (IF NOT EXISTS) so it is safe on a database where the
-- tables were already created.

-- 1 ─ Purchase header -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "purchases" (
  "id"             text PRIMARY KEY,
  "vendor_id"      text NOT NULL REFERENCES "vendors"("id") ON DELETE RESTRICT,
  "invoice_no"     text NOT NULL DEFAULT '',
  "purchase_date"  text NOT NULL DEFAULT '',
  "subtotal"       integer NOT NULL DEFAULT 0,
  "tax"            integer NOT NULL DEFAULT 0,
  "cgst"           integer NOT NULL DEFAULT 0,
  "sgst"           integer NOT NULL DEFAULT 0,
  "igst"           integer NOT NULL DEFAULT 0,
  "total_amount"   integer NOT NULL DEFAULT 0,
  "amount_paid"    integer NOT NULL DEFAULT 0,
  "payment_mode"   text NOT NULL DEFAULT '',
  "notes"          text NOT NULL DEFAULT '',
  "created_by"     text NOT NULL DEFAULT '',
  "created_at"     text NOT NULL,
  CONSTRAINT "purchases_payment_mode_check"
    CHECK ("payment_mode" = '' OR "payment_mode" IN ('CASH','UPI','CARD','BANK','OTHER','CREDIT'))
);

CREATE INDEX IF NOT EXISTS "purchases_vendor_idx" ON "purchases" ("vendor_id");
CREATE INDEX IF NOT EXISTS "purchases_created_at_idx" ON "purchases" ("created_at");

-- 2 ─ Link lines to the header ---------------------------------------------
ALTER TABLE "stock_inward"
  ADD COLUMN IF NOT EXISTS "purchase_id" text
  REFERENCES "purchases"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "stock_inward_purchase_idx" ON "stock_inward" ("purchase_id");

-- 3 ─ Vendor payment ledger -------------------------------------------------
CREATE TABLE IF NOT EXISTS "vendor_payments" (
  "id"           text PRIMARY KEY,
  "vendor_id"    text NOT NULL REFERENCES "vendors"("id") ON DELETE RESTRICT,
  "purchase_id"  text REFERENCES "purchases"("id") ON DELETE SET NULL,
  "branch"       text NOT NULL,
  "amount"       integer NOT NULL DEFAULT 0,
  "mode"         text NOT NULL DEFAULT '',
  "reference"    text NOT NULL DEFAULT '',
  "paid_at"      text NOT NULL,
  "notes"        text NOT NULL DEFAULT '',
  "created_by"   text NOT NULL DEFAULT '',
  "created_at"   text NOT NULL,
  CONSTRAINT "vendor_payments_branch_check" CHECK ("branch" IN ('Branch 1','Branch 2')),
  CONSTRAINT "vendor_payments_mode_check"
    CHECK ("mode" IN ('CASH','UPI','CARD','BANK','OTHER'))
);

CREATE INDEX IF NOT EXISTS "vendor_payments_vendor_idx" ON "vendor_payments" ("vendor_id");
CREATE INDEX IF NOT EXISTS "vendor_payments_purchase_idx" ON "vendor_payments" ("purchase_id");
CREATE INDEX IF NOT EXISTS "vendor_payments_paid_at_idx" ON "vendor_payments" ("paid_at");

-- 4 ─ Back-fill pre-reform inward lines ------------------------------------
-- Receipts logged before purchase headers existed have no payment history.
-- Rather than deleting them (which would erase each vendor's purchase history),
-- give every such line its own header, recorded as fully paid so it adds
-- nothing to vendor outstanding. Idempotent: only unlinked lines are touched.
INSERT INTO "purchases"
  ("id","vendor_id","invoice_no","purchase_date","subtotal","tax","cgst","sgst","igst",
   "total_amount","amount_paid","payment_mode","notes","created_by","created_at")
SELECT 'PUR-LEGACY-' || si."id", si."vendor_id", '', LEFT(si."inward_at", 10),
       si."quantity" * si."unit_cost", 0, 0, 0, 0,
       si."quantity" * si."unit_cost", si."quantity" * si."unit_cost", '',
       'Back-filled from pre-purchase stock inward', si."created_by", si."inward_at"
FROM "stock_inward" si
WHERE si."purchase_id" IS NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "stock_inward"
SET "purchase_id" = 'PUR-LEGACY-' || "id"
WHERE "purchase_id" IS NULL;
