import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getCoupons, upsertCoupon } from "@/lib/db/queries/pos";
import type { Coupon } from "@/lib/store/pos";

export const dynamic = "force-dynamic";

export function GET() {
  return handle("staff", async () => ok(await getCoupons()));
}

// POST upserts by `code`.
export function POST(request: NextRequest) {
  return handle("admin", async () => {
    const body = await readJson<Coupon>(request);
    if (!body?.code) return badRequest("Coupon requires `code`");
    return created(await upsertCoupon(body));
  });
}
