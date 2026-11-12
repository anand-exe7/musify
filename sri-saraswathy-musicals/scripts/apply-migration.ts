/**
 * Apply one migration file statement by statement, printing the statement that fails.
 *
 * `drizzle-kit migrate` runs the whole file in one go and, when a statement fails, exits
 * without saying which one — which makes a broken migration impossible to debug. This runs
 * the same statements through the app's own connection and reports exactly where it stopped.
 *
 *   npx tsx scripts/apply-migration.ts drizzle/0042_orange_hercules.sql
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createHash } from "node:crypto";
import { basename } from "node:path";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";

/**
 * Tell drizzle-kit this file is done, so a later `db:migrate` skips it. Drizzle keys its journal
 * on the sha256 of the file's contents and the `when` stamp from `drizzle/meta/_journal.json`.
 */
async function markApplied(file: string, body: string) {
  const tag = basename(file).replace(/\.sql$/, "");
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
    entries: { tag: string; when: number }[];
  };
  const when = journal.entries.find((e) => e.tag === tag)?.when;
  if (when === undefined) {
    console.warn(`  ! ${tag} is not in drizzle/meta/_journal.json — not recording it`);
    return;
  }
  const hash = createHash("sha256").update(body).digest("hex");
  await db.execute(sql`
    insert into "drizzle"."__drizzle_migrations" ("hash", "created_at")
    select ${hash}, ${when}
    where not exists (select 1 from "drizzle"."__drizzle_migrations" where "hash" = ${hash})
  `);
  console.log(`  recorded ${tag} in the migration journal`);
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: tsx scripts/apply-migration.ts <path-to.sql>");
    process.exit(1);
  }
  const body = readFileSync(file, "utf8");
  const statements = body
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`${file}: ${statements.length} statements`);
  for (const [i, statement] of statements.entries()) {
    const head = statement.split("\n")[0].slice(0, 90);
    try {
      await db.execute(sql.raw(statement));
      console.log(`  ✓ ${i + 1}. ${head}`);
    } catch (err) {
      // Drizzle wraps the driver error, so look through `cause` for the real message.
      let message = err instanceof Error ? err.message : String(err);
      for (let e: unknown = err, depth = 0; e && depth < 5; depth++) {
        const o = e as { message?: string; cause?: unknown };
        if (o.message && o.message !== message) message += ` | ${o.message}`;
        e = o.cause;
      }
      // An object that is already there is not a failure — this script is safe to re-run.
      if (/already exists|duplicate (column|object|key)/i.test(message)) {
        console.log(`  · ${i + 1}. ${head} — already applied`);
        continue;
      }
      console.error(`  ✗ ${i + 1}. ${head}\n     ${message}`);
      process.exit(1);
    }
  }
  await markApplied(file, body);
  console.log("done");
}

void main();
