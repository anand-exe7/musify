/**
 * Grant or revoke admin rights on a user — admin status lives entirely in the
 * database `users.is_admin` column (no env allowlist).
 *
 *   npm run admin:set -- someone@gmail.com            # grant admin
 *   npm run admin:set -- someone@gmail.com --revoke   # revoke admin
 *
 * If the person hasn't signed in yet, a placeholder row is created; it links to
 * their Google account automatically on their first sign-in (matched by email).
 *
 * Env is loaded from `.env.local` before the DB client is imported (dynamic
 * import), mirroring `seed.ts`, so the connection string is available.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv(); // .env fallback

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();

  if (!email) {
    console.error("Usage: npm run admin:set -- <email> [--revoke]");
    process.exit(1);
  }
  const { db } = await import("./index");
  const { users } = await import("./schema");
  const { eq } = await import("drizzle-orm");

  // A full admin promotion mirrors the "admin" preset in the users admin UI
  // ([app/admin/users/page.tsx]): isAdmin + role="admin" + no branch pin + full
  // permissions + active. Demotion flips them back to a plain active customer.
  const adminPatch = {
    isAdmin: true,
    role: "admin",
    branch: null,
    active: true,
    permissions: { billing: true, inventory: true, analytics: true, users: true },
  } as const;
  const customerPatch = {
    isAdmin: false,
    role: "customer",
    branch: null,
    active: true,
    permissions: { billing: false, inventory: false, analytics: false, users: false },
  } as const;
  const patch = revoke ? customerPatch : adminPatch;

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    await db.update(users).set(patch).where(eq(users.id, existing.id));
    console.log(
      `✓ ${email} — ${revoke ? "revoked admin" : "granted admin"} (${existing.name}); role=${patch.role}, isAdmin=${patch.isAdmin}`,
    );
    return;
  }

  if (revoke) {
    console.log(`No user with email ${email}; nothing to revoke.`);
    return;
  }

  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await db.insert(users).values({
    id,
    name: email.split("@")[0],
    email,
    phone: "",
    lastLogin: "",
    ...adminPatch,
  });
  console.log(`✓ Created admin placeholder for ${email}. It links to their Google account on first sign-in.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
