CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'Miscellaneous' NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"payment_mode" text DEFAULT 'CASH' NOT NULL,
	"notes" text,
	"expense_date" text NOT NULL,
	"created_at" text NOT NULL,
	"branch" text NOT NULL
);
