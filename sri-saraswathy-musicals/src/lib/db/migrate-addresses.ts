import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function run() {
  console.log("Running migration: create user_addresses table...");
  await sql`
    CREATE TABLE IF NOT EXISTS "user_addresses" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "name" text NOT NULL,
      "phone" text DEFAULT '' NOT NULL,
      "type" text DEFAULT 'home' NOT NULL,
      "line1" text DEFAULT '' NOT NULL,
      "line2" text DEFAULT '' NOT NULL,
      "city" text DEFAULT '' NOT NULL,
      "state" text DEFAULT 'Tamil Nadu' NOT NULL,
      "pincode" text DEFAULT '' NOT NULL,
      "is_default" boolean DEFAULT false NOT NULL,
      "created_at" text DEFAULT '' NOT NULL
    )
  `;
  console.log("✓ user_addresses table ready.");
}

run().catch((err) => { console.error(err); process.exit(1); });
