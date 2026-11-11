"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, Receipt, FileText, Download, MessageCircle, Loader2, Plus, ExternalLink } from "lucide-react";
import type { Invoice } from "@/types";
import { ThermalReceipt, type ThermalWidth } from "@/components/print/ThermalReceipt";
import { TaxInvoiceSheet, TAX_INVOICE_PRINT_CSS } from "@/components/invoice/TaxInvoiceSheet";
import { printThermal, printIsolated, downloadSheetPdf } from "@/components/print/OutputActions";
import { invoiceToDoc } from "@/lib/print/doc";
import { cn } from "@/lib/utils";

const BILL_THERMAL_ROOT = "bill-thermal-root";
const BILL_A4_ROOT = "bill-a4-root";

/**
 * BIL-05 / 06 / 07: what the billing screen shows after "Generate Bill". Thermal (80 / 58 mm), A4 and PDF all run
 * right here on the billing page — the saved bill's invoice is rendered off-screen and printed in place, so no new
 * tab has to load first. WhatsApp opens the chat with the bill message.
 */
export function BillOutputPanel({
  billId,
  saving,
  invoice: given,
  onWhatsApp,
  onNewBill,
}: {
  billId: string;
  /** The bill is still being saved — print / PDF wait for it. */
  saving: boolean;
  /** The invoice that came back with the save (null if it wasn't recorded in that request). */
  invoice: Invoice | null;
  onWhatsApp: () => void;
  onNewBill: () => void;
}) {
  const [fetched, setFetched] = useState<Invoice | null>(null);
  const invoice = given ?? fetched;
  const [failed, setFailed] = useState(false);
  const [thermal, setThermal] = useState<ThermalWidth | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    // Normally the invoice arrives with the save; only ask for it separately if it didn't.
    if (saving || given) return;
    let alive = true;
    // Retry briefly in case it lands a moment later.
    const load = async (attempt: number): Promise<void> => {
      try {
        const res = await fetch(`/api/invoices/by-ref/${encodeURIComponent(billId)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const inv = (await res.json()) as Invoice;
        if (alive) setFetched(inv);
      } catch {
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          if (alive) return load(attempt + 1);
        } else if (alive) setFailed(true);
      }
    };
    void load(0);
    return () => {
      alive = false;
    };
  }, [billId, saving, given]);

  // Thermal: print once the receipt for the chosen width is in the DOM.
  useEffect(() => {
    if (thermal === null) return;
    const t = setTimeout(() => {
      printThermal(thermal, BILL_THERMAL_ROOT);
      setBusy(null);
    }, 60);
    return () => clearTimeout(t);
  }, [thermal]);

  /** Fallback when the invoice couldn't be fetched: do it on the invoice page instead. */
  const openPage = (fmt: string) => window.open(`/invoice/${encodeURIComponent(billId)}?output=${fmt}`, "_blank", "noopener");

  const doThermal = (w: ThermalWidth) => {
    if (!invoice) return openPage(w === 80 ? "thermal80" : "thermal58");
    setBusy(`t${w}`);
    setThermal(null);
    setTimeout(() => setThermal(w), 0);
  };
  const doA4 = () => {
    if (!invoice) return openPage("a4");
    printIsolated(BILL_A4_ROOT, "size: A4; margin: 8mm;", "a4");
  };
  const doPdf = async () => {
    if (!invoice) return openPage("pdf");
    setBusy("pdf");
    try {
      await downloadSheetPdf("invoice-sheet", `Invoice-${invoice.number}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't create the PDF");
    } finally {
      setBusy(null);
    }
  };

  const ready = !saving && (!!invoice || failed);
  const tile =
    "flex flex-col items-center justify-center gap-1.5 rounded-xl border border-ink-200 bg-white px-2 py-3 text-xs font-semibold text-ink-800 transition-all hover:-translate-y-0.5 hover:border-gold-500 hover:text-gold-700 hover:shadow-md disabled:pointer-events-none disabled:opacity-50";

  return (
    <>
      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">How does the customer want it?</p>

      <div className="mt-2 rounded-2xl border border-ink-100 bg-ivory-100/60 p-3">
        <p className="flex items-center gap-2 text-sm font-bold text-ink-900">
          <Printer className="h-4 w-4 text-gold-600" /> Print — choose size
          {!ready && <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-ink-400"><Loader2 className="h-3 w-3 animate-spin" /> {saving ? "Saving…" : "Preparing…"}</span>}
        </p>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <button onClick={() => doThermal(80)} disabled={!ready || busy !== null} className={tile}>
            {busy === "t80" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Receipt className="h-5 w-5" />}Thermal 80 mm
          </button>
          <button onClick={() => doThermal(58)} disabled={!ready || busy !== null} className={tile}>
            {busy === "t58" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Receipt className="h-5 w-5" />}Thermal 58 mm
          </button>
          <button onClick={doA4} disabled={!ready || busy !== null} className={tile}>
            <FileText className="h-5 w-5" />A4 sheet
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={onWhatsApp} className="flex items-center justify-center gap-2 rounded-xl bg-[#128C4B] py-3 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-[#0f7a41]">
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </button>
        <button onClick={() => void doPdf()} disabled={!ready || busy !== null} className="flex items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white py-3 text-xs font-bold uppercase tracking-wider text-ink-800 transition-colors hover:border-gold-500 hover:text-gold-700 disabled:opacity-50">
          {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF
        </button>
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-dashed border-ink-200 pt-4">
        <a href={`/invoice/${encodeURIComponent(billId)}`} target="_blank" rel="noopener" className="flex items-center gap-1.5 rounded-xl px-3 py-3 text-xs font-semibold text-ink-500 hover:bg-ink-900/5 hover:text-ink-900">
          <ExternalLink className="h-3.5 w-3.5" /> View invoice
        </a>
        <button onClick={onNewBill} disabled={saving} className={cn("ml-auto flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-ink-900 to-ink-800 py-3 text-sm font-bold text-ivory-50 shadow-md transition-all hover:from-gold-500 hover:to-gold-400 hover:text-ink-900 disabled:opacity-50")}>
          <Plus className="h-4 w-4" /> Done · New bill
        </button>
      </div>

      {/* Off-screen copies of the bill, printed / captured in place. */}
      {invoice &&
        createPortal(
          <>
            <div id={BILL_A4_ROOT} aria-hidden style={{ position: "fixed", left: -10000, top: 0, width: 794, background: "#fff" }}>
              <style>{TAX_INVOICE_PRINT_CSS}</style>
              <TaxInvoiceSheet invoice={invoice} />
            </div>
            {thermal !== null && (
              <div id={BILL_THERMAL_ROOT} aria-hidden style={{ position: "fixed", left: -10000, top: 0, background: "#fff" }}>
                <ThermalReceipt doc={invoiceToDoc(invoice)} width={thermal} id="bill-thermal-sheet" />
              </div>
            )}
          </>,
          document.body,
        )}
    </>
  );
}
