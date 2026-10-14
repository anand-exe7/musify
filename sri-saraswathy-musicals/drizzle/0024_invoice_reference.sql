ALTER TABLE "invoices" ADD COLUMN "reference" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_reference_unique" ON "invoices" USING btree ("reference") WHERE "invoices"."reference" <> '';
--> statement-breakpoint
-- Porur's invoice code, as in the client's example (INV-2026-1MH001). Editable on the Branches page.
UPDATE "branches" SET "code" = '1MH' WHERE "id" = 'Branch 2';--> statement-breakpoint
-- Number the existing invoices per branch and year, oldest first.
WITH ranked AS (
  SELECT i."id",
         'INV-' || substr(i."date", 1, 4) || '-' || b."code" ||
           lpad((row_number() OVER (PARTITION BY i."branch", substr(i."date", 1, 4) ORDER BY i."date", i."id"))::text, 3, '0') AS ref
  FROM "invoices" i JOIN "branches" b ON b."id" = i."branch"
)
UPDATE "invoices" SET "reference" = ranked.ref FROM ranked WHERE "invoices"."id" = ranked."id";--> statement-breakpoint
-- Continue each branch's sequence after the numbers just handed out.
INSERT INTO "counters" ("key", "value")
SELECT 'invref:' || b."code" || ':' || substr(i."date", 1, 4), count(*)::int
FROM "invoices" i JOIN "branches" b ON b."id" = i."branch"
GROUP BY b."code", substr(i."date", 1, 4)
ON CONFLICT ("key") DO UPDATE SET "value" = GREATEST("counters"."value", EXCLUDED."value");
