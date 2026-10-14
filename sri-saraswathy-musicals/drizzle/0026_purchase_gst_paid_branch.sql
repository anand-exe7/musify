ALTER TABLE "purchases" ADD COLUMN "paid_branch" text;--> statement-breakpoint
ALTER TABLE "stock_inward" ADD COLUMN "gst" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_paid_branch_check" CHECK ("purchases"."paid_branch" IS NULL OR "purchases"."paid_branch" in ('Branch 1', 'Branch 2', 'Branch 3'));