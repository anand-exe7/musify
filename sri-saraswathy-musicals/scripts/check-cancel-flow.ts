/**
 * One-off live check: raise a 1-item counter bill, cancel its invoice from the ledger path, and confirm
 *  - the bill leaves the bills list (so Orders + Analytics drop it),
 *  - the invoice stays in the ledger as "cancelled" and is left out of "Total billed",
 *  - the stock goes back to the bill's branch, with a stock-movement log entry.
 * Run: npx tsx scripts/check-cancel-flow.ts
 */
import "dotenv/config";

async function main() {
  const { getInventoryList, createBill, getBill, getBills } = await import("@/lib/db/queries/pos");
  const { recordBillInvoice } = await import("@/lib/billing/ledger");
  const { cancelInvoice, getInvoice, getInvoices } = await import("@/lib/db/queries/invoices");
  const { getStockMovements } = await import("@/lib/db/queries/stockMovements");
  const { genInvoiceId } = await import("@/lib/store/pos");

  const branch = "Branch 1" as const;
  const stockAt = async (pid: string, vi: number) => {
    const p = (await getInventoryList()).find((x) => x.id === pid);
    return p?.variants[vi]?.stockByBranch?.[branch] ?? 0;
  };

  // The cheapest variant with at least 2 in stock at Branch 1.
  const list = await getInventoryList();
  const picks = list.flatMap((p) => p.variants.map((v, vi) => ({ p, v, vi }))).filter(({ v }) => !v.disabled && (v.stockByBranch?.[branch] ?? 0) >= 2);
  picks.sort((a, b) => a.v.price - b.v.price);
  const pick = picks[0];
  if (!pick) throw new Error("No product with stock at Branch 1");
  const before = await stockAt(pick.p.id, pick.vi);
  console.log(`Product: ${pick.p.name} (${[pick.v.attr, pick.v.finish].filter(Boolean).join(" · ")}) · stock at ${branch} before: ${before}`);

  const id = genInvoiceId();
  const price = pick.v.price;
  const bill = await createBill({
    id,
    createdAt: new Date().toISOString(),
    customerName: "TEST — cancel check",
    phone: "",
    source: "offline",
    branch,
    items: [{ name: pick.p.name, price, qty: 1, productId: pick.p.id, variantIndex: pick.vi, gstRate: null }],
    subtotal: price,
    discount: 0,
    delivery: 0,
    total: price,
    gstEnabled: false,
    status: "completed",
    payment: "Cash",
    payments: [{ method: "CASH", amount: price }],
  });
  const invoice = await recordBillInvoice(bill, { fresh: true });
  if (!invoice) throw new Error("Invoice was not recorded");
  const afterSale = await stockAt(pick.p.id, pick.vi);
  console.log(`Bill ${id} saved · invoice ${invoice.number} (${invoice.reference}) · stock after sale: ${afterSale}`);

  const liveTotal = (all: Awaited<ReturnType<typeof getInvoices>>) => all.filter((v) => v.status !== "cancelled").reduce((n, v) => n + v.total, 0);
  const totalWithBill = liveTotal(await getInvoices());

  // Cancel — the ledger's "Cancel invoice" button (DELETE /api/invoices/[id]).
  const cancelled = await cancelInvoice(invoice.id);
  const afterCancel = await stockAt(pick.p.id, pick.vi);
  const billGone = !(await getBill(id)) && !(await getBills()).some((b) => b.id === id);
  const inv = await getInvoice(invoice.id);
  const totalAfter = liveTotal(await getInvoices());
  const moves = (await getStockMovements(50)).filter((m) => m.ref === id);

  const checks: [string, boolean][] = [
    ["sale took 1 from stock", afterSale === before - 1],
    ["cancel put it back", afterCancel === before],
    ["bill removed from bills (Orders + Analytics)", billGone],
    ["invoice kept, marked cancelled", cancelled?.status === "cancelled" && inv?.status === "cancelled"],
    ["Total billed drops by the bill amount", totalWithBill - totalAfter === price],
    ["stock movement logged", moves.some((m) => m.reason === "bill_cancelled" && m.branch === branch && m.delta === 1)],
  ];
  console.log(`Stock after cancel: ${afterCancel}`);
  console.log("Movement log:", moves.map((m) => `${m.reason} ${m.branch} ${m.delta > 0 ? "+" : ""}${m.delta} — ${m.note ?? ""}`));
  for (const [label, okay] of checks) console.log(`${okay ? "PASS" : "FAIL"}  ${label}`);
  process.exit(checks.every(([, okay]) => okay) ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
