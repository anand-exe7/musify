"use client";
import { useEffect } from "react";

/**
 * Keeps the rest of the admin screen out of the printed page.
 *
 * The print stylesheet only makes the sidebar, header and toolbar invisible — they still take up room, which
 * pushes the sheet down the paper (and sometimes onto a second page). Just before printing, everything that is
 * not the sheet or one of its ancestors leaves the layout; it all comes back as soon as printing ends.
 *
 * Fitting a long bill onto one page is NOT done here: this hook can only measure the sheet as it looks on
 * SCREEN, which is much taller than the printed layout (the print rules use smaller padding throughout), so
 * scaling from that measurement shrank every invoice to about three quarters of the page and left a band of
 * blank paper under it. The sheet scales itself instead, from its own line count — see `data-fit` in
 * `TAX_INVOICE_PRINT_CSS`.
 */
export function PrintFit({ target = "invoice-sheet" }: { target?: string }) {
  useEffect(() => {
    let hidden: HTMLElement[] = [];
    let sheet: HTMLElement | null = null;

    const before = () => {
      // A thermal receipt is being printed instead — leave the page alone.
      if (document.documentElement.dataset.printMode === "thermal") return;
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
    };
    const after = () => {
      for (const el of hidden) {
        el.style.display = el.getAttribute("data-print-hidden") ?? "";
        el.removeAttribute("data-print-hidden");
      }
      hidden = [];
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
