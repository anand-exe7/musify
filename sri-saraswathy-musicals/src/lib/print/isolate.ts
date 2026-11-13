/**
 * Printing one sheet out of a full application page.
 *
 * The old approach was `body * { visibility: hidden }` plus `#sheet { visibility: visible }`. Hidden elements
 * still take up their boxes, so the browser kept paginating the whole admin page — and every wrapper between
 * <body> and the sheet kept its padding, max-width, border and rounded white card. The result on paper was the
 * document sitting in a little boxed-in panel, with stray blank pages around it.
 *
 * Instead: mark the chain of ancestors from <body> down to the sheet, drop every element off that chain out of
 * the layout entirely, and flatten the chain itself so the sheet starts at the top-left of the page and runs the
 * full printable width.
 */

/** Switch off every other `@page` rule on the page, so this print's page size wins. Returns the undo. */
function muteOtherPageRules(keep: HTMLStyleElement): () => void {
  const muted: HTMLStyleElement[] = [];
  for (const el of Array.from(document.querySelectorAll("style"))) {
    if (el === keep) continue;
    if (el.textContent?.includes("@page") && el.media !== "not print") {
      el.dataset.prevMedia = el.media;
      el.media = "not print";
      muted.push(el);
    }
  }
  return () => {
    for (const el of muted) {
      el.media = el.dataset.prevMedia ?? "";
      delete el.dataset.prevMedia;
    }
  };
}

function isolationCss(page: string): string {
  return `
@media print {
  html, body {
    background: #fff !important;
    margin: 0 !important;
    padding: 0 !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
  }
  /* Anything that is neither on the way down to the sheet nor inside it leaves the print layout. */
  body *:not([data-print-path]):not([data-print-root]):not([data-print-root] *) { display: none !important; }
  /* The wrappers above the sheet become invisible scaffolding: no card, no padding, no width cap. */
  [data-print-path] {
    display: block !important;
    position: static !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: none !important;
    box-shadow: none !important;
    width: auto !important;
    min-width: 0 !important;
    max-width: none !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    transform: none !important;
    gap: 0 !important;
  }
  /* The sheet itself fills the page — its own padding stays, its card styling does not. */
  [data-print-root] {
    display: block !important;
    position: static !important;
    visibility: visible !important;
    margin: 0 !important;
    width: 100% !important;
    max-width: none !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: #fff !important;
  }
  [data-print-root] * {
    visibility: visible !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  [data-print-root] .no-print { display: none !important; }
  @page { ${page} }
}`;
}

/**
 * Print `#rootId` on its own, at the given `@page` size. `mode` is mirrored onto
 * `<html data-print-mode>` so sheets can restyle themselves for the paper they are going onto.
 */
export function printElement(rootId: string, page: string, mode: "a4" | "thermal" = "a4") {
  const root = document.getElementById(rootId);
  if (!root) {
    window.print();
    return;
  }

  root.dataset.printRoot = "";
  const path: HTMLElement[] = [];
  for (let n = root.parentElement; n && n !== document.body; n = n.parentElement) {
    n.dataset.printPath = "";
    path.push(n);
  }

  const style = document.createElement("style");
  style.setAttribute("data-isolated-print", mode);
  style.textContent = isolationCss(page);
  document.body.appendChild(style);
  const unmute = muteOtherPageRules(style);
  document.documentElement.dataset.printMode = mode;

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    style.remove();
    unmute();
    delete root.dataset.printRoot;
    for (const n of path) delete n.dataset.printPath;
    delete document.documentElement.dataset.printMode;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  // Some mobile browsers never fire afterprint.
  setTimeout(cleanup, 60_000);
}
