ALTER TABLE "delivery_zones" ADD COLUMN "states" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD COLUMN "upto_gm_250" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD COLUMN "upto_gm_500" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD COLUMN "per_addl_500" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD COLUMN "above_5kg_per_kg" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD COLUMN "above_10kg_per_kg" integer DEFAULT 0 NOT NULL;