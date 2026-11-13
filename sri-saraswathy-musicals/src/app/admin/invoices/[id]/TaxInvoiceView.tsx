"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, Pencil, Ban } from "lucide-react";
import type { Invoice } from "@/types";
import { TaxInvoiceSheet, TAX_INVOICE_PRINT_CSS } from "@/components/invoice/TaxInvoiceSheet";
import { InvoiceEditor } from "./InvoiceEditor";
import { FulfilmentPanel } from "@/components/admin/FulfilmentPanel";
import { OutputActions } from "@/components/print/OutputActions";
import { invoiceToDoc } from "@/lib/print/doc";
import { usePOS } from "@/lib/store/pos";

/** A cancelled counter bill leaves the bills list and its stock comes back — re-read both so every open screen agrees. */
function refreshAfterCancel(inv: Invoice) {
  if (inv.status === "cancelled" && inv.source === "pos") void usePOS.getState().hydrate();
}

/**
 * Admin wrapper around the shared tax-invoice sheet — same content the
 * customer sees at `/invoice/[id]`, plus the admin toolbar (back to ledger,
 * admin-only badge, print, edit, cancel).
 */
export function TaxInvoiceView({ invoice }: { invoice: Invoice }) {
  const [current, setCurrent] = useState<Invoice>(invoice);
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const cancelled = current.status === "cancelled";

  async function cancel() {
    if (!confirm(`Cancel invoice ${current.number}?

It stays on record as Cancelled (its number is never reused). If it came from a counter sale, the stock goes back and the sale is removed from revenue.`)) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/invoices/${encodeURIComponent(current.id)}`, { method: "DELETE" });
      if (res.ok) {
        const next = (await res.json()) as Invoice;
        setCurrent(next);
        refreshAfterCancel(next);
      } else alert(`Couldn't cancel the invoice (${res.status})`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't cancel the invoice");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="min-h-dvh bg-ivory-100 p-5 md:p-8">
      <style>{TAX_INVOICE_PRINT_CSS}</style>

      {/* Toolbar. Two tiers rather than one wrapping row: where you are, then what you can do —
          otherwise "Back to ledger" and six buttons wrapped into a ragged block. */}
      <div className="mx-auto mb-5 max-w-3xl print:hidden">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Link href="/admin/invoices" className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-medium text-ink-500 hover:text-gold-600">
            <ArrowLeft className="h-4 w-4" /> Back to ledger
          </Link>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-600">
            <Lock className="h-3 w-3" /> Admin view
          </span>
        </div>

        {!editing && (
          <div className="flex flex-col gap-3 rounded-2xl border border-ink-100 bg-ivory-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: what this invoice can become. Right: how it goes out. */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-900 hover:border-gold-400 hover:text-gold-700"
              >
                <Pencil className="h-4 w-4" /> Edit
              </button>
              {!cancelled && (
                <button
                  onClick={cancel}
                  disabled={cancelling}
                  className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
                >
                  <Ban className="h-4 w-4" /> {cancelling ? "Cancelling…" : "Cancel"}
                </button>
              )}
            </div>
            <span className="hidden h-8 w-px shrink-0 bg-ink-100 sm:block" />
            {/* LED-01: WhatsApp, print (thermal / A4) and download, per the customer's need. */}
            <OutputActions
              doc={invoiceToDoc(current)}
              a4TargetId="invoice-sheet"
              phone={current.customerPhone}
              shareLink={current.refId && typeof window !== "undefined" ? `${window.location.origin}/invoice/${encodeURIComponent(current.refId)}` : undefined}
              pdfName={`Invoice-${current.number}`}
              className="sm:justify-end"
            />
          </div>
        )}
      </div>

      {cancelled && !editing && (
        <p className="mx-auto mb-4 max-w-3xl rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm font-semibold text-danger print:hidden">
          This invoice is cancelled. It stays on record under {current.number}.
        </p>
      )}

      {editing ? (
        <InvoiceEditor
          invoice={current}
          onCancel={() => setEditing(false)}
          onSaved={(next) => {
            if (current.status !== "cancelled") refreshAfterCancel(next);
            setCurrent(next);
            setEditing(false);
          }}
        />
      ) : (
        <>
          <FulfilmentPanel invoice={current} />
          <TaxInvoiceSheet invoice={current} />
        </>
      )}
    </div>
  );
}
