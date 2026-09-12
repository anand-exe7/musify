/**
 * Neon (serverless Postgres) connection, wired to Drizzle over the HTTP driver.
 *
 * Import `db` in Server Components, Route Handlers and scripts:
 *
 *   import { db, products } from "@/lib/db";
 *   const rows = await db.select().from(products);
 *
 * The connection string comes from `DATABASE_URL` (see `.env.example`). We do
 * NOT throw at module load when it is missing — that would break `next build`,
 * which evaluates route modules — instead queries fail with a clear connection
 * error at request time. A dev-time warning is logged to catch a missing env.
 */
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString && process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line no-console
  console.warn(
    "[db] DATABASE_URL is not set — add your Neon connection string to .env.local. " +
      "Database queries will fail until it is configured.",
  );
}

// A syntactically valid placeholder keeps `neon()` from throwing at import when
// the env is absent; any real query then fails clearly instead of silently.
const sql = neon(connectionString ?? "postgresql://user:password@localhost/placeholder");

export const db = drizzle(sql, { schema });

export * from "./schema";
