-- Bring the migration chain in line with src/lib/db/schema.ts. Everything in the
-- first section already exists on databases that were synced with `db:push`, so
-- it is written to be a no-op there (IF NOT EXISTS / idempotent DDL) and to
-- build the missing pieces on a fresh `db:migrate`.

CREATE TABLE IF NOT EXISTS "stock_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text DEFAULT '' NOT NULL,
	"variant" text DEFAULT '' NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"from_branch" text NOT NULL,
	"to_branch" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"transferred_at" text NOT NULL
);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "department" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "cost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "base_weight" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "discount_label" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "low_stock_at" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "variants" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- NULL gst_rate marks a non-GST (exempt) product; 0000 declared it NOT NULL.
ALTER TABLE "products" ALTER COLUMN "gst_rate" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "brand" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "origin" SET DEFAULT 'indian';--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "price" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "mrp" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "hsn" SET DEFAULT '';--> statement-breakpoint

-- CHECK constraints behind the TypeScript literal unions. NOT VALID: new and
-- updated rows must conform from now on, but rows already in a live database are
-- not scanned, so a stray legacy value can't fail the deploy. After cleaning up
-- any offenders, run `ALTER TABLE <t> VALIDATE CONSTRAINT <name>` to promote
-- each one (find offenders with: SELECT DISTINCT <col> FROM <t>).
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payment_mode_check" CHECK ("expenses"."payment_mode" in ('CASH', 'UPI', 'CARD', 'BANK', 'OTHER')) NOT VALID;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_check" CHECK ("expenses"."branch" in ('Branch 1', 'Branch 2')) NOT VALID;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_status_check" CHECK ("inquiries"."status" in ('new', 'contacted', 'resolved')) NOT VALID;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_branch_check" CHECK ("inquiries"."branch" in ('Branch 1', 'Branch 2', 'Any')) NOT VALID;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_status_check" CHECK ("invoices"."status" in ('paid', 'pending', 'cancelled')) NOT VALID;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_source_check" CHECK ("invoices"."source" in ('web', 'pos', 'service', 'manual')) NOT VALID;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branch_check" CHECK ("invoices"."branch" in ('Branch 1', 'Branch 2')) NOT VALID;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_check" CHECK ("orders"."status" in ('delivered', 'shipped', 'processing', 'cancelled')) NOT VALID;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_check" CHECK ("orders"."branch" in ('Branch 1', 'Branch 2')) NOT VALID;--> statement-breakpoint
ALTER TABLE "pos_bills" ADD CONSTRAINT "pos_bills_status_check" CHECK ("pos_bills"."status" in ('completed', 'pending')) NOT VALID;--> statement-breakpoint
ALTER TABLE "pos_bills" ADD CONSTRAINT "pos_bills_source_check" CHECK ("pos_bills"."source" in ('offline', 'online', 'service')) NOT VALID;--> statement-breakpoint
ALTER TABLE "pos_bills" ADD CONSTRAINT "pos_bills_branch_check" CHECK ("pos_bills"."branch" in ('Branch 1', 'Branch 2')) NOT VALID;--> statement-breakpoint
ALTER TABLE "repair_tickets" ADD CONSTRAINT "repair_tickets_status_check" CHECK ("repair_tickets"."status" in ('received', 'diagnosing', 'in-progress', 'awaiting-parts', 'ready', 'completed', 'cancelled')) NOT VALID;--> statement-breakpoint
ALTER TABLE "repair_tickets" ADD CONSTRAINT "repair_tickets_priority_check" CHECK ("repair_tickets"."priority" in ('low', 'normal', 'high', 'urgent')) NOT VALID;--> statement-breakpoint
ALTER TABLE "repair_tickets" ADD CONSTRAINT "repair_tickets_branch_check" CHECK ("repair_tickets"."branch" in ('Branch 1', 'Branch 2')) NOT VALID;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_role_check" CHECK ("staff"."role" in ('Admin', 'Manager', 'Cashier', 'Staff')) NOT VALID;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_branch_check" CHECK ("staff"."branch" in ('Branch 1', 'Branch 2')) NOT VALID;--> statement-breakpoint
ALTER TABLE "stock_inward" ADD CONSTRAINT "stock_inward_branch_check" CHECK ("stock_inward"."branch" in ('Branch 1', 'Branch 2')) NOT VALID;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_branch_check" CHECK ("stock_transfers"."from_branch" in ('Branch 1', 'Branch 2')) NOT VALID;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_branch_check" CHECK ("stock_transfers"."to_branch" in ('Branch 1', 'Branch 2')) NOT VALID;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" in ('admin', 'branch1-manager', 'branch2-manager', 'cashier', 'customer')) NOT VALID;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_branch_check" CHECK ("users"."branch" in ('Branch 1', 'Branch 2')) NOT VALID;