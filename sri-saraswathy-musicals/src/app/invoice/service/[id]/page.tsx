import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTicket } from "@/lib/db/queries/repair";
import { BUSINESS } from "@/lib/data/business";
import { ServiceInvoiceView } from "./ServiceInvoiceView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Service Invoice ${id.toUpperCase()} · ${BUSINESS.name}`, robots: { index: false } };
}

/**
 * Customer-facing service (repair) invoice, addressed by the repair ticket id
 * (e.g. /invoice/service/REP-2026-YZ0NZ). This is the public twin of the admin
 * page at /admin/service/[id]/invoice — the link staff send over WhatsApp lands
 * here, so the customer sees the same GST invoice without needing admin access.
 */
export default async function ServiceInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await getTicket(id);
  if (!ticket) notFound();
  return <ServiceInvoiceView ticket={ticket} />;
}
