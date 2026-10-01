import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getInquiries, createInquiry } from "@/lib/db/queries/inquiries";
import { scopeByBranch } from "@/lib/auth/server";
import type { Inquiry } from "@/lib/store/inquiry";

export const dynamic = "force-dynamic";

/** Inquiry list — admin or branch staff (scoped to their branch). */
export function GET() {
  return handle("staff", async ({ access }) => {
    return ok(scopeByBranch(await getInquiries(), access));
  });
}

// POST stays public: the storefront inquiry form is filled in by visitors.
export function POST(request: NextRequest) {
  return handle("public", async () => {
    const body = await readJson<Inquiry>(request);
    if (!body?.id || !body?.name) return badRequest("Inquiry requires `id` and `name`");
    return created(await createInquiry(body));
  });
}
