ALTER TABLE "users" ADD COLUMN "branch_access" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
-- Everyone who had a single branch keeps exactly that branch.
UPDATE "users" SET "branch_access" = jsonb_build_array("branch") WHERE "branch" IS NOT NULL;
