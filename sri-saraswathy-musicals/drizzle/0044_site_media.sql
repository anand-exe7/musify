CREATE TABLE "site_media" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"pathname" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "site_media_kind_check" CHECK ("site_media"."kind" in ('image', 'video'))
);
--> statement-breakpoint
CREATE INDEX "site_media_kind_position_idx" ON "site_media" USING btree ("kind","position");
