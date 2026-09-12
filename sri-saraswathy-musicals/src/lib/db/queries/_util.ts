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
