"use client";
import { useEffect } from "react";

/** A4 printable height with the sheet's 8mm page margins, in CSS px (96 dpi). */
const PAGE_PX = ((297 - 16) / 25.4) * 96;

/**
 * Makes the invoice print on exactly one page.
 *
 * Two things push an invoice onto extra pages: the rest of the admin screen (sidebar, header) still takes up
 * room while it is only hidden, and a long bill is simply taller than a page. Just before printing, this
 * removes everything around the sheet from the layout and, if the sheet is still taller than a page, shrinks it
 * to fit. Both are undone as soon as printing ends.
 */
export function PrintFit({ target = "invoice-sheet" }: { target?: string }) {
  useEffect(() => {
    let hidden: HTMLElement[] = [];
    let sheet: HTMLElement | null = null;

    const before = () => {
      sheet = document.getElementById(target);
      if (!sheet) return;
      // Everything that is not the sheet or one of its ancestors leaves the layout.
      for (let el: HTMLElement | null = sheet; el && el.parentElement; el = el.parentElement) {
        for (const sib of Array.from(el.parentElement.children)) {
          if (sib !== el && sib instanceof HTMLElement && getComputedStyle(sib).display !== "none") {
            sib.setAttribute("data-print-hidden", sib.style.display);
            sib.style.display = "none";
            hidden.push(sib);
          }
        }
      }
      const h = sheet.getBoundingClientRect().height;
      if (h > PAGE_PX * 0.985) sheet.style.setProperty("zoom", String(Math.max(0.5, (PAGE_PX * 0.96) / h)));
    };
    const after = () => {
      for (const el of hidden) {
        el.style.display = el.getAttribute("data-print-hidden") ?? "";
        el.removeAttribute("data-print-hidden");
      }
      hidden = [];
      sheet?.style.removeProperty("zoom");
    };

    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      after();
    };
  }, [target]);

  return null;
}
