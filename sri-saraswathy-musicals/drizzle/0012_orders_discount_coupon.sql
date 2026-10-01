ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "coupon_code" text;