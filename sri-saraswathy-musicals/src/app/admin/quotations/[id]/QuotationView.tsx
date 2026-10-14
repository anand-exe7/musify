"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer, Pencil, Trash2, Link2, MessageCircle, Check } from "lucide-react";
import type { Quotation } from "@/types";
import { QuotationSheet, QUOTATION_PRINT_CSS } from "@/components/quotation/QuotationSheet";
import { QuotationEditor } from "@/components/quotation/QuotationEditor";
import { BUSINESS } from "@/lib/data/business";
import { formatINR } from "@/lib/utils";

const btn = "flex items-center gap-2 rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm font-semibold text-ink-900 hover:bg-ivory-100";

/** Admin wrapper around the quotation sheet: print, share, edit, delete. */
export function QuotationView({ quotation, isAdmin }: { quotation: Quotation; isAdmin: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState(quotation);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

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
            <button onClick={copyLink} className={btn}>{copied ? <Check className="h-4 w-4 text-success" /> : <Link2 className="h-4 w-4" />} {copied ? "Copied" : "Copy link"}</button>
            <button onClick={whatsapp} className={btn}><MessageCircle className="h-4 w-4" /> WhatsApp</button>
            <button onClick={() => setEditing(true)} className={btn}><Pencil className="h-4 w-4" /> Edit</button>
            {isAdmin && (
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
