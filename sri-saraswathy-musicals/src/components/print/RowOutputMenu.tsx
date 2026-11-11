"use client";
import { useState } from "react";
import { MoreHorizontal, Receipt, FileText, Download, MessageCircle } from "lucide-react";
import { BUSINESS } from "@/lib/data/business";
import { docWhatsAppText, type PrintDoc } from "@/lib/print/doc";
import { waUrl } from "@/lib/whatsapp";

/**
 * LED-01 / QUO-04: per-row output menu for list screens. Print and PDF open the document page, which runs the chosen
 * output straight away (`?output=`); WhatsApp sends from here.
 */
export function RowOutputMenu({ href, doc, phone, shareLink }: { href: string; doc: PrintDoc; phone?: string | null; shareLink?: string }) {
  // Fixed-position menu, so a table's horizontal scroll container can't clip it.
  const [open, setOpen] = useState<{ top: number; right: number } | null>(null);
  const go = (fmt: string) => {
    setOpen(null);
    window.open(`${href}${href.includes("?") ? "&" : "?"}output=${fmt}`, "_blank", "noopener");
  };
  const whatsapp = () => {
    setOpen(null);
    const text = docWhatsAppText(doc, BUSINESS.name, shareLink);
    const digits = (phone ?? "").replace(/\D/g, "");
    window.open(waUrl(digits, text), "_blank");
  };
  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-800 hover:bg-ink-900/5";
  return (
    <div className="relative inline-block text-left">
      <button
        onClick={(e) => {
          if (open) return setOpen(null);
          const r = e.currentTarget.getBoundingClientRect();
          const top = r.bottom + 4 + 250 > window.innerHeight ? Math.max(8, r.top - 254) : r.bottom + 4;
          setOpen({ top, right: Math.max(8, window.innerWidth - r.right) });
        }} aria-label="Print, download or WhatsApp" title="Print / Download / WhatsApp" className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-900/5 hover:text-ink-900">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(null)} />
          <div role="menu" style={{ top: open.top, right: open.right }} className="fixed z-40 w-56 rounded-xl border border-ink-100 bg-ivory-50 p-1.5 shadow-xl">
            <button role="menuitem" onClick={() => go("thermal80")} className={item}><Receipt className="h-4 w-4 text-gold-600" /> Print thermal · 80 mm</button>
            <button role="menuitem" onClick={() => go("thermal58")} className={item}><Receipt className="h-4 w-4 text-gold-600" /> Print thermal · 58 mm</button>
            <button role="menuitem" onClick={() => go("a4")} className={item}><FileText className="h-4 w-4 text-gold-600" /> Print A4 sheet</button>
            <button role="menuitem" onClick={() => go("pdf")} className={item}><Download className="h-4 w-4 text-gold-600" /> Download PDF</button>
            <button role="menuitem" onClick={whatsapp} className={item}><MessageCircle className="h-4 w-4 text-[#128C4B]" /> Send on WhatsApp</button>
          </div>
        </>
      )}
    </div>
  );
}
