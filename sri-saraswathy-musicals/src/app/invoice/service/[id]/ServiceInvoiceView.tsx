"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Link2, Check } from "lucide-react";
import type { RepairTicket } from "@/lib/store/repair";
import { ServiceInvoiceSheet, SERVICE_INVOICE_PRINT_CSS } from "@/components/invoice/ServiceInvoiceSheet";

/**
 * Customer-facing service (repair) invoice. Rendered from the DB by the server
 * page, so anyone with the link can view it without signing in — this is what
 * the WhatsApp "Send via WhatsApp" link points at.
 */
export function ServiceInvoiceView({ ticket }: { ticket: RepairTicket }) {
  const [copied, setCopied] = useState(false);

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
      <style>{SERVICE_INVOICE_PRINT_CSS}</style>

      {/* Toolbar (hidden on print) */}
      <div className="mx-auto mb-6 flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900"
          >
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* Invoice sheet */}
      <ServiceInvoiceSheet ticket={ticket} />

      <p className="mx-auto mt-4 max-w-3xl text-center text-[11px] text-ink-400 print:hidden">
        Shareable service invoice — anyone with this link can view it.
      </p>
    </div>
  );
}
