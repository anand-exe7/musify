"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ProductCard } from "@/components/shop/ProductCard";
import { useProductPage, useCategories, useDepartments } from "@/lib/client/catalog";
import { Pager } from "@/components/ui/Pager";
import { Search, X, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUSINESS } from "@/lib/data/business";

type SortKey = "featured" | "price-asc" | "price-desc" | "name" | "rating" | "department";

const PAGE_SIZE = 12;

const SORTS: { value: SortKey; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price · low to high" },
  { value: "price-desc", label: "Price · high to low" },
  { value: "rating", label: "Top rated" },
  { value: "name", label: "Name · A to Z" },
  { value: "department", label: "Department · A to Z" },
];

/** A value that only follows `value` once it has stopped changing for `ms` (so typing doesn't fire a request per key). */
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
  const { departments } = useDepartments();
  const activeCategory = params.get("category") || "all";
  const activeDepartment = params.get("department") || "all";
  const urlQuery = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [sort, setSort] = useState<SortKey>("featured");
  const [query, setQuery] = useState(urlQuery);
  const gridTop = useRef<HTMLDivElement>(null);

  // The address bar is the source of truth for the search term (the header links here with ?q=),
  // and typing in the box writes back to it once the typing stops.
  useEffect(() => { setQuery(urlQuery); }, [urlQuery]);
  const typed = useDebounced(query, 300);

  const { data, loading, error: loadError, refresh } = useProductPage({
    category: activeCategory, department: activeDepartment, origin: "all", maxPrice: 0, q: typed, sort, page, pageSize: PAGE_SIZE,
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const shownCats = categories.filter((c) => c.count > 0 || c.id === activeCategory);

  /** Change the address's query: `null` removes a key. */
  const go = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) (v === null ? q.delete(k) : q.set(k, v));
    router.push(`/shop${q.toString() ? "?" + q.toString() : ""}`, { scroll: false });
  };
  const setCategory = (id: string) => go({ category: id === "all" ? null : id, page: null });
  const setDepartment = (d: string) => go({ department: d === "all" ? null : d, page: null });
  const goToPage = (n: number) => {
    go({ page: n <= 1 ? null : String(n) });
    gridTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Keep ?q= in step with the box, once typing has settled.
  useEffect(() => {
    if (typed === urlQuery) return;
    go({ q: typed.trim() ? typed.trim() : null, page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  // If the page asked for is past the end (e.g. a filter shrank the list), the server returns the last one — follow it.
  useEffect(() => {
    if (data && data.page !== page) go({ page: data.page <= 1 ? null : String(data.page) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.page]);

  const title =
    urlQuery.trim() !== ""
      ? <>Results for <em>{urlQuery.trim()}</em></>
      : activeCategory === "all"
        ? <>All <em>instruments</em></>
        : <>{categories.find((c) => c.id === activeCategory)?.name ?? activeCategory} <em>collection</em></>;

  return (
    <div className="container-page pb-10 pt-4 md:pb-16 md:pt-8">
      {/* Header */}
      <div className="mb-6">
        <p className="eyebrow">The Shop</p>
        <h1 className="heading-serif mt-3 text-display-lg text-ink-900">{title}</h1>
        <p className="mt-3 text-sm text-ink-500">
          {loading && !data ? "Loading the collection…" : `${total} ${total === 1 ? "piece" : "pieces"}`}
          {" · in stock at "}
          {BUSINESS.branches.map((b) => b.area).join(" & ")}
        </p>
      </div>

      {/* One toolbar: search, then categories, then sort. No origin dropdown and no price slider —
          they hid products without saying so, which is what made the shop look empty. */}
      <div className="sticky top-20 z-20 -mx-4 mb-6 bg-[var(--page-bg)]/92 px-4 py-3 backdrop-blur-md md:static md:mx-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search instruments, brands…"
              aria-label="Search instruments"
              className="h-11 w-full rounded-full border border-ink-200 bg-ivory-50 pl-11 pr-10 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-900/5 hover:text-ink-900"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>

          {/* Departments ("Indian", "Western", …) sit above categories, so a visitor can narrow to a
              whole side of the shop before picking an instrument family. */}
          {departments.length > 1 && (
            <label className="relative shrink-0">
              <span className="sr-only">Department</span>
              <select
                value={activeDepartment}
                onChange={(e) => setDepartment(e.target.value)}
                className="h-11 w-full appearance-none rounded-full border border-ink-200 bg-ivory-50 pl-4 pr-9 text-sm text-ink-700 transition-colors focus:border-gold-500 focus:outline-none md:w-48"
              >
                <option value="all">All departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <span aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-400">▾</span>
            </label>
          )}

          <label className="relative shrink-0">
            <span className="sr-only">Sort by</span>
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value as SortKey); go({ page: null }); }}
              className="h-11 w-full appearance-none rounded-full border border-ink-200 bg-ivory-50 pl-4 pr-9 text-sm text-ink-700 transition-colors focus:border-gold-500 focus:outline-none md:w-56"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <span aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-400">▾</span>
          </label>
        </div>

        <div className="no-scrollbar mask-fade-r mt-3 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:pb-0">
          <button
            onClick={() => setCategory("all")}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] transition-all",
              activeCategory === "all"
                ? "border-ink-900 bg-ink-900 text-ivory-100"
                : "border-ink-200 bg-ivory-50 text-ink-700 hover:border-gold-400 hover:text-gold-700",
            )}
          >
            All
          </button>
          {shownCats.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] transition-all",
                activeCategory === c.id
                  ? "border-ink-900 bg-ink-900 text-ivory-100"
                  : "border-ink-200 bg-ivory-50 text-ink-700 hover:border-gold-400 hover:text-gold-700",
              )}
            >
              {c.name}
              <span className="tabular ml-2 opacity-60">{c.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Products grid */}
      <div ref={gridTop} className="scroll-mt-32" />
      {loading && !data ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: PAGE_SIZE }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-ink-100">
              <div className="aspect-square animate-pulse bg-ink-100/70" />
              <div className="space-y-2 p-4">
                <div className="h-2.5 w-1/3 animate-pulse rounded bg-ink-100" />
                <div className="h-3.5 w-3/4 animate-pulse rounded bg-ink-100" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-ink-100" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className={cn(
            "grid grid-cols-2 gap-4 transition-opacity md:grid-cols-3 md:gap-6 lg:grid-cols-4",
            loading && "opacity-50",
          )}
          aria-busy={loading}
        >
          {items.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      )}

      {data && total > 0 && (
        <Pager
          className="mt-10"
          page={data.page}
          pages={data.pages}
          total={data.total}
          from={items.length ? (data.page - 1) * data.pageSize + 1 : 0}
          to={(data.page - 1) * data.pageSize + items.length}
          onPage={goToPage}
        />
      )}

      {!loading && loadError && !data && (
        <div className="rounded-2xl border border-dashed border-danger/40 bg-danger/[0.04] py-16 text-center">
          <p className="heading-serif text-xl text-ink-800">We couldn&apos;t load the instruments.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">{loadError}</p>
          <button onClick={refresh} className="btn-ghost mt-6">
            <RotateCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      )}

      {!loading && !loadError && data && total === 0 && (
        <div className="rounded-2xl border border-dashed border-ink-200 py-16 text-center">
          <p className="heading-serif text-xl text-ink-700">
            {urlQuery.trim() ? <>Nothing matched &ldquo;{urlQuery.trim()}&rdquo;.</> : "Nothing in this category yet."}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-400">
            Try another word, or browse the whole collection.
          </p>
          <button
            onClick={() => { setQuery(""); go({ q: null, category: null, department: null, page: null }); }}
            className="btn-gold-solid mt-6"
          >
            Show everything
          </button>
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
