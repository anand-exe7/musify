/**
 * ANA-01: how money is reported by mode.
 *
 * Three counter modes (Cash / Card / UPI) plus one "Online" bucket for everything the website
 * collects — the gateway's own words ("netbanking", "razorpay", "wallet") never reach a report.
 * A sale paid two ways counts under BOTH modes, each for its own amount.
 */
import { describe, expect, it } from "vitest";
import { REPORT_MODES, reportMode, modeText, paidViaText, paidModesText, modeSplit } from "@/lib/paymentSplit";
import { ticketToBill, ticketPartPaymentBills, orderToBill } from "@/lib/client/sales";
import { repairPaymentSummary, repairGross, invoicePaymentSummary } from "@/lib/billing/invoicePayment";
import { grossTotal } from "@/lib/store/repair";
import type { RepairTicket } from "@/lib/store/repair";
import type { Order, Invoice } from "@/types";

const money = (p: number) => `₹${(p / 100).toFixed(2)}`;

const ticket = (over: Partial<RepairTicket> = {}): RepairTicket => ({
  id: "REP-1", createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-02T10:00:00.000Z", customerName: "A", phone: "1",
  productName: "Veena", category: "Strings", problem: "", status: "completed", priority: "normal", branch: "Branch 1",
  deadline: "2026-10-10T00:00:00.000Z", estimate: 100000, finalCost: 0, advance: 0, gstRate: 18, events: [], ...over,
}) as RepairTicket;

const split = [
  { id: "a", at: "2026-10-01T10:00:00.000Z", amount: 60000, mode: "CASH", receiptNo: "REP-1/R1" },
  { id: "b", at: "2026-10-02T10:00:00.000Z", amount: 40000, mode: "CARD", receiptNo: "REP-1/R2" },
];

describe("payment modes reported on", () => {
  it("reports four modes and never a gateway instrument", () => {
    expect([...REPORT_MODES]).toEqual(["Cash", "Card", "UPI", "Online"]);
    expect(reportMode("netbanking")).toBe("Online");
    expect(reportMode("razorpay")).toBe("Online");
    expect(reportMode("wallet")).toBe("Online");
    expect(modeText("netbanking")).toBe("Online");
    expect(modeText("CASH")).toBe("Cash");
    expect(modeText("Cash + UPI")).toBe("Cash + UPI");
  });

  it("names the modes without amounts for the invoices list", () => {
    expect(paidModesText([{ method: "CASH", amount: 60000 }, { method: "CARD", amount: 40000 }], "split")).toBe("Cash + Card");
    expect(paidModesText([{ method: "CASH", amount: 10000 }, { method: "CARD", amount: 10000 }, { method: "UPI", amount: 10000 }], "split")).toBe("Cash + Card + UPI");
    // A line of zero isn't a mode that was used, and the same mode twice reads once.
    expect(paidModesText([{ method: "CASH", amount: 10000 }, { method: "CARD", amount: 0 }], "split")).toBe("Cash");
    expect(paidModesText([{ method: "UPI", amount: 10000 }, { method: "UPI", amount: 5000 }], "upi")).toBe("UPI");
    // Nothing saved on the row falls back to the invoice's own mode, gateway words included.
    expect(paidModesText([], "netbanking")).toBe("Online");
    expect(paidModesText(null, "Cash + UPI")).toBe("Cash + UPI");
  });

  it("spells out a split and names a single mode plainly", () => {
    expect(paidViaText([{ method: "CASH", amount: 60000 }, { method: "CARD", amount: 40000 }], "split", money))
      .toBe("Cash ₹600.00 · Card ₹400.00");
    expect(paidViaText([{ method: "UPI", amount: 10000 }], "upi", money)).toBe("UPI");
    expect(paidViaText([], "netbanking", money)).toBe("Online");
  });
});

describe("a repair paid two ways", () => {
  it("carries both modes with their own amounts, not just the bigger one", () => {
    const b = ticketToBill(ticket({ payments: split, advance: 100000 }));
    expect(b.payments).toEqual([{ method: "CASH", amount: 60000 }, { method: "CARD", amount: 40000 }]);
    expect(b.payment).toBe("Cash + Card");
    expect(b.total).toBe(100000);
  });

  it("gives a part payment on an unfinished repair its own mode", () => {
    const rows = ticketPartPaymentBills(ticket({ status: "received", advance: 60000, payments: [split[0]] }));
    expect(rows).toHaveLength(1);
    expect(rows[0].payments).toEqual([{ method: "CASH", amount: 60000 }]);
  });

  it("summarises what was paid and what is still owed", () => {
    const s = repairPaymentSummary(ticket({ payments: [split[0]], advance: 60000 }));
    expect(s).toMatchObject({ paid: 60000, balance: 40000 });
    expect(s.history).toHaveLength(1);
    expect(s.history![0].label).toContain("Cash");
  });
});

describe("a web order", () => {
  const order = { id: "ORD-1", date: "2026-10-01", customerName: "B", phone: "2", items: [], subtotal: 50000, shipping: 0, total: 50000, status: "processing", paymentMethod: "netbanking" } as unknown as Order;

  it("reports as one Online collection, whatever instrument the gateway used", () => {
    expect(orderToBill(order).payment).toBe("Online");
  });
});

describe("invoice payment summary", () => {
  const inv = (over: Partial<Invoice> = {}): Invoice => ({
    id: "INV-1", number: "SSM/2026-27/0001", reference: "", date: "2026-10-01T10:00:00.000Z", customer: "A", branch: "Branch 1",
    items: [], subtotal: 0, cgst: 0, sgst: 0, igst: 0, total: 100000, paymentMode: "split", status: "paid", source: "pos", refId: "POS-1",
    ...over,
  }) as Invoice;

  it("lists each payment of a split counter sale", () => {
    const s = invoicePaymentSummary(inv({ payments: [{ method: "CASH", amount: 60000 }, { method: "CARD", amount: 40000 }] }));
    expect(s).toMatchObject({ paid: 100000, balance: 0 });
    expect(s!.history!.map((h) => h.amount)).toEqual([60000, 40000]);
    expect(s!.history![0].label).toContain("Cash");
  });

  it("falls back to one line for a paid invoice with no split saved, and shows nothing for a cancelled one", () => {
    expect(invoicePaymentSummary(inv({ payments: [], paymentMode: "netbanking", source: "web" }))!.history![0].label).toContain("Online");
    expect(invoicePaymentSummary(inv({ status: "pending", payments: [] }))).toMatchObject({ paid: 0, balance: 100000 });
    expect(invoicePaymentSummary(inv({ status: "cancelled" }))).toBeUndefined();
  });
});

describe("the payment-mode split Analytics shows", () => {
  const sale = (over: Partial<Parameters<typeof modeSplit>[0][number]> = {}) => ({ source: "offline", total: 100000, ...over });
  const split4 = (sales: Parameters<typeof modeSplit>[0]) => [...modeSplit(sales).entries()].map(([k, v]) => `${k} ${v}`);

  it("counts a split counter bill under BOTH modes, not just the bigger one", () => {
    expect(split4([sale({ payment: "split", payments: [{ method: "CASH", amount: 70000 }, { method: "CARD", amount: 30000 }] })]))
      .toEqual(["Cash 70000", "Card 30000", "UPI 0", "Online 0"]);
  });

  it("counts a repair paid cash + card under both, which is what was going wrong", () => {
    const repair = ticketToBill(ticket({ payments: split, advance: 100000 }));
    expect(split4([{ ...repair, source: "service" }])).toEqual(["Cash 60000", "Card 40000", "UPI 0", "Online 0"]);
  });

  it("puts every web sale under Online, whatever Razorpay called it", () => {
    expect(split4([sale({ source: "online", payment: "netbanking", total: 250000 }), sale({ source: "online", payment: "upi", total: 50000 })]))
      .toEqual(["Cash 0", "Card 0", "UPI 0", "Online 300000"]);
  });

  it("counts a single-mode sale in full and leaves out what is still owed", () => {
    expect(split4([sale({ payment: "cash" })])).toEqual(["Cash 100000", "Card 0", "UPI 0", "Online 0"]);
    // Part-paid bill: only the ₹400 that actually came in is in the split.
    expect(split4([sale({ payment: "split", payments: [{ method: "UPI", amount: 40000 }] })]))
      .toEqual(["Cash 0", "Card 0", "UPI 40000", "Online 0"]);
  });

  it("always reports all four modes, in order, even with no sales", () => {
    expect(split4([])).toEqual(["Cash 0", "Card 0", "UPI 0", "Online 0"]);
  });
});

describe("the Invoices ledger shows a repair exactly as the Service screen does", () => {
  const parts = [{ id: "p", name: "Strings", qty: 2, price: 25000, gst: 18 }];

  it("works out the same charge as the service screen", () => {
    for (const t of [ticket(), ticket({ finalCost: 150000 }), ticket({ parts }), ticket({ finalCost: 150000, parts })]) {
      expect(repairGross(t)).toBe(grossTotal(t));
    }
  });

  it("shows the same paid / balance / history on a part-paid repair", () => {
    const t = ticket({ finalCost: 150000, parts, payments: [split[0]], advance: 60000 });
    const s = repairPaymentSummary(t);
    expect(s.paid).toBe(60000);
    expect(s.balance).toBe(grossTotal(t) - 60000);
    expect(s.history).toEqual([expect.objectContaining({ amount: 60000 })]);
  });

  it("never reports more paid than the invoice is for", () => {
    const s = repairPaymentSummary(ticket({ advance: 999999, payments: split }));
    expect(s.paid).toBe(100000);
    expect(s.balance).toBe(0);
  });
});
