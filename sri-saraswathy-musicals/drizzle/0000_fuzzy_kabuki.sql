CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"icon" text DEFAULT '' NOT NULL,
	"photo" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"code" text PRIMARY KEY NOT NULL,
	"discount_pct" integer DEFAULT 0 NOT NULL,
	"min_order" integer DEFAULT 0 NOT NULL,
	"expiry" text DEFAULT '' NOT NULL,
	"usage_limit" integer DEFAULT 0 NOT NULL,
	"remaining" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"free_threshold" integer DEFAULT 25000 NOT NULL,
	"standard_charge" integer DEFAULT 250 NOT NULL,
	"express_charge" integer DEFAULT 600 NOT NULL,
	"store_pickup" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"charge" integer DEFAULT 0 NOT NULL,
	"eta" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gst_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"home_state" text DEFAULT 'Tamil Nadu' NOT NULL,
	"cgst_label" text DEFAULT 'CGST' NOT NULL,
	"sgst_label" text DEFAULT 'SGST' NOT NULL,
	"igst_label" text DEFAULT 'IGST' NOT NULL,
	"standard_rate" integer DEFAULT 18 NOT NULL,
	"place_of_supply_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"topic" text NOT NULL,
	"product_interest" text,
	"message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"branch" text
);
--> statement-breakpoint
CREATE TABLE "inventory_products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"photo" text,
	"base_price" integer DEFAULT 0 NOT NULL,
	"base_weight" integer DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"discount_label" text,
	"new_arrival" boolean DEFAULT false NOT NULL,
	"low_stock_at" integer DEFAULT 4 NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"date" text NOT NULL,
	"customer" text NOT NULL,
	"branch" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"cgst" integer DEFAULT 0 NOT NULL,
	"sgst" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"payment_mode" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"status" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"gst" integer DEFAULT 0 NOT NULL,
	"shipping" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"address" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_bills" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"branch" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"coupon" text,
	"discount" integer DEFAULT 0 NOT NULL,
	"delivery" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"payment" text
);
--> statement-breakpoint
CREATE TABLE "pos_categories" (
	"name" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"brand" text NOT NULL,
	"category" text NOT NULL,
	"origin" text NOT NULL,
	"price" integer NOT NULL,
	"mrp" integer NOT NULL,
	"gst_rate" integer NOT NULL,
	"hsn" text NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"rating" double precision DEFAULT 0 NOT NULL,
	"reviews" integer DEFAULT 0 NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"specs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"photo" text,
	"photos" jsonb,
	"featured" boolean DEFAULT false NOT NULL,
	"best_seller" boolean DEFAULT false NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "repair_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"product_name" text NOT NULL,
	"category" text NOT NULL,
	"brand" text,
	"serial" text,
	"ref_invoice" text,
	"problem" text DEFAULT '' NOT NULL,
	"accessories" text,
	"status" text NOT NULL,
	"priority" text NOT NULL,
	"branch" text NOT NULL,
	"technician" text,
	"deadline" text NOT NULL,
	"estimate" integer DEFAULT 0 NOT NULL,
	"final_cost" integer DEFAULT 0 NOT NULL,
	"advance" integer DEFAULT 0 NOT NULL,
	"gst_rate" integer DEFAULT 18 NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"whatsapp_sent_at" text,
	"completed_at" text,
	"invoice_no" text
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"branch" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"role" text NOT NULL,
	"branch" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_login" text DEFAULT '' NOT NULL,
	"permissions" jsonb DEFAULT '{"billing":false,"inventory":false,"analytics":false,"users":false}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"gst" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"outstanding" integer DEFAULT 0 NOT NULL,
	"total_purchases" integer DEFAULT 0 NOT NULL
);
