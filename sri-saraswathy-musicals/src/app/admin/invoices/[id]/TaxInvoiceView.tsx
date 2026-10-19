"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Lock, Pencil, Ban } from "lucide-react";
import type { Invoice } from "@/types";
import { TaxInvoiceSheet, TAX_INVOICE_PRINT_CSS } from "@/components/invoice/TaxInvoiceSheet";
import { InvoiceEditor } from "./InvoiceEditor";

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
      if (res.ok) setCurrent((await res.json()) as Invoice);
      else alert(`Couldn't cancel the invoice (${res.status})`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't cancel the invoice");
    } finally {
      setCancelling(false);
    }
  }

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
          {!editing && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm font-semibold text-ink-900 hover:bg-ivory-100"
              >
                <Pencil className="h-4 w-4" /> Edit
              </button>
              {!cancelled && (
                <button
                  onClick={cancel}
                  disabled={cancelling}
                  className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
                >
                  <Ban className="h-4 w-4" /> {cancelling ? "Cancelling…" : "Cancel invoice"}
                </button>
              )}
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900"
              >
                <Printer className="h-4 w-4" /> Print / Save PDF
              </button>
            </>
          )}
        </div>
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
            setCurrent(next);
            setEditing(false);
          }}
        />
      ) : (
        <TaxInvoiceSheet invoice={current} />
      )}
    </div>
  );
}
