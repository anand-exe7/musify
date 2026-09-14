CREATE TABLE "stock_inward" (
	"id" text PRIMARY KEY NOT NULL,
	"vendor_id" text NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text DEFAULT '' NOT NULL,
	"variant" text DEFAULT '' NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"unit_cost" integer DEFAULT 0 NOT NULL,
	"branch" text NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"inward_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_products" ADD COLUMN "cost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "created_at" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_code_unique" UNIQUE("code");