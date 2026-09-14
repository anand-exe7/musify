ALTER TABLE "inventory_products" ADD COLUMN "gst_rate" integer DEFAULT 18;--> statement-breakpoint
ALTER TABLE "inventory_products" ADD COLUMN "hsn" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_products" ADD COLUMN "is_gst_applicable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_bills" ADD COLUMN "gst_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_bills" ADD COLUMN "taxable" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_bills" ADD COLUMN "cgst" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_bills" ADD COLUMN "sgst" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_bills" ADD COLUMN "gst" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_gst_applicable" boolean DEFAULT true NOT NULL;