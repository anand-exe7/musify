CREATE TABLE "delivery_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"eta" text DEFAULT '' NOT NULL,
	"pricing" text DEFAULT 'zone' NOT NULL,
	"flat_price" integer DEFAULT 0 NOT NULL,
	"surcharge" integer DEFAULT 0 NOT NULL,
	"dispatch_days" integer DEFAULT 2 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "delivery_methods_pricing_check" CHECK ("delivery_methods"."pricing" in ('zone', 'flat'))
);
--> statement-breakpoint
CREATE TABLE "delivery_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"zone_id" text NOT NULL,
	"min_g" integer DEFAULT 0 NOT NULL,
	"max_g" integer,
	"price" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "delivery_method" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "delivery_eta" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "dispatch_by" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_method" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_eta" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "dispatch_by" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "weight_g" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_rates" ADD CONSTRAINT "delivery_rates_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_rates_zone_idx" ON "delivery_rates" USING btree ("zone_id");--> statement-breakpoint
-- Carry the old fixed slabs over as editable weight bands, so nothing a shop already
-- priced is lost when the five hard-coded columns stop being read.
INSERT INTO "delivery_rates" ("id", "zone_id", "min_g", "max_g", "price", "position")
SELECT md5(z."id" || ':0'), z."id", 0, 250, z."upto_gm_250", 0
  FROM "delivery_zones" z WHERE z."upto_gm_250" > 0;--> statement-breakpoint
INSERT INTO "delivery_rates" ("id", "zone_id", "min_g", "max_g", "price", "position")
SELECT md5(z."id" || ':1'), z."id",
       CASE WHEN z."upto_gm_250" > 0 THEN 251 ELSE 0 END, 500,
       CASE WHEN z."upto_gm_500" > 0 THEN z."upto_gm_500" ELSE z."charge" END, 1
  FROM "delivery_zones" z WHERE z."upto_gm_500" > 0 OR z."charge" > 0;--> statement-breakpoint
INSERT INTO "delivery_rates" ("id", "zone_id", "min_g", "max_g", "price", "position")
SELECT md5(z."id" || ':2'), z."id", 501, NULL,
       CASE WHEN z."upto_gm_500" > 0 THEN z."upto_gm_500" ELSE z."charge" END + z."per_addl_500", 2
  FROM "delivery_zones" z WHERE z."per_addl_500" > 0;--> statement-breakpoint
-- Every state not named in a zone has to land somewhere: that is the zone with no states.
INSERT INTO "delivery_zones" ("id", "name", "states", "eta")
SELECT 'rest-of-india', 'Rest of India', '[]'::jsonb, ''
 WHERE NOT EXISTS (SELECT 1 FROM "delivery_zones" WHERE jsonb_array_length("states") = 0);--> statement-breakpoint
-- Checkout offers only what is in this table, so start it with one method rather than none.
INSERT INTO "delivery_methods" ("id", "name", "description", "eta", "pricing", "dispatch_days", "position")
SELECT 'standard', 'Standard', 'Insured courier.', '3 to 5 working days', 'zone', 2, 0
 WHERE NOT EXISTS (SELECT 1 FROM "delivery_methods");
