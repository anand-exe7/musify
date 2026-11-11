CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"at" text NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text DEFAULT '' NOT NULL,
	"variant" text DEFAULT '' NOT NULL,
	"branch" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text DEFAULT 'adjustment' NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_settings" ADD COLUMN "expense_deduct_modes" jsonb DEFAULT '["CASH","UPI","CARD","BANK","OTHER"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_settings" ADD COLUMN "expense_categories" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "in_analytics" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "in_analytics" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "repair_tickets" ADD COLUMN "payment_mode" text DEFAULT 'CASH' NOT NULL;--> statement-breakpoint
ALTER TABLE "repair_tickets" ADD COLUMN "payments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "stock_movements_at_idx" ON "stock_movements" USING btree ("at");--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("product_id");