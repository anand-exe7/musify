/**
 * Small helpers for JSON Route Handlers — consistent responses and a `handle`
 * wrapper that turns thrown errors into a 500 (and `HttpError`s into their
 * chosen status) so individual handlers stay focused on the happy path.
 */
import { NextResponse } from "next/server";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const ok = <T>(data: T, init?: ResponseInit) => NextResponse.json(data, init);
export const created = <T>(data: T) => NextResponse.json(data, { status: 201 });
export const noContent = () => new NextResponse(null, { status: 204 });

export const badRequest = (message = "Bad request") =>
  NextResponse.json({ error: message }, { status: 400 });
export const notFound = (message = "Not found") =>
  NextResponse.json({ error: message }, { status: 404 });

/** Wrap a handler body; converts thrown errors into JSON error responses. */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[api] unhandled error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Parse a JSON request body, throwing a 400 on malformed input. */
export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}
