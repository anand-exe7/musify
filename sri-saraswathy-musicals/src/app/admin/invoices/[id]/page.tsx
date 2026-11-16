import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getInvoice } from "@/lib/db/queries/invoices";
import { getTicket } from "@/lib/db/queries/repair";
import { invoicePaymentSummary, repairPaymentSummary, type PaymentSummary } from "@/lib/billing/invoicePayment";
import { getVerifiedSession } from "@/lib/auth/server";
import { BUSINESS } from "@/lib/data/business";
import { TaxInvoiceView } from "./TaxInvoiceView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Tax Invoice ${id} · ${BUSINESS.name}`, robots: { index: false } };
}

/**
 * Private tax invoice for admins. Carries the sequential GST invoice number,
 * HSN codes, GSTIN, and the CGST/SGST/IGST split — none of which are exposed
 * on the customer-facing /invoice/[id] page. Access is gated on the DB-verified session (see getVerifiedSession).
 */
export default async function AdminTaxInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getVerifiedSession();
  if (!session) redirect("/auth/login?redirect=%2Fadmin%2Finvoices");
  if (!session.isAdmin) redirect("/");

  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  // What has been paid, shown exactly as the Service → invoice screen shows it. A repair's
  // receipts live on its ticket (cash at intake, GPay on pickup); every other sale carries its
  // own split on the invoice row.
  let payment: PaymentSummary | undefined;
  if (invoice.source === "service" && invoice.refId) {
    const ticket = await getTicket(invoice.refId);
    payment = ticket ? repairPaymentSummary(ticket) : invoicePaymentSummary(invoice);
  } else {
    payment = invoicePaymentSummary(invoice);
  }

  return <TaxInvoiceView invoice={invoice} payment={payment} />;
}
