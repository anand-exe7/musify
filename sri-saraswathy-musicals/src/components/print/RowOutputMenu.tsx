"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, Receipt, FileText, Download, MessageCircle, Loader2 } from "lucide-react";
import { BUSINESS } from "@/lib/data/business";
import { docWhatsAppText, type PrintDoc } from "@/lib/print/doc";
import { waUrl } from "@/lib/whatsapp";
import { ThermalReceipt, type ThermalWidth } from "@/components/print/ThermalReceipt";
import { printThermal, printIsolated, downloadSheetPdf } from "@/components/print/OutputActions";

const ROW_THERMAL_ROOT = "row-thermal-root";
const ROW_A4_ROOT = "row-a4-root";

type Job = "thermal80" | "thermal58" | "a4" | "pdf";

/**
 * LED-01 / QUO-04: per-row output menu for list screens. Thermal, A4 and PDF all run right here on the list — the
 * document is rendered off-screen and printed / captured in place, so no other page opens. WhatsApp sends from here.
 *
 * `sheet` is the full A4 document (and the id of its sheet element, for the PDF). Without it, A4 / PDF fall back to
 * opening `href` with `?output=`.
 */
export function RowOutputMenu({
  href,
  doc,
  phone,
  shareLink,
  sheet,
  pdfName,
}: {
  href: string;
  doc: PrintDoc;
  phone?: string | null;
  shareLink?: string;
  sheet?: { node: ReactNode; css: string; id: string };
  pdfName?: string;
}) {
  // Fixed-position menu, so a table's horizontal scroll container can't clip it.
  const [open, setOpen] = useState<{ top: number; right: number } | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  // Latest props for the job runner, so a list re-render mid-print doesn't start it again.
  const latest = useRef({ sheet, pdfName, name: doc.number });
  useEffect(() => {
    latest.current = { sheet, pdfName, name: doc.number };
  });

  // Run the chosen output once its off-screen copy is in the DOM.
  useEffect(() => {
    if (!job) return;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    // Drop the off-screen copy once the print dialog closes (some mobile browsers never say so — hence the fallback).
    const finished = () => setJob(null);
    const t = setTimeout(async () => {
      if (job === "pdf") {
        try {
          const { sheet: sh, pdfName: pn, name } = latest.current;
          if (sh) await downloadSheetPdf(sh.id, pn || name || "document");
        } catch (e) {
          alert(e instanceof Error ? e.message : "Couldn't create the PDF");
        } finally {
          setJob(null);
        }
        return;
      }
      window.addEventListener("afterprint", finished, { once: true });
      fallback = setTimeout(finished, 60_000);
      if (job === "a4") printIsolated(ROW_A4_ROOT, "size: A4; margin: 8mm;", "a4");
      else printThermal(job === "thermal80" ? 80 : 58, ROW_THERMAL_ROOT);
    }, 80);
    return () => {
      clearTimeout(t);
      if (fallback) clearTimeout(fallback);
      window.removeEventListener("afterprint", finished);
    };
  }, [job]);

  const run = (j: Job) => {
    setOpen(null);
    if ((j === "a4" || j === "pdf") && !sheet) {
      window.open(`${href}${href.includes("?") ? "&" : "?"}output=${j}`, "_blank", "noopener");
      return;
    }
    setJob(j);
  };
  const whatsapp = () => {
    setOpen(null);
    const text = docWhatsAppText(doc, BUSINESS.name, shareLink);
    const digits = (phone ?? "").replace(/\D/g, "");
    window.open(waUrl(digits, text), "_blank");
  };
  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-800 hover:bg-ink-900/5";
  const thermalWidth: ThermalWidth | null = job === "thermal80" ? 80 : job === "thermal58" ? 58 : null;

  return (
    <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          if (open) return setOpen(null);
          const r = e.currentTarget.getBoundingClientRect();
          const top = r.bottom + 4 + 250 > window.innerHeight ? Math.max(8, r.top - 254) : r.bottom + 4;
          setOpen({ top, right: Math.max(8, window.innerWidth - r.right) });
        }}
        aria-label="Print, download or WhatsApp"
        title="Print / Download / WhatsApp"
        className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-900/5 hover:text-ink-900"
      >
        {job === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(null)} />
          <div role="menu" style={{ top: open.top, right: open.right }} className="fixed z-40 w-56 rounded-xl border border-ink-100 bg-ivory-50 p-1.5 shadow-xl">
            <button role="menuitem" onClick={() => run("thermal80")} className={item}><Receipt className="h-4 w-4 text-gold-600" /> Thermal · 80 mm</button>
            <button role="menuitem" onClick={() => run("thermal58")} className={item}><Receipt className="h-4 w-4 text-gold-600" /> Thermal · 58 mm</button>
            <button role="menuitem" onClick={() => run("a4")} className={item}><FileText className="h-4 w-4 text-gold-600" /> A4 sheet</button>
            <button role="menuitem" onClick={() => run("pdf")} className={item}><Download className="h-4 w-4 text-gold-600" /> Download PDF</button>
            <button role="menuitem" onClick={whatsapp} className={item}><MessageCircle className="h-4 w-4 text-[#128C4B]" /> Send on WhatsApp</button>
          </div>
        </>
      )}

      {/* Off-screen copy of the document for the chosen output. */}
      {job &&
        createPortal(
          thermalWidth !== null ? (
            <div id={ROW_THERMAL_ROOT} aria-hidden style={{ position: "fixed", left: -10000, top: 0, background: "#fff" }}>
              <ThermalReceipt doc={doc} width={thermalWidth} id="row-thermal-sheet" />
            </div>
          ) : sheet ? (
            <div id={ROW_A4_ROOT} aria-hidden style={{ position: "fixed", left: -10000, top: 0, width: 794, background: "#fff" }}>
              <style>{sheet.css}</style>
              {sheet.node}
            </div>
          ) : null,
          document.body,
        )}
    </div>
  );
}
