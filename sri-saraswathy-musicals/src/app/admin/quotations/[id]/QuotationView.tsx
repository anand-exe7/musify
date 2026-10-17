"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer, Pencil, Trash2, Link2, MessageCircle, Check, FileCheck2, X } from "lucide-react";
import type { Quotation } from "@/types";
import { QuotationSheet, QUOTATION_PRINT_CSS } from "@/components/quotation/QuotationSheet";
import { QuotationEditor } from "@/components/quotation/QuotationEditor";
import { BUSINESS } from "@/lib/data/business";
import { formatINR } from "@/lib/utils";
import { branchLabel } from "@/lib/stock";
import { PaymentBox } from "@/components/ui/PaymentBox";
import { freshPayBox, resolvePayBox, type PayBox } from "@/lib/paymentSplit";

const btn = "flex items-center gap-2 rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm font-semibold text-ink-900 hover:bg-ivory-100";

/** Admin wrapper around the quotation sheet: print, share, edit, delete. */
export function QuotationView({ quotation, isAdmin }: { quotation: Quotation; isAdmin: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState(quotation);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [converting, setConverting] = useState(false);
  const [payBox, setPayBox] = useState<PayBox>(freshPayBox);
  const [convertBusy, setConvertBusy] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const invoiced = current.status === "invoiced";
  const payResult = resolvePayBox(payBox, current.total);

  async function convert() {
    if (!payResult.ok) return;
    setConvertBusy(true);
    setConvertError(null);
    try {
      const res = await fetch(`/api/quotations/${encodeURIComponent(current.id)}/convert`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payments: payResult.lines }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setConvertError(typeof data?.error === "string" ? data.error : `Couldn't convert (${res.status})`);
        return;
      }
      setCurrent((data as { quotation: Quotation }).quotation);
      setConverting(false);
      router.refresh();
    } catch (e) {
      setConvertError(e instanceof Error ? e.message : "Couldn't convert");
    } finally {
      setConvertBusy(false);
    }
  }

  const shareUrl = () => `${window.location.origin}/quotation/${encodeURIComponent(current.id)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link", shareUrl());
    }
  }

  function whatsapp() {
    const text =
      `*${BUSINESS.name}* — Quotation ${current.number}\n` +
      `Total: ${formatINR(current.total)}` +
      `${(current.advance ?? 0) > 0 ? `\nAdvance to pay: ${formatINR(current.advance ?? 0)}` : ""}\n` +
      `Valid until ${new Date(current.validUntil).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}\n` +
      shareUrl();
    const phone = (current.customerPhone ?? "").replace(/\D/g, "");
    const to = phone.length === 10 ? `91${phone}` : phone;
    window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  async function del() {
    if (!confirm(`Delete quotation ${current.number}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/quotations/${encodeURIComponent(current.id)}`, { method: "DELETE" });
      if (res.ok) router.push("/admin/quotations");
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
      <style>{QUOTATION_PRINT_CSS}</style>

      <div className="mx-auto mb-6 flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/admin/quotations" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-gold-600">
          <ArrowLeft className="h-4 w-4" /> Back to quotations
        </Link>
        {!editing && (
          <div className="flex flex-wrap items-center gap-2">
            {invoiced && current.invoiceId && (
              <Link href={`/admin/invoices/${encodeURIComponent(current.invoiceId)}`} className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm font-semibold text-success hover:bg-success/15">
                <FileCheck2 className="h-4 w-4" /> View invoice
              </Link>
            )}
            {!invoiced && current.status !== "declined" && (
              <button onClick={() => { setConvertError(null); setConverting(true); }} className="flex items-center gap-2 rounded-xl bg-success px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">
                <FileCheck2 className="h-4 w-4" /> Convert to invoice
              </button>
            )}
            <button onClick={copyLink} className={btn}>{copied ? <Check className="h-4 w-4 text-success" /> : <Link2 className="h-4 w-4" />} {copied ? "Copied" : "Copy link"}</button>
            <button onClick={whatsapp} className={btn}><MessageCircle className="h-4 w-4" /> WhatsApp</button>
            {!invoiced && <button onClick={() => setEditing(true)} className={btn}><Pencil className="h-4 w-4" /> Edit</button>}
            {isAdmin && !invoiced && (
              <button
                onClick={del}
                disabled={deleting}
                className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900"
            >
              <Printer className="h-4 w-4" /> Print / Save PDF
            </button>
          </div>
        )}
      </div>

      {invoiced && (
        <div className="mx-auto mb-4 max-w-3xl rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          Turned into an invoice. Stock has been taken from {branchLabel(current.branch)} and the payment recorded, so this quotation is locked.
        </div>
      )}

      {converting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-ink-900">Convert to invoice</h3>
                <p className="mt-1 text-xs text-ink-500">Takes the items out of stock at this branch, records the payment and creates the GST tax invoice. It can&apos;t be converted twice.</p>
              </div>
              <button onClick={() => setConverting(false)} aria-label="Close" className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-ink-900 px-4 py-3 text-ivory-50">
              <span className="text-xs font-semibold uppercase tracking-wider">Invoice total</span>
              <span className="text-lg font-bold tabular-nums">{formatINR(current.total)}</span>
            </div>
            {(current.advance ?? 0) > 0 && (
              <p className="mt-2 rounded-lg bg-gold-500/10 px-3 py-2 text-xs text-ink-700">The quotation asked for an advance of {formatINR(current.advance ?? 0)}. Include what has been received in the payment below.</p>
            )}
            <PaymentBox className="mt-3" total={current.total} value={payBox} onChange={setPayBox} />
            {convertError && <p className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{convertError}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConverting(false)} disabled={convertBusy} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ivory-100 disabled:opacity-50">Cancel</button>
              <button onClick={convert} disabled={convertBusy || !payResult.ok} className="flex-1 rounded-xl bg-success py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {convertBusy ? "Converting…" : "Convert & take stock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing ? (
        <QuotationEditor
          quotation={current}
          onCancel={() => setEditing(false)}
          onSaved={(q) => {
            setCurrent(q);
            setEditing(false);
          }}
        />
      ) : (
        <QuotationSheet quotation={current} />
      )}
    </div>
  );
}
