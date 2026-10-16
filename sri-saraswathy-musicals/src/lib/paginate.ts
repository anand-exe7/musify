/** Paging helpers shared by the storefront, the admin lists and the tests. */

/** The page numbers to show in a pager: always the first and last, the current page and its
 *  neighbours, with "…" where numbers are skipped. e.g. 1 … 4 5 6 … 20 */
export function pageWindow(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const want = new Set([1, 2, pages - 1, pages, page - 1, page, page + 1]);
  const nums = [...want].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

export interface PageSlice<T> {
  items: T[];
  /** The page actually shown (clamped into range). */
  page: number;
  pages: number;
  total: number;
  /** 1-based position of the first and last item shown (0 when empty). */
  from: number;
  to: number;
}

/** One page of an in-memory list; an out-of-range page is clamped rather than empty. */
export function slicePage<T>(list: T[], page: number, pageSize: number): PageSlice<T> {
  const size = Math.max(1, Math.floor(pageSize) || 1);
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (p - 1) * size;
  const items = list.slice(start, start + size);
  return { items, page: p, pages, total, from: items.length ? start + 1 : 0, to: start + items.length };
}
