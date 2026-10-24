ALTER TABLE "repair_tickets" ADD COLUMN "stock_taken" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Under the old rule a ticket's parts left stock the moment they were saved, so for existing tickets that is what has been taken.
UPDATE "repair_tickets" SET "stock_taken" = "parts" WHERE "parts" <> '[]'::jsonb;
