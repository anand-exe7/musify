import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getQuotation } from "@/lib/db/queries/quotations";
import { BUSINESS } from "@/lib/data/business";
import { QuotationShareView } from "./QuotationShareView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `Quotation · ${BUSINESS.name}`, robots: { index: false } };

/**
 * The customer-facing quotation. The id in the URL is the random id minted when
 * the quotation was created, so links can't be guessed from the sequential
 * quotation number printed on the sheet.
 */
export default async function QuotationSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quotation = await getQuotation(id);
  if (!quotation) notFound();
  return <QuotationShareView quotation={quotation} />;
}
