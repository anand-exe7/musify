import type { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api/http";
import { unappliedPayments } from "@/lib/db/queries/purchases";
import { branchAllowed } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Payments made to this vendor that aren't against any bill yet (older, vendor-level payments). */
export function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle("staff", async ({ access }) => {
    const { id } = await params;
    return ok((await unappliedPayments(id)).filter((p) => branchAllowed(access, p.branch)));
  });
}
