"use client";
import { useEffect, useState } from "react";
import { slicePage, type PageSlice } from "@/lib/paginate";

export const ADMIN_PAGE_SIZES = [25, 50, 100];

/**
 * Page through an in-memory list on an admin screen. Pass a `resetKey` made from the filters
 * (e.g. `${query}|${branch}`) and the list goes back to page 1 when they change. The page is
 * clamped, so deleting the last row of the last page never leaves you on an empty page.
 * Spread `pager` onto `<Pager />`; render `items` instead of the whole list.
 */
export function usePaged<T>(list: T[], resetKey = "", initialSize = 25) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(initialSize);
  useEffect(() => { setPage(1); }, [resetKey, size]);
  const s: PageSlice<T> = slicePage(list, page, size);
  return {
    items: s.items,
    pager: {
      page: s.page, pages: s.pages, total: s.total, from: s.from, to: s.to,
      onPage: setPage, pageSize: size, pageSizes: ADMIN_PAGE_SIZES, onPageSize: setSize,
    },
  };
}
