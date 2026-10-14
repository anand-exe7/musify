import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getQuotation } from "@/lib/db/queries/quotations";
import { getVerifiedSession } from "@/lib/auth/server";
import { adminAccessOf, branchAllowed } from "@/lib/auth/session";
import { BUSINESS } from "@/lib/data/business";
import { QuotationView } from "./QuotationView";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `Quotation · ${BUSINESS.name}`, robots: { index: false } };
}

/** Private quotation page for admins and branch staff (staff only for their own branches). */
export default async function AdminQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getVerifiedSession();
  if (!session) redirect("/auth/login?redirect=%2Fadmin%2Fquotations");
  const access = adminAccessOf(session);
  if (!access) redirect("/");

  const { id } = await params;
  const quotation = await getQuotation(id);
  if (!quotation || !branchAllowed(access, quotation.branch)) notFound();

  return <QuotationView quotation={quotation} isAdmin={session.isAdmin} />;
}
