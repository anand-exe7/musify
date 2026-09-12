import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Standalone tools (drizzle-kit, the seed script) don't get Next.js's automatic
// env loading, so pull `.env.local` in explicitly. `.env` is already covered by
// the `dotenv/config` import above.
loadEnv({ path: ".env.local" });

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
