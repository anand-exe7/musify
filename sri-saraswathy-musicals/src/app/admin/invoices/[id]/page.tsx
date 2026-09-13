import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getInvoice } from "@/lib/db/queries/invoices";
import { getSession } from "@/lib/auth/server";
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
 * on the customer-facing /invoice/[id] page. Access is gated by requireAdmin.
 */
export default async function AdminTaxInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/auth/login?redirect=%2Fadmin%2Finvoices");
  if (!session.isAdmin) redirect("/");

  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  return <TaxInvoiceView invoice={invoice} />;
}
