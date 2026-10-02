-- Repair tickets: collapse the status vocabulary to
-- received / in-progress / ready / completed / cancelled.
ALTER TABLE "repair_tickets" DROP CONSTRAINT IF EXISTS "repair_tickets_status_check";
UPDATE "repair_tickets" SET "status" = 'received'    WHERE "status" = 'diagnosing';
UPDATE "repair_tickets" SET "status" = 'in-progress' WHERE "status" = 'awaiting-parts';
ALTER TABLE "repair_tickets" ADD CONSTRAINT "repair_tickets_status_check"
  CHECK ("status" in ('received', 'in-progress', 'ready', 'completed', 'cancelled'));
