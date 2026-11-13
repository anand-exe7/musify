"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Printer, Download, MessageCircle, ChevronDown, Receipt, FileText, Loader2 } from "lucide-react";
import { ThermalReceipt, type ThermalWidth } from "@/components/print/ThermalReceipt";
import { BUSINESS } from "@/lib/data/business";
import { docWhatsAppText, type PrintDoc } from "@/lib/print/doc";
import { printElement } from "@/lib/print/isolate";
import { cn } from "@/lib/utils";
import { waUrl } from "@/lib/whatsapp";

export type OutputFormat = "thermal80" | "thermal58" | "a4" | "pdf";

export const THERMAL_ROOT = "thermal-print-root";
const noopSubscribe = () => () => {};

/**
 * Print only `#rootId` on a page of the given size. See `@/lib/print/isolate` — everything off the path to the
 * sheet leaves the print layout, and any other `@page` rule on the page is switched off for the duration
 * (otherwise an 80 mm receipt prints in the middle of an A4 sheet).
 */
export function printIsolated(rootId: string, page: string, mode: "thermal" | "a4") {
  printElement(rootId, page, mode);
}

/** Thermal: roll width × the receipt's own height, no margins, so the printer cuts right after the receipt. */
export function printThermal(width: ThermalWidth, rootId = THERMAL_ROOT) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const heightMm = Math.ceil((root.getBoundingClientRect().height * 25.4) / 96) + 4;
  printIsolated(rootId, `size: ${width}mm ${heightMm}mm; margin: 0;`, "thermal");
}

/** A4's printable width in CSS pixels (210 mm at 96 dpi). */
const A4_WIDTH_PX = 794;

/**
 * Render `targetId` (the A4 sheet) to a multi-page A4 PDF and download it.
 *
 * The sheet is laid out at A4 width for the capture and put back afterwards. Without that the PDF
 * came out as a photograph of whatever the window happened to be: a narrow window made the sheet
 * narrow, its columns overflowed the rounded `overflow-hidden` box and were cut off, and the
 * cropped result was then blown up to fill the page. A download must not depend on the viewer's
 * window size, so the width is fixed here instead.
 */
export async function downloadSheetPdf(targetId: string, fileName: string): Promise<void> {
  const node = document.getElementById(targetId);
  if (!node) throw new Error("Nothing to download");
  const [{ toJpeg }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);

  // Lay the sheet out at A4 width, capture, then put it back exactly as it was.
  const saved = node.getAttribute("style");
  node.style.width = `${A4_WIDTH_PX}px`;
  node.style.maxWidth = `${A4_WIDTH_PX}px`;
  node.style.margin = "0 auto";

  let dataUrl: string;
  try {
    // Two frames: one for the style to apply, one for the re-layout to settle.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const height = Math.ceil(Math.max(node.scrollHeight, node.getBoundingClientRect().height));
    // JPEG keeps a one-page invoice to a few hundred KB (PNG at print resolution runs to ~15 MB).
    dataUrl = await toJpeg(node, {
      pixelRatio: 2,
      quality: 0.92,
      backgroundColor: "#ffffff",
      cacheBust: true,
      width: A4_WIDTH_PX,
      height,
      style: {
        width: `${A4_WIDTH_PX}px`,
        maxWidth: `${A4_WIDTH_PX}px`,
        margin: "0",
        // The page is the border; a rounded, bordered, shadowed card reads as a screenshot of a
        // sheet lying on a page rather than as the page itself.
        border: "0",
        borderRadius: "0",
        boxShadow: "none",
      },
    });
  } finally {
    if (saved === null) node.removeAttribute("style");
    else node.setAttribute("style", saved);
  }

  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  // Full bleed: the sheet already carries its own generous padding, so a second margin here is what
  // made the invoice look like a smaller sheet resting on a blank page.
  const margin = 0;
  const pageW = 210;
  const pageH = 297;
  const imgH = (img.height * pageW) / img.width;
  /** How far past one page a bill may run and still be shrunk onto it rather than split. */
  const FIT_LIMIT = 1.6;
  if (imgH <= pageH) {
    pdf.addImage(dataUrl, "JPEG", margin, margin, pageW, imgH);
  } else if (imgH <= pageH * FIT_LIMIT) {
    // A few lines over: scale it down onto one page instead of leaving an almost-empty second sheet.
    const w = (pageW * pageH) / imgH;
    pdf.addImage(dataUrl, "JPEG", (210 - w) / 2, 0, w, pageH);
  } else {
    // Slice the tall image into A4 pages.
    const slicePx = Math.floor((pageH * img.width) / pageW);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    const ctx = canvas.getContext("2d")!;
    for (let y = 0, page = 0; y < img.height; y += slicePx, page++) {
      const h = Math.min(slicePx, img.height - y);
      canvas.height = h;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, h);
      ctx.drawImage(img, 0, y, img.width, h, 0, 0, img.width, h);
      if (page > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, pageW, (h * pageW) / img.width);
    }
  }
  // Invoice numbers carry "/" (SSM/2026-27/0004) — not allowed in a file name.
  const safe = fileName.replace(/\.pdf$/i, "").replace(/[^\w.-]+/g, "_");
  pdf.save(`${safe}.pdf`);
}

/**
 * The one output bar for invoices, quotations and repair documents (BIL-05/06/07, LED-01, QUO-01/04, REP-05):
 *  • Print → choose Thermal receipt (80 mm / 58 mm, Bluetooth or USB printer) or A4 sheet
 *  • Download PDF (A4)
 *  • WhatsApp (message with the GST split-up and the share link)
 *
 * `autoFormat` runs one action straight away (used when the billing screen opens a just-saved bill).
 */
export function OutputActions({
  doc,
  a4TargetId,
  phone,
  shareLink,
  whatsappText,
  pdfName,
  autoFormat,
  className,
  onWhatsApp,
  showPrint = true,
  showWhatsApp = true,
}: {
  doc: PrintDoc;
  /** id of the A4 sheet element on the page. */
  a4TargetId: string;
  phone?: string | null;
  shareLink?: string;
  /** Override the default WhatsApp message. */
  whatsappText?: string;
  pdfName?: string;
  autoFormat?: OutputFormat | null;
  className?: string;
  onWhatsApp?: () => void;
  /** Hide the print menu — a customer looking at their own invoice only needs the PDF. */
  showPrint?: boolean;
  /** Hide the WhatsApp button, which sends the invoice TO the customer (a shop action). */
  showWhatsApp?: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const [thermal, setThermal] = useState<ThermalWidth | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // true only in the browser (after hydration) — the portal and URL need `document`.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const autoRan = useRef(false);

  // `?output=thermal80|thermal58|a4|pdf` on the page URL runs that action once (billing → "Print" opens here).
  const queryParam = useSyncExternalStore(noopSubscribe, () => new URLSearchParams(window.location.search).get("output") ?? "", () => "");
  const queryFormat: OutputFormat | null =
    queryParam === "thermal80" || queryParam === "thermal58" || queryParam === "a4" || queryParam === "pdf" ? queryParam : null;

  const printA4 = useCallback(() => {
    printElement(a4TargetId, "size: A4; margin: 8mm;", "a4");
  }, [a4TargetId]);

  const pdf = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadSheetPdf(a4TargetId, pdfName ?? `${doc.title}-${doc.number}`.replace(/[^\w.-]+/g, "_"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the PDF");
    } finally {
      setBusy(false);
    }
  }, [a4TargetId, pdfName, doc.title, doc.number]);

  const whatsapp = useCallback(() => {
    const text = whatsappText ?? docWhatsAppText(doc, BUSINESS.name, shareLink);
    const digits = (phone ?? "").replace(/\D/g, "");
    const url = waUrl(digits, text);
    window.open(url, "_blank", "noopener,noreferrer");
    onWhatsApp?.();
  }, [doc, phone, shareLink, whatsappText, onWhatsApp]);

  // Thermal: the effect runs once the receipt is in the DOM; a short timer lets the logo / fonts lay out.
  // (Timers, not animation frames — those never fire in a background tab.)
  useEffect(() => {
    if (thermal === null) return;
    const t = setTimeout(() => printThermal(thermal), 60);
    return () => clearTimeout(t);
  }, [thermal]);

  const run = useCallback(
    (f: OutputFormat) => {
      setMenu(false);
      if (f === "a4") printA4();
      else if (f === "pdf") void pdf();
      else {
        const w: ThermalWidth = f === "thermal58" ? 58 : 80;
        // Re-trigger even when the same width is chosen twice.
        setThermal(null);
        setTimeout(() => setThermal(w), 0);
      }
    },
    [printA4, pdf],
  );

  const auto = autoFormat ?? queryFormat;
  useEffect(() => {
    if (!auto || autoRan.current || !mounted) return;
    autoRan.current = true;
    const t = setTimeout(() => run(auto), 150); // let fonts / images settle
    return () => clearTimeout(t);
  }, [auto, mounted, run]);

  const btn = "flex items-center gap-2 rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm font-semibold text-ink-900 hover:bg-ivory-100";

  return (
    <>
      <div className={cn("flex flex-wrap items-center gap-2 print:hidden", className)}>
        {showPrint && (
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900" aria-haspopup="menu" aria-expanded={menu}>
            <Printer className="h-4 w-4" /> Print <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
              <div role="menu" className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-ink-100 bg-ivory-50 p-2 shadow-xl">
                <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">Choose print size</p>
                <button role="menuitem" onClick={() => run("thermal80")} className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-ink-900/5">
                  <Receipt className="mt-0.5 h-4 w-4 text-gold-600" />
                  <span><span className="block text-sm font-semibold text-ink-900">Thermal receipt · 80 mm</span><span className="block text-xs text-ink-500">Bluetooth / USB receipt printer</span></span>
                </button>
                <button role="menuitem" onClick={() => run("thermal58")} className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-ink-900/5">
                  <Receipt className="mt-0.5 h-4 w-4 text-gold-600" />
                  <span><span className="block text-sm font-semibold text-ink-900">Thermal receipt · 58 mm</span><span className="block text-xs text-ink-500">Small 2-inch printers</span></span>
                </button>
                <button role="menuitem" onClick={() => run("a4")} className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-ink-900/5">
                  <FileText className="mt-0.5 h-4 w-4 text-gold-600" />
                  <span><span className="block text-sm font-semibold text-ink-900">A4 sheet</span><span className="block text-xs text-ink-500">Full-page invoice</span></span>
                </button>
              </div>
            </>
          )}
        </div>
        )}
        <button onClick={() => void pdf()} disabled={busy} className={cn(btn, showPrint ? "disabled:opacity-60" : "border-ink-900 bg-ink-900 text-ivory-50 hover:bg-gold-500 hover:text-ink-900 disabled:opacity-60")}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF
        </button>
        {showWhatsApp && (
          <button onClick={whatsapp} className="flex items-center gap-2 rounded-xl bg-[#128C4B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0f7a41]">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </button>
        )}
        {error && <p className="w-full text-xs text-danger">{error}</p>}
      </div>
      {/* Off-screen thermal receipt, printed on demand. */}
      {mounted && thermal !== null &&
        createPortal(
          <div id={THERMAL_ROOT} aria-hidden style={{ position: "fixed", left: -10000, top: 0, background: "#fff" }}>
            <ThermalReceipt doc={doc} width={thermal} />
          </div>,
          document.body,
        )}
    </>
  );
}
