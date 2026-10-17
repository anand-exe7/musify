"use client";
import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { usePOS } from "@/lib/store/pos";
import { variantKey, variantLabel } from "@/lib/catalog/variants";
import { variantStockAt, branchLabel, type Branch } from "@/lib/stock";
import { cn, formatINR } from "@/lib/utils";
import type { QuotationLine } from "@/types";

/** Brand + name, without repeating the brand when the name already starts with it. */
const fullName = (p: { brand?: string; name: string }) => (p.brand && !p.name.toLowerCase().startsWith(p.brand.toLowerCase()) ? `${p.brand} ${p.name}` : p.name);

export type PickedLine = Pick<QuotationLine, "name" | "hsn" | "rate" | "gst" | "productId" | "variantKey">;

/**
 * Search the catalogue and pick the product + variant a quotation line sells. Picking fills the name, HSN, GST
 * and price (still editable for a negotiated rate). Shows what is on hand at the quotation's branch, because the
 * quotation becomes a real sale — and takes that stock — when it is converted.
 */
export function LineProductPicker({ branch, onPick, className }: { branch: string; onPick: (line: PickedLine) => void; className?: string }) {
  const products = usePOS((s) => s.invProducts);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLInputElement>(null);
  // The list floats above the table (which scrolls sideways and would clip it), pinned under the field.
  const show = () => {
    const r = box.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left });
    setOpen(true);
  };

  const options = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const out: { key: string; product: (typeof products)[number]; variantIdx: number }[] = [];
    for (const p of products) {
      if (!p.active) continue;
      if (!`${p.brand ?? ""} ${p.name}`.toLowerCase().includes(needle)) continue;
      p.variants.forEach((v, i) => {
        if (!v.disabled) out.push({ key: `${p.id}:${i}`, product: p, variantIdx: i });
      });
      if (out.length >= 12) break;
    }
    return out.slice(0, 12);
  }, [q, products]);

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-400" />
      <input
        ref={box}
        value={q}
        onChange={(e) => { setQ(e.target.value); show(); }}
        onFocus={show}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="Search a product to add…"
        className="w-full min-w-[220px] rounded-lg border border-gold-500/50 bg-ivory-50 py-2 pl-8 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none"
      />
      {open && q.trim() && pos && (
        <ul style={{ top: pos.top, left: Math.min(pos.left, Math.max(8, (typeof window === "undefined" ? 0 : window.innerWidth) - 490)) }} className="fixed z-[60] max-h-72 w-[min(30rem,92vw)] overflow-auto rounded-xl border border-ink-100 bg-white p-1 shadow-card">
          {options.length === 0 && <li className="px-3 py-3 text-xs text-ink-400">No product matches “{q}”.</li>}
          {options.map(({ key, product: p, variantIdx }) => {
            const v = p.variants[variantIdx];
            const onHand = variantStockAt(v, branch as Branch);
            return (
              <li key={key}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const vl = variantLabel(v);
                    onPick({
                      name: `${fullName(p)}${p.variants.length > 1 && vl ? ` — ${vl}` : ""}`,
                      hsn: p.hsn ?? "",
                      rate: v.price,
                      gst: p.isGstApplicable === false ? 0 : (p.gstRate ?? 18),
                      productId: p.id,
                      variantKey: variantKey(v),
                    });
                    setQ("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-ivory-100"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink-900">{fullName(p)}</span>
                    <span className="block truncate text-[11px] text-ink-500">{variantLabel(v) || "Standard"} · {formatINR(v.price)}</span>
                  </span>
                  <span className={cn("shrink-0 rounded px-2 py-0.5 text-[10px] font-bold", onHand > 0 ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
                    {onHand > 0 ? `${onHand} at ${branchLabel(branch)}` : `None at ${branchLabel(branch)}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
