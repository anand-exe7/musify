ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "customer_gstin" text;--> statement-breakpoint
ALTER TABLE "pos_bills" ADD COLUMN IF NOT EXISTS "customer_gstin" text;--> statement-breakpoint
ALTER TABLE "repair_tickets" ADD COLUMN IF NOT EXISTS "customer_gstin" text;
