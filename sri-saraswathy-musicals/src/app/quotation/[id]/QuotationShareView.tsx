"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Quotation } from "@/types";
import { QuotationSheet, QUOTATION_PRINT_CSS } from "@/components/quotation/QuotationSheet";
import { OutputActions } from "@/components/print/OutputActions";
import { quotationToDoc } from "@/lib/print/doc";

export function QuotationShareView({ quotation }: { quotation: Quotation }) {
  return (
    <div className="min-h-screen bg-ivory-100 p-5 md:p-8">
      <style>{QUOTATION_PRINT_CSS}</style>
      <div className="mx-auto mb-6 flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-gold-600">
          <ArrowLeft className="h-4 w-4" /> Back to shop
        </Link>
        {/* QUO-01 / QUO-04: thermal or A4 print, PDF download, WhatsApp. */}
        <OutputActions
          doc={quotationToDoc(quotation)}
          a4TargetId="quotation-sheet"
          shareLink={typeof window !== "undefined" ? window.location.href.split("?")[0] : undefined}
          pdfName={`Quotation-${quotation.number}`}
        />
      </div>
      <QuotationSheet quotation={quotation} />
    </div>
  );
}
