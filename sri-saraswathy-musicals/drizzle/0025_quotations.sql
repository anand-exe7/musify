CREATE TABLE "quotations" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"date" text NOT NULL,
	"valid_until" text NOT NULL,
	"customer" text NOT NULL,
	"customer_phone" text,
	"customer_gstin" text,
	"branch" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"cgst" integer DEFAULT 0 NOT NULL,
	"sgst" integer DEFAULT 0 NOT NULL,
	"igst" integer DEFAULT 0 NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"advance" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	CONSTRAINT "quotations_status_check" CHECK ("quotations"."status" in ('open', 'accepted', 'declined')),
	CONSTRAINT "quotations_branch_check" CHECK ("quotations"."branch" in ('Branch 1', 'Branch 2', 'Branch 3'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_number_unique" ON "quotations" USING btree ("number");