import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/server";
import { getUserAddresses, createUserAddress } from "@/lib/db/queries/addresses";
import type { UserAddress } from "@/types";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => {
    const user = await requireUser();
    return ok(await getUserAddresses(user.id));
  });
}

export function POST(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await request.json().catch(() => null) as Partial<UserAddress> | null;
    if (!body?.name || !body?.line1 || !body?.city || !body?.pincode) {
      return badRequest("Address requires name, line1, city and pincode");
    }
    const id = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString().slice(0, 16).replace("T", " ");
    const addr: UserAddress = {
      id,
      userId: user.id,
      name: body.name,
      phone: body.phone ?? "",
      type: body.type ?? "home",
      line1: body.line1,
      line2: body.line2 ?? "",
      city: body.city,
      state: body.state ?? "Tamil Nadu",
      pincode: body.pincode,
      isDefault: body.isDefault ?? false,
      createdAt: now,
    };
    return created(await createUserAddress(addr));
  });
}
