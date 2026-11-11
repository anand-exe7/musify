"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Link2, Check } from "lucide-react";
import { OutputActions } from "@/components/print/OutputActions";
import { invoiceToDoc, type PrintDoc } from "@/lib/print/doc";
import type { Invoice } from "@/types";
import { TaxInvoiceSheet, TAX_INVOICE_PRINT_CSS } from "@/components/invoice/TaxInvoiceSheet";

/**
 * Public share wrapper for the tax invoice. Anyone with the link (opaque ref
 * id) can open it without signing in. Admin-only routes get their own toolbar.
 */
export function InvoiceShareView({ invoice, payment, receipt }: { invoice: Invoice; payment?: { paid: number; balance: number; history?: { label: string; amount: number }[] }; receipt?: PrintDoc }) {
  const [copied, setCopied] = useState(false);
  const isBillOfSupply = (invoice.cgst ?? 0) + (invoice.sgst ?? 0) + (invoice.igst ?? 0) === 0;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <div className="min-h-screen bg-ivory-100 p-5 md:p-8">
      <style>{TAX_INVOICE_PRINT_CSS}</style>

      {/* Toolbar (hidden on print) */}
      <div className="mx-auto mb-6 flex max-w-3xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between print:hidden">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-gold-600">
          <ArrowLeft className="h-4 w-4" /> Back to shop
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={copyLink}
            className="flex items-center gap-2 rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:border-gold-500 hover:text-gold-600"
          >
            {copied ? <Check className="h-4 w-4 text-success" /> : <Link2 className="h-4 w-4" />}
            {copied ? "Link copied" : "Copy share link"}
          </button>
          <OutputActions
            doc={receipt ?? invoiceToDoc(invoice, payment)}
            a4TargetId="invoice-sheet"
            phone={invoice.customerPhone}
            shareLink={typeof window !== "undefined" ? window.location.href.split("?")[0] : undefined}
            pdfName={`Invoice-${invoice.number}`}
          />
        </div>
      </div>

      <TaxInvoiceSheet invoice={invoice} payment={payment} />

      <p className="mx-auto mt-4 max-w-3xl text-center text-[11px] text-ink-400 print:hidden">
        Shareable {isBillOfSupply ? "bill of supply" : "tax invoice"} — anyone with this link can view it.
      </p>
    </div>
  );
}
