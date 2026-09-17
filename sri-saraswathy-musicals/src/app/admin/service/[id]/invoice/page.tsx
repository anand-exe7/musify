import { notFound, redirect } from "next/navigation";
import { getInvoiceByRefId } from "@/lib/db/queries/invoices";
import { getTicket } from "@/lib/db/queries/repair";
import { recordServiceInvoice } from "@/lib/billing/ledger";
import { getSession } from "@/lib/auth/server";
import { AdminServiceInvoiceView } from "./AdminServiceInvoiceView";

export const dynamic = "force-dynamic";

/**
 * Admin view of a repair's tax invoice. Same content as the public
 * `/invoice/[id]` page — the URL exists so staff can jump straight from a
 * ticket to a printable invoice with the "Send via WhatsApp" action.
 */
export default async function AdminServiceInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/auth/login?redirect=%2Fadmin%2Fservice");
  if (!session.isAdmin) redirect("/");

  const { id } = await params;
  let invoice = await getInvoiceByRefId(id);
  const ticket = await getTicket(id);
  if (!ticket) notFound();

  // Lazily record if the ticket just became billable and no ledger row exists yet.
  if (!invoice) {
    await recordServiceInvoice(ticket);
    invoice = await getInvoiceByRefId(id);
  }

  return <AdminServiceInvoiceView invoice={invoice ?? null} ticket={ticket} />;
}
