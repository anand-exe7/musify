-- A weight band must be bounded at both ends: an open-ended one swallows every heavier parcel
-- and hides the bands below it. Anything heavier than the whole ladder is charged the heaviest
-- band instead, so nothing is lost. 50 kg is past anything a music shop posts.
UPDATE "delivery_rates" SET "max_g" = GREATEST("min_g", 50000) WHERE "max_g" IS NULL;--> statement-breakpoint
ALTER TABLE "delivery_rates" ALTER COLUMN "max_g" SET NOT NULL;
