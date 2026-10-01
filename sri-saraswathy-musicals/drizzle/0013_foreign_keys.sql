-- Referential integrity for the tables that point at users / products / vendors by id.
-- NOT VALID: enforced for every new/updated row, but rows already in a live database
-- are not scanned, so legacy orphans can't fail the deploy. Clean them up, then
-- run `ALTER TABLE <t> VALIDATE CONSTRAINT <name>` for each.
--   orders.user_id        → users      (deleting a customer keeps their orders)
--   user_addresses        → users      (addresses go with the customer)
--   stock_inward/transfers→ products   (RESTRICT: a product with stock history can't be deleted)
--   stock_inward          → vendors    (RESTRICT)
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "stock_inward" ADD CONSTRAINT "stock_inward_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "stock_inward" ADD CONSTRAINT "stock_inward_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action NOT VALID;