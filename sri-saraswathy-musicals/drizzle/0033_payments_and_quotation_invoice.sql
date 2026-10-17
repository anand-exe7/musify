ALTER TABLE "quotations" DROP CONSTRAINT "quotations_status_check";--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_bills" ADD COLUMN "payments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "invoice_id" text;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_status_check" CHECK ("quotations"."status" in ('open', 'accepted', 'declined', 'invoiced'));