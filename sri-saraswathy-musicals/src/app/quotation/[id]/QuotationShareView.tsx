"use client";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import type { Quotation } from "@/types";
import { QuotationSheet, QUOTATION_PRINT_CSS } from "@/components/quotation/QuotationSheet";

export function QuotationShareView({ quotation }: { quotation: Quotation }) {
  return (
    <div className="min-h-screen bg-ivory-100 p-5 md:p-8">
      <style>{QUOTATION_PRINT_CSS}</style>
      <div className="mx-auto mb-6 flex max-w-3xl items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-gold-600">
          <ArrowLeft className="h-4 w-4" /> Back to shop
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900"
        >
          <Printer className="h-4 w-4" /> Print / Save PDF
        </button>
      </div>
      <QuotationSheet quotation={quotation} />
    </div>
  );
}
