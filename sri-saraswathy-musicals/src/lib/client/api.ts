/**
 * Shared client-side fetch helpers for the Zustand stores. They exist so every
 * store handles failure the same way: a non-2xx response is an ERROR carrying
 * the server's message — never "an empty list" — and an optimistic change that
 * the server refuses is always rolled back.
 */

/** The server's `{ error }` message for a failed response, else a fallback. */
export async function readError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" && body.error ? body.error : `${fallback} (${res.status})`;
}

export const errMsg = (e: unknown, fallback = "Network error") => (e instanceof Error && e.message ? e.message : fallback);

/** GET JSON; throws an Error with the server's message on a non-2xx response. */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(await readError(res, "Request failed"));
  return (await res.json()) as T;
}

/**
 * Build the `send` used by optimistic stores. On a refused or failed write it
 * tells the user WHY (the server's message), then puts the UI back: first by
 * re-reading the server's truth (`resync`); if even that fails, by restoring the
 * snapshot taken before the change — so the revert the alert promises always
 * happens, whatever state the backend is in.
 */
export function makeSender(what: string) {
  return async function send(
    url: string,
    method: string,
    body: unknown,
    resync: () => Promise<boolean | void>,
    restore?: () => void,
  ): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(await readError(res, "Save failed"));
      return true;
    } catch (err) {
      alert(`Couldn't save ${what}: ${errMsg(err)}. Reverting to the saved values.`);
      let resynced: boolean | void = false;
      try {
        resynced = await resync();
      } catch {
        /* handled below */
      }
      if (resynced === false) restore?.();
      return false;
    }
  };
}
