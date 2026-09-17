"use client";
import Link from "next/link";
import { ArrowLeft, Printer, Lock } from "lucide-react";
import type { Invoice } from "@/types";
import { TaxInvoiceSheet, TAX_INVOICE_PRINT_CSS } from "@/components/invoice/TaxInvoiceSheet";

/**
 * Admin wrapper around the shared tax-invoice sheet — same content the
 * customer sees at `/invoice/[id]`, plus the admin toolbar (back to ledger,
 * admin-only badge, print).
 */
export function TaxInvoiceView({ invoice }: { invoice: Invoice }) {
  return (
    <div className="min-h-screen bg-ivory-100 p-5 md:p-8">
      <style>{TAX_INVOICE_PRINT_CSS}</style>

      {/* Toolbar (hidden on print) */}
      <div className="mx-auto mb-6 flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/admin/invoices" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-gold-600">
          <ArrowLeft className="h-4 w-4" /> Back to ledger
        </Link>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-600">
            <Lock className="h-3 w-3" /> Admin view
          </span>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900"
          >
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
        </div>
      </div>

      <TaxInvoiceSheet invoice={invoice} />
    </div>
  );
}
