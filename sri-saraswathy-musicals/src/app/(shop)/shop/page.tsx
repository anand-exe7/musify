"use client";
import { useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ProductCard } from "@/components/shop/ProductCard";
import { useProducts, useCategories } from "@/lib/client/catalog";
import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

type SortKey = "featured" | "price-asc" | "price-desc" | "name" | "rating";

function ShopContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { products, loading } = useProducts();
  const { categories } = useCategories();
  const activeCategory = params.get("category") || "all";
  const [sort, setSort] = useState<SortKey>("featured");
  const [priceMax, setPriceMax] = useState<number>(2000000);
  const [origin, setOrigin] = useState<"all" | "indian" | "western">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = [...products];
    if (activeCategory !== "all") list = list.filter((p) => p.category === activeCategory);
    if (origin !== "all") list = list.filter((p) => p.origin === origin);
    list = list.filter((p) => p.price <= priceMax);

    switch (sort) {
      case "price-asc": list.sort((a, b) => a.price - b.price); break;
      case "price-desc": list.sort((a, b) => b.price - a.price); break;
      case "name": list.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "rating": list.sort((a, b) => b.rating - a.rating); break;
      default: list.sort((a, b) => Number(b.featured || false) - Number(a.featured || false));
    }
    return list;
  }, [products, activeCategory, sort, origin, priceMax]);

  const setCategory = (id: string) => {
    const q = new URLSearchParams(params.toString());
    if (id === "all") q.delete("category");
    else q.set("category", id);
    router.push(`/shop${q.toString() ? "?" + q.toString() : ""}`);
  };

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
          {filtered.length} pieces · in stock at Vadapalani & Porur
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
            onChange={(e) => setOrigin(e.target.value as any)}
            className="border-0 bg-transparent text-xs font-medium uppercase tracking-[0.18em] text-ink-700 focus:outline-none"
          >
            <option value="all">All origins</option>
            <option value="indian">Indian</option>
            <option value="western">Western</option>
          </select>
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-ink-600">
            <span>Under ₹{(priceMax / 1000).toFixed(0)}k</span>
            <input
              type="range"
              min={5000}
              max={2000000}
              step={5000}
              value={priceMax}
              onChange={(e) => setPriceMax(Number(e.target.value))}
              className="h-1 w-40 accent-gold-500"
            />
          </div>
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
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
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
        {filtered.map((p, i) => (
          <ProductCard key={p.id} product={p} index={i} />
        ))}
      </div>

      {loading && (
        <div className="py-20 text-center text-ink-400">Loading instruments…</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="border border-dashed border-ink-200 py-20 text-center">
          <p className="heading-serif text-xl text-ink-500">No instruments match this filter.</p>
          <button onClick={() => { setOrigin("all"); setPriceMax(2000000); setCategory("all"); }} className="mt-4 btn-ghost">
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
                      onClick={() => setOrigin(o)}
                      className={cn("border px-4 py-2 text-xs uppercase tracking-widest", origin === o ? "border-gold-500 bg-gold-500 text-ink-900" : "border-ink-200")}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">Max price · ₹{(priceMax/1000).toFixed(0)}k</p>
                <input type="range" min={5000} max={2000000} step={5000} value={priceMax} onChange={(e) => setPriceMax(Number(e.target.value))} className="h-1 w-full accent-gold-500" />
              </div>
              <button onClick={() => setFiltersOpen(false)} className="btn-gold-solid w-full">
                Show {filtered.length} results
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
