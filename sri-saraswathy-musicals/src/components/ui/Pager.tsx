"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { pageWindow } from "@/lib/paginate";

/**
 * Page numbers with Previous / Next and a "Showing 1–12 of 48" line. Optionally a
 * "per page" picker. Renders nothing when everything fits on one page and there is no picker.
 */
export function Pager({
  page, pages, total, from, to, onPage, pageSize, pageSizes, onPageSize, className,
}: {
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
  onPage: (page: number) => void;
  pageSize?: number;
  pageSizes?: number[];
  onPageSize?: (size: number) => void;
  className?: string;
}) {
  const picker = pageSizes && onPageSize && pageSize;
  if (pages <= 1 && !picker) return null;
  const btn = "grid h-9 min-w-9 place-items-center border px-2 text-xs font-medium tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <nav aria-label="Pagination" className={cn("flex flex-col items-center justify-between gap-3 sm:flex-row", className)}>
      <p className="text-xs text-ink-500" aria-live="polite">
        {total === 0 ? "No results" : <>Showing <b className="tabular-nums text-ink-700">{from}–{to}</b> of <b className="tabular-nums text-ink-700">{total}</b></>}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {picker && (
          <label className="mr-2 flex items-center gap-1.5 text-xs text-ink-500">
            Per page
            <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="border border-ink-200 bg-ivory-50 px-2 py-1.5 text-xs text-ink-700 focus:border-gold-500 focus:outline-none">
              {pageSizes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        {pages > 1 && (
          <>
            <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page" className={cn(btn, "border-ink-200 bg-ivory-50 text-ink-700 hover:border-gold-400")}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            {pageWindow(page, pages).map((n, i) =>
              n === "…" ? (
                <span key={`gap-${i}`} className="px-1 text-ink-400" aria-hidden>…</span>
              ) : (
                <button
                  key={n}
                  type="button"
                  onClick={() => onPage(n)}
                  aria-current={n === page ? "page" : undefined}
                  className={cn(btn, n === page ? "border-ink-900 bg-ink-900 text-ivory-100" : "border-ink-200 bg-ivory-50 text-ink-700 hover:border-gold-400")}
                >
                  {n}
                </button>
              ),
            )}
            <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page" className={cn(btn, "border-ink-200 bg-ivory-50 text-ink-700 hover:border-gold-400")}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
