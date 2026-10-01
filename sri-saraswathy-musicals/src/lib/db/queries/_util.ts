/**
 * Shared query helpers.
 *
 * Drizzle returns `null` for nullable columns, but the app's types spell
 * optional fields as `field?: T` (i.e. `T | undefined`). `row` converts a
 * selected row's top-level `null`s to `undefined` and casts to the frontend
 * type — safe because every column property here is named to match its type.
 */
export function row<T>(r: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) out[k] = v === null ? undefined : v;
  return out as T;
}

export function rows<T>(rs: Record<string, unknown>[]): T[] {
  return rs.map((r) => row<T>(r));
}

/** Drop `undefined` entries so a partial patch only sets provided columns. */
export function definedOnly<T extends Record<string, unknown>>(patch: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** True when a Postgres error is a unique-constraint violation (23505). */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 4; depth++) {
    const o = e as { code?: string; message?: string; cause?: unknown };
    if (o.code === "23505" || /duplicate key value/i.test(o.message ?? "")) return true;
    e = o.cause;
  }
  return false;
}

/** True when a Postgres error is a foreign-key violation (23503) — drizzle wraps
 *  the driver error, so look through `cause` too. */
export function isForeignKeyViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 4; depth++) {
    const o = e as { code?: string; message?: string; cause?: unknown };
    if (o.code === "23503" || /foreign key constraint/i.test(o.message ?? "")) return true;
    e = o.cause;
  }
  return false;
}
