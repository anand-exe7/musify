"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TAX_INVOICE_PRINT_CSS } from "@/components/invoice/TaxInvoiceSheet";
import { ReceiptSheet } from "@/components/print/ReceiptSheet";
import { OutputActions } from "@/components/print/OutputActions";
import type { PrintDoc } from "@/lib/print/doc";

/** REP-02: the customer's share link for a part-paid repair — a payment receipt, not a tax invoice. */
export function ReceiptShareView({ doc }: { doc: PrintDoc }) {
  return (
    <div className="min-h-dvh bg-ivory-100 p-5 md:p-8">
      <style>{TAX_INVOICE_PRINT_CSS}</style>
      <div className="mx-auto mb-6 flex max-w-3xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between print:hidden">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-gold-600">
          <ArrowLeft className="h-4 w-4" /> Back to shop
        </Link>
        <OutputActions doc={doc} a4TargetId="invoice-sheet" shareLink={typeof window !== "undefined" ? window.location.href.split("?")[0] : undefined} pdfName={`Receipt-${doc.number}`} showPrint={false} showWhatsApp={false} />
      </div>
      <ReceiptSheet doc={doc} />
    </div>
  );
}
