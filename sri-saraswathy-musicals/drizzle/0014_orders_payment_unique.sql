CREATE UNIQUE INDEX IF NOT EXISTS "orders_payment_id_unique" ON "orders" USING btree ("payment_id") WHERE "orders"."payment_id" <> '';
