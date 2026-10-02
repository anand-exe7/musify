"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer, Lock, Pencil, Trash2 } from "lucide-react";
import type { Invoice } from "@/types";
import { TaxInvoiceSheet, TAX_INVOICE_PRINT_CSS } from "@/components/invoice/TaxInvoiceSheet";
import { InvoiceEditor } from "./InvoiceEditor";

/**
 * Admin wrapper around the shared tax-invoice sheet — same content the
 * customer sees at `/invoice/[id]`, plus the admin toolbar (back to ledger,
 * admin-only badge, print, edit, delete).
 */
export function TaxInvoiceView({ invoice }: { invoice: Invoice }) {
  const router = useRouter();
  const [current, setCurrent] = useState<Invoice>(invoice);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function del() {
    if (!confirm(`Delete invoice ${current.number}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices/${encodeURIComponent(current.id)}`, { method: "DELETE" });
      if (res.ok) router.push("/admin/invoices");
      else {
        alert(`Delete failed (${res.status})`);
        setDeleting(false);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
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
              <button
                onClick={del}
                disabled={deleting}
                className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> {deleting ? "Deleting…" : "Delete"}
              </button>
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
