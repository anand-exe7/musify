ALTER TABLE "purchases" DROP CONSTRAINT "purchases_paid_branch_check";--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "paid_allocations" jsonb;--> statement-breakpoint
-- Carry the single paid-by branch over as a one-branch allocation.
UPDATE "purchases" SET "paid_allocations" = jsonb_build_object("paid_branch", "amount_paid") WHERE "paid_branch" IS NOT NULL AND "amount_paid" > 0;
