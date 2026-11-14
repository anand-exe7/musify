-- Site media moves from Vercel Blob into the database: the file is stored in chunks.
-- The table was only just created (0044) and holds nothing worth keeping.
DELETE FROM "site_media";--> statement-breakpoint
ALTER TABLE "site_media" DROP COLUMN "url";--> statement-breakpoint
ALTER TABLE "site_media" DROP COLUMN "pathname";--> statement-breakpoint
ALTER TABLE "site_media" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_media" ADD COLUMN "ready" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "site_media_chunks" (
	"media_id" text NOT NULL REFERENCES "site_media"("id") ON DELETE CASCADE,
	"version" integer NOT NULL,
	"idx" integer NOT NULL,
	"data" bytea NOT NULL,
	CONSTRAINT "site_media_chunks_pk" PRIMARY KEY ("media_id","version","idx")
);
