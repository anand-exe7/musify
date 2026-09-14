CREATE TABLE "branches" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text DEFAULT 'Chennai' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
