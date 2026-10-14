ALTER TABLE "expenses" DROP CONSTRAINT "expenses_branch_check";--> statement-breakpoint
ALTER TABLE "inquiries" DROP CONSTRAINT "inquiries_branch_check";--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_branch_check";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_branch_check";--> statement-breakpoint
ALTER TABLE "pos_bills" DROP CONSTRAINT "pos_bills_branch_check";--> statement-breakpoint
ALTER TABLE "repair_tickets" DROP CONSTRAINT "repair_tickets_status_check";--> statement-breakpoint
ALTER TABLE "repair_tickets" DROP CONSTRAINT "repair_tickets_branch_check";--> statement-breakpoint
ALTER TABLE "staff" DROP CONSTRAINT "staff_branch_check";--> statement-breakpoint
ALTER TABLE "stock_inward" DROP CONSTRAINT "stock_inward_branch_check";--> statement-breakpoint
ALTER TABLE "stock_transfers" DROP CONSTRAINT "stock_transfers_from_branch_check";--> statement-breakpoint
ALTER TABLE "stock_transfers" DROP CONSTRAINT "stock_transfers_to_branch_check";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_check";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_branch_check";--> statement-breakpoint
ALTER TABLE "vendor_payments" DROP CONSTRAINT "vendor_payments_branch_check";--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_check" CHECK ("expenses"."branch" in ('Branch 1', 'Branch 2', 'Branch 3'));--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_branch_check" CHECK ("inquiries"."branch" in ('Branch 1', 'Branch 2', 'Branch 3', 'Any'));--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branch_check" CHECK ("invoices"."branch" in ('Branch 1', 'Branch 2', 'Branch 3'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_check" CHECK ("orders"."branch" in ('Branch 1', 'Branch 2', 'Branch 3'));--> statement-breakpoint
ALTER TABLE "pos_bills" ADD CONSTRAINT "pos_bills_branch_check" CHECK ("pos_bills"."branch" in ('Branch 1', 'Branch 2', 'Branch 3'));--> statement-breakpoint
ALTER TABLE "repair_tickets" ADD CONSTRAINT "repair_tickets_status_check" CHECK ("repair_tickets"."status" in ('received', 'in-progress', 'ready', 'completed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "repair_tickets" ADD CONSTRAINT "repair_tickets_branch_check" CHECK ("repair_tickets"."branch" in ('Branch 1', 'Branch 2', 'Branch 3'));--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_branch_check" CHECK ("staff"."branch" in ('Branch 1', 'Branch 2', 'Branch 3'));--> statement-breakpoint
ALTER TABLE "stock_inward" ADD CONSTRAINT "stock_inward_branch_check" CHECK ("stock_inward"."branch" in ('Branch 1', 'Branch 2', 'Branch 3'));--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_branch_check" CHECK ("stock_transfers"."from_branch" in ('Branch 1', 'Branch 2', 'Branch 3'));--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_branch_check" CHECK ("stock_transfers"."to_branch" in ('Branch 1', 'Branch 2', 'Branch 3'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" in ('admin', 'branch1-manager', 'branch2-manager', 'branch3-manager', 'cashier', 'customer'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_branch_check" CHECK ("users"."branch" in ('Branch 1', 'Branch 2', 'Branch 3'));--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_branch_check" CHECK ("vendor_payments"."branch" in ('Branch 1', 'Branch 2', 'Branch 3'));--> statement-breakpoint
INSERT INTO "branches" ("id", "name", "city", "address", "gstin", "phone", "code", "active") VALUES
  ('Branch 1', 'Vadapalani', 'Chennai', '70/1, 100 Feet Road, Chennai 600026', '33BDVPP9993A1ZV', '+91 99406 38409', 'V', true),
  ('Branch 2', 'Porur', 'Chennai', '12, Trunk Road, Jaya Nagar, Chennai 600116', '33BDVPP9993A1ZV', '+91 72001 78753', 'P', true),
  ('Branch 3', 'Ashok Nagar', 'Chennai', '68A, 100 Feet Road, Chennai 600083', '33BDVPP9993A1ZV', '+91 99406 38409', 'A', true)
ON CONFLICT ("id") DO UPDATE SET "code" = EXCLUDED."code";
