import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy route — service invoices used to live at `/invoice/service/[id]` but
 * every invoice (order, POS, repair) now shares a single URL at `/invoice/[id]`.
 * Existing WhatsApp / bookmarked links land here and 308 to the new URL.
 */
export default async function ServiceInvoiceRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/invoice/${id}`);
}
