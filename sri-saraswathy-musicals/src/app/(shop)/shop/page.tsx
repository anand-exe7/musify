"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ProductCard } from "@/components/shop/ProductCard";
import { useProductPage, useCategories } from "@/lib/client/catalog";
import { Pager } from "@/components/ui/Pager";
import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUSINESS } from "@/lib/data/business";

type SortKey = "featured" | "price-asc" | "price-desc" | "name" | "rating";

const PAGE_SIZE = 12;
const MAX_PRICE = 200000000;

/** A value that only follows `value` once it has stopped changing for `ms` (so dragging the price slider doesn't fire a request per step). */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function ShopContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { categories } = useCategories();
  const activeCategory = params.get("category") || "all";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [sort, setSort] = useState<SortKey>("featured");
  // Price bounds are in paise (₹20,00,000 = 200000000 paise).
  const [priceMax, setPriceMax] = useState<number>(MAX_PRICE);
  const [origin, setOrigin] = useState<"all" | "indian" | "western">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const gridTop = useRef<HTMLDivElement>(null);

  const priceApplied = useDebounced(priceMax, 350);
  const { data, loading, error: loadError, refresh } = useProductPage({
    category: activeCategory, origin, maxPrice: priceApplied >= MAX_PRICE ? 0 : priceApplied, sort, page, pageSize: PAGE_SIZE,
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  /** Change the address's query: `null` removes a key. Used for category and page. */
  const go = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) (v === null ? q.delete(k) : q.set(k, v));
    router.push(`/shop${q.toString() ? "?" + q.toString() : ""}`, { scroll: false });
  };
  const setCategory = (id: string) => go({ category: id === "all" ? null : id, page: null });
  const goToPage = (n: number) => {
    go({ page: n <= 1 ? null : String(n) });
    gridTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // A filter changed: back to the first page.
  const firstPage = () => { if (page !== 1) go({ page: null }); };

  // If the page asked for is past the end (e.g. filters shrank the list), the server returns the last one — follow it.
  useEffect(() => {
    if (data && data.page !== page) go({ page: data.page <= 1 ? null : String(data.page) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.page]);

  return (
    <div className="container-page pb-10 pt-4 md:pb-16 md:pt-8">
      {/* Header */}
      <div className="mb-8">
        <p className="eyebrow">The Shop</p>
        <h1 className="heading-serif mt-3 text-display-lg text-ink-900">
          {activeCategory === "all" ? (<>All <em>instruments</em></>) : (
            <>{categories.find((c) => c.id === activeCategory)?.name} <em>collection</em></>
          )}
        </h1>
        <p className="mt-3 text-sm text-ink-500 md:text-base">
          {total} pieces · in stock at {BUSINESS.branches.map((b) => b.area).join(" & ")}
        </p>
      </div>

      {/* Category chips — horizontal scroll on mobile */}
      <div className="no-scrollbar mask-fade-r -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:flex-wrap md:px-0">
        <button
          onClick={() => setCategory("all")}
          className={cn(
            "shrink-0 border px-4 py-2 text-xs font-medium uppercase tracking-[0.16em] transition-all",
            activeCategory === "all"
              ? "border-ink-900 bg-ink-900 text-ivory-100"
              : "border-ink-200 bg-ivory-50 text-ink-700 hover:border-gold-400",
          )}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={cn(
              "shrink-0 border px-4 py-2 text-xs font-medium uppercase tracking-[0.16em] transition-all",
              activeCategory === c.id
                ? "border-ink-900 bg-ink-900 text-ivory-100"
                : "border-ink-200 bg-ivory-50 text-ink-700 hover:border-gold-400",
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mb-8 flex items-center justify-between gap-4 border-y border-ink-100 py-3">
        <button
          onClick={() => setFiltersOpen(true)}
          className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-ink-700 md:hidden"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </button>

        <div className="hidden items-center gap-6 md:flex">
          <select
            value={origin}
            onChange={(e) => { setOrigin(e.target.value as "all" | "indian" | "western"); firstPage(); }}
            className="border-0 bg-transparent text-xs font-medium uppercase tracking-[0.18em] text-ink-700 focus:outline-none"
          >
            <option value="all">All origins</option>
            <option value="indian">Indian</option>
            <option value="western">Western</option>
          </select>
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-ink-600">
            <span>Under ₹{(priceMax / 100000).toFixed(0)}k</span>
            <input
              type="range"
              min={500000}
              max={200000000}
              step={500000}
              value={priceMax}
              onChange={(e) => { setPriceMax(Number(e.target.value)); firstPage(); }}
              className="h-1 w-40 accent-gold-500"
            />
          </div>
        </div>

        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value as SortKey); firstPage(); }}
          className="border border-ink-200 bg-ivory-50 px-3 py-2 text-xs font-medium uppercase tracking-[0.16em] text-ink-700 focus:border-gold-500 focus:outline-none"
        >
          <option value="featured">Featured</option>
          <option value="price-asc">Price low → high</option>
          <option value="price-desc">Price high → low</option>
          <option value="rating">Top rated</option>
          <option value="name">Name A → Z</option>
        </select>
      </div>

      {/* Products grid */}
      <div ref={gridTop} className="scroll-mt-24" />
      {loading && !data ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: PAGE_SIZE }, (_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[4/5] bg-ink-100" />
              <div className="mt-3 h-3 w-3/4 bg-ink-100" />
              <div className="mt-2 h-3 w-1/3 bg-ink-100" />
            </div>
          ))}
        </div>
      ) : (
        <div className={cn("grid grid-cols-2 gap-4 transition-opacity md:grid-cols-3 md:gap-6 lg:grid-cols-4", loading && "opacity-50")} aria-busy={loading}>
          {items.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      )}

      {data && (
        <Pager className="mt-10" page={data.page} pages={data.pages} total={data.total} from={items.length ? (data.page - 1) * data.pageSize + 1 : 0} to={(data.page - 1) * data.pageSize + items.length} onPage={goToPage} />
      )}

      {!loading && loadError && !data && (
        <div className="border border-dashed border-danger/40 py-20 text-center">
          <p className="heading-serif text-xl text-ink-700">We couldn&apos;t load the instruments.</p>
          <p className="mt-2 text-sm text-ink-400">{loadError}</p>
          <button onClick={refresh} className="mt-4 btn-ghost">Try again</button>
        </div>
      )}

      {!loading && !loadError && data && total === 0 && (
        <div className="border border-dashed border-ink-200 py-20 text-center">
          <p className="heading-serif text-xl text-ink-500">No instruments match this filter.</p>
          <button onClick={() => { setOrigin("all"); setPriceMax(MAX_PRICE); setCategory("all"); }} className="mt-4 btn-ghost">
            Clear filters
          </button>
        </div>
      )}

      {/* Mobile filter drawer */}
      {filtersOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setFiltersOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-ivory-50 p-6 pb-10">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="heading-serif text-2xl text-ink-900">Filters</h3>
              <button onClick={() => setFiltersOpen(false)} className="grid h-8 w-8 place-items-center text-ink-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-6">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">Origin</p>
                <div className="flex gap-2">
                  {(["all", "indian", "western"] as const).map((o) => (
                    <button
                      key={o}
                      onClick={() => { setOrigin(o); firstPage(); }}
                      className={cn("border px-4 py-2 text-xs uppercase tracking-widest", origin === o ? "border-gold-500 bg-gold-500 text-ink-900" : "border-ink-200")}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">Max price · ₹{(priceMax/100000).toFixed(0)}k</p>
                <input type="range" min={500000} max={200000000} step={500000} value={priceMax} onChange={(e) => { setPriceMax(Number(e.target.value)); firstPage(); }} className="h-1 w-full accent-gold-500" />
              </div>
              <button onClick={() => setFiltersOpen(false)} className="btn-gold-solid w-full">
                Show {total} results
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="container-page py-20 text-center text-ink-400">Loading…</div>}>
      <ShopContent />
    </Suspense>
  );
}
