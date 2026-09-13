ALTER TABLE "invoices" ADD COLUMN "igst" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "ref_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "branch" text DEFAULT 'Branch 1' NOT NULL;