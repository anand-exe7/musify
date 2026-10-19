ALTER TABLE "orders" ADD COLUMN "courier" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_no" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipped_at" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" text;