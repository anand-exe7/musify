CREATE TABLE "pending_checkouts" (
	"razorpay_order_id" text PRIMARY KEY NOT NULL,
	"draft" jsonb NOT NULL,
	"created_at" text NOT NULL
);
