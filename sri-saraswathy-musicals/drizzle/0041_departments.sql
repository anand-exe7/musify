CREATE TABLE "pos_departments" (
	"name" text PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
INSERT INTO "pos_departments" ("name")
  SELECT DISTINCT trim("department") FROM "products" WHERE coalesce(trim("department"), '') <> ''
  ON CONFLICT DO NOTHING;
