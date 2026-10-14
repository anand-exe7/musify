CREATE TABLE "product_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"attr" text DEFAULT '' NOT NULL,
	"finish" text DEFAULT '' NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"weight" integer DEFAULT 0 NOT NULL,
	"photo" text,
	"disabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "product_variants_price_check" CHECK ("product_variants"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "variant_stock" (
	"variant_id" text NOT NULL,
	"branch" text NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "variant_stock_variant_id_branch_pk" PRIMARY KEY("variant_id","branch"),
	CONSTRAINT "variant_stock_qty_check" CHECK ("variant_stock"."qty" >= 0)
);
--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_stock" ADD CONSTRAINT "variant_stock_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_stock" ADD CONSTRAINT "variant_stock_branch_branches_id_fk" FOREIGN KEY ("branch") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id","position");--> statement-breakpoint
-- Move the variants JSON into rows. A variant's position is its old array index,
-- so every recorded variantIndex keeps pointing at the same variant.
INSERT INTO "product_variants" ("id", "product_id", "position", "attr", "finish", "price", "weight", "disabled")
SELECT gen_random_uuid()::text, p."id", (t.ord - 1)::int,
       coalesce(t.v->>'attr', ''), coalesce(t.v->>'finish', ''),
       greatest(0, coalesce((t.v->>'price')::int, 0)), coalesce((t.v->>'weight')::int, 0),
       coalesce((t.v->>'disabled')::boolean, false)
FROM "products" p, jsonb_array_elements(p."variants") WITH ORDINALITY AS t(v, ord);--> statement-breakpoint
INSERT INTO "variant_stock" ("variant_id", "branch", "qty")
SELECT pv."id", s.key, greatest(0, s.value::int)
FROM "products" p
CROSS JOIN LATERAL jsonb_array_elements(p."variants") WITH ORDINALITY AS t(v, ord)
JOIN "product_variants" pv ON pv."product_id" = p."id" AND pv."position" = t.ord - 1
CROSS JOIN LATERAL jsonb_each_text(t.v->'stockByBranch') AS s(key, value)
WHERE jsonb_typeof(t.v->'stockByBranch') = 'object'
  AND s.key IN (SELECT "id" FROM "branches");--> statement-breakpoint
-- Legacy rows that only carry a flat `stock` count: it sat in Branch 1.
INSERT INTO "variant_stock" ("variant_id", "branch", "qty")
SELECT pv."id", 'Branch 1', greatest(0, (t.v->>'stock')::int)
FROM "products" p
CROSS JOIN LATERAL jsonb_array_elements(p."variants") WITH ORDINALITY AS t(v, ord)
JOIN "product_variants" pv ON pv."product_id" = p."id" AND pv."position" = t.ord - 1
WHERE jsonb_typeof(t.v->'stockByBranch') IS DISTINCT FROM 'object' AND t.v ? 'stock'
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "variants";