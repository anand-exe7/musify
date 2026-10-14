CREATE UNIQUE INDEX "invoices_number_unique" ON "invoices" USING btree ("number") WHERE "invoices"."number" <> '';--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "vendors" DROP COLUMN "outstanding";--> statement-breakpoint
ALTER TABLE "vendors" DROP COLUMN "total_purchases";--> statement-breakpoint
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "stock_inward" VALIDATE CONSTRAINT "stock_inward_vendor_id_vendors_id_fk";--> statement-breakpoint
ALTER TABLE "stock_inward" VALIDATE CONSTRAINT "stock_inward_product_id_products_id_fk";--> statement-breakpoint
ALTER TABLE "stock_transfers" VALIDATE CONSTRAINT "stock_transfers_product_id_products_id_fk";--> statement-breakpoint
ALTER TABLE "user_addresses" VALIDATE CONSTRAINT "user_addresses_user_id_users_id_fk";
