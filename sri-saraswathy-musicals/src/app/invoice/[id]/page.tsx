import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getInvoiceByRefId } from "@/lib/db/queries/invoices";
import { getOrder } from "@/lib/db/queries/orders";
import { getBill } from "@/lib/db/queries/pos";
import { getTicket } from "@/lib/db/queries/repair";
import { recordOrderInvoice, recordBillInvoice, recordServiceInvoice } from "@/lib/billing/ledger";
import { BUSINESS } from "@/lib/data/business";
import type { Invoice } from "@/types";
import { InvoiceShareView } from "./InvoiceShareView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Invoice ${id.toUpperCase()} · ${BUSINESS.name}`, robots: { index: false } };
}

/**
 * The one customer-facing invoice URL — resolves an opaque ref id
 * (ORD-/POS-/REP-…) to its tax invoice row and renders the shared sheet. The
 * ref id in the URL is deliberately random so links can't be enumerated to read
 * other customers' invoices, while the sheet inside shows the sequential
 * SSM/FY/NNNN number required by GST Rule 46.
 *
 * If a source record exists (order/bill/ticket) but no invoice row was written
 * yet — a best-effort record earlier in the request failed, or a repair is
 * newly billable — we record it lazily here so the link is never permanently
 * dead. A repair that isn't billable yet (still in progress) 404s.
 */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let invoice: Invoice | undefined = await getInvoiceByRefId(id);

  if (!invoice) {
    const order = await getOrder(id);
    if (order) {
      await recordOrderInvoice(order);
      invoice = await getInvoiceByRefId(id);
    }
  }
  if (!invoice) {
    const bill = await getBill(id);
    if (bill) {
      await recordBillInvoice(bill);
      invoice = await getInvoiceByRefId(id);
    }
  }
  if (!invoice) {
    const ticket = await getTicket(id);
    if (ticket) {
      await recordServiceInvoice(ticket);
      invoice = await getInvoiceByRefId(id);
    }
  }

  if (!invoice) notFound();
  return <InvoiceShareView invoice={invoice} />;
}
