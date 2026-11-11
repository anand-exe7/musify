import { handle, ok } from "@/lib/api/http";
import { getBranches } from "@/lib/db/queries/branches";
import { toWhatsAppNumber } from "@/lib/data/business";

export const dynamic = "force-dynamic";

/**
 * INQ-02: each branch's public contact number — the one set on Admin → Branches. The website's inquiry form sends a
 * customer's WhatsApp to the branch they picked, and repair messages show their own branch's number. Public on
 * purpose: these numbers are printed on the storefront anyway.
 */
export function GET() {
  return handle("public", async () => {
    const list = await getBranches();
    return ok(list.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name, phone: b.phone, whatsapp: toWhatsAppNumber(b.phone) })));
  });
}
