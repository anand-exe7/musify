CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"gstin" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "customer_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_unique" ON "customers" USING btree ("phone");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
-- Backfill: one customer per valid mobile number already on an invoice (name/GSTIN from the latest invoice that had them).
INSERT INTO "customers" ("id", "phone", "name", "gstin", "created_at", "updated_at")
SELECT gen_random_uuid()::text,
       v.phone,
       COALESCE((array_agg(btrim(v.customer) ORDER BY v.d DESC) FILTER (WHERE lower(btrim(v.customer)) NOT IN ('', 'walk-in')))[1], ''),
       (array_agg(v.gstin ORDER BY v.d DESC) FILTER (WHERE COALESCE(v.gstin, '') <> ''))[1],
       min(v.d),
       max(v.d)
FROM (
  SELECT right(regexp_replace("customer_phone", '[^0-9]', '', 'g'), 10) AS phone,
         "customer" AS customer, "customer_gstin" AS gstin, "date" AS d
  FROM "invoices"
  WHERE "customer_phone" IS NOT NULL
    AND length(regexp_replace("customer_phone", '[^0-9]', '', 'g')) >= 10
) v
WHERE v.phone ~ '^[6-9][0-9]{9}$'
GROUP BY v.phone;--> statement-breakpoint
UPDATE "invoices" i SET "customer_id" = c."id"
FROM "customers" c
WHERE i."customer_phone" IS NOT NULL
  AND length(regexp_replace(i."customer_phone", '[^0-9]', '', 'g')) >= 10
  AND c."phone" = right(regexp_replace(i."customer_phone", '[^0-9]', '', 'g'), 10);
