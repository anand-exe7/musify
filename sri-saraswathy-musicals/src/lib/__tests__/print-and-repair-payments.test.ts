/**
 * BIL-01 / QUO-02 GST split-up, QUO-03 GSTIN format, and REP-01…REP-04 repair payment history.
 */
import { describe, it, expect } from "vitest";
import { gstSummary, taxLabel } from "@/lib/print/doc";
import { isValidGstin } from "@/lib/gst/gstin";
import { ticketPayments, withPayment, withoutPayment, cleanPayments, dominantMode, paymentsTotal } from "@/lib/billing/repairPayments";

describe("GST split-up", () => {
  it("one rate: labels carry the half rate and CGST + SGST add up to the tax", () => {
    // ₹1,180 incl. 18% → ₹180 tax → ₹90 + ₹90
    const s = gstSummary([{ gst: 18, amount: 118000 }], 9000, 9000, 0);
    expect(s.singleRate).toBe(18);
    expect(s.totalTax).toBe(18000);
    expect(s.rows).toEqual([{ rate: 18, taxable: 100000, cgst: 9000, sgst: 9000, igst: 0 }]);
    expect(taxLabel("CGST", s)).toBe("CGST @ 9%");
    expect(taxLabel("SGST", s)).toBe("SGST @ 9%");
  });

  it("mixed rates: one row per rate, columns sum exactly to the document's own CGST / SGST", () => {
    const lines = [{ gst: 18, amount: 118000 }, { gst: 12, amount: 11200 }, { gst: 0, amount: 5000 }];
    const s = gstSummary(lines, 9601, 9599, 0);
    expect(s.singleRate).toBeNull();
    expect(s.rows.map((r) => r.rate)).toEqual([12, 18]);
    expect(s.rows.reduce((n, r) => n + r.cgst, 0)).toBe(9601);
    expect(s.rows.reduce((n, r) => n + r.sgst, 0)).toBe(9599);
    expect(taxLabel("CGST", s)).toBe("CGST");
  });

  it("inter-state: everything goes to IGST", () => {
    const s = gstSummary([{ gst: 18, amount: 118000 }], 0, 0, 18000);
    expect(s.interState).toBe(true);
    expect(s.rows[0]).toMatchObject({ igst: 18000, cgst: 0, sgst: 0 });
    expect(taxLabel("IGST", s)).toBe("IGST @ 18%");
  });

  it("bill-level discount: rows are scaled to the tax actually charged", () => {
    const s = gstSummary([{ gst: 18, amount: 118000 }], 8100, 8100, 0); // 10% off
    expect(s.rows[0].cgst + s.rows[0].sgst).toBe(16200);
  });
});

describe("GSTIN format", () => {
  it("accepts a valid 15-character GSTIN and rejects malformed ones", () => {
    expect(isValidGstin("33BDVPP9993A1ZV")).toBe(true);
    expect(isValidGstin(" 33bdvpp9993a1zv ")).toBe(true);
    expect(isValidGstin("33BDVPP9993A1Z")).toBe(false);
    expect(isValidGstin("3XBDVPP9993A1ZV")).toBe(false);
    expect(isValidGstin("33BDVPP9993A1XV")).toBe(false);
  });
});

describe("repair payments", () => {
  const base = { id: "REP-1", createdAt: "2026-11-01T10:00:00.000Z", advance: 0, payments: [] as never[] };

  it("a ticket from before payment history shows its advance as one intake payment", () => {
    const list = ticketPayments({ ...base, advance: 50000, paymentMode: "UPI" });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ amount: 50000, mode: "UPI", receiptNo: "REP-1/R1" });
  });

  it("each part-payment is added to the history and the paid total follows it", () => {
    const one = withPayment(base, { amount: 30000, mode: "CASH" });
    expect(one.advance).toBe(30000);
    const two = withPayment({ ...base, ...one }, { amount: 20000, mode: "UPI", note: "balance" });
    expect(two.payments.map((p) => p.receiptNo)).toEqual(["REP-1/R1", "REP-1/R2"]);
    expect(two.advance).toBe(50000);
    expect(paymentsTotal(two.payments)).toBe(50000);
    const back = withoutPayment({ ...base, ...two }, two.payments[0].id);
    expect(back.advance).toBe(20000);
  });

  it("dominant mode is where most of the money came from", () => {
    expect(dominantMode([{ amount: 100, mode: "CASH" }, { amount: 300, mode: "UPI" }, { amount: 100, mode: "CASH" }])).toBe("UPI");
  });

  it("server clean-up rejects bad amounts and unknown modes", () => {
    expect(() => cleanPayments([{ amount: 0, mode: "CASH" }])).toThrow(/more than zero/);
    expect(() => cleanPayments([{ amount: 100, mode: "BITCOIN" }])).toThrow(/payment mode/);
    expect(cleanPayments([{ amount: 100.4, mode: "CARD", note: "  " }])[0]).toMatchObject({ amount: 100, mode: "CARD", note: undefined });
  });
});

import { waUrl, E } from "@/lib/whatsapp";
import { docWhatsAppText } from "@/lib/print/doc";

describe("WhatsApp links", () => {
  it("use api.whatsapp.com/send/ with the 91 prefix, encoded once", () => {
    const url = waUrl("98765 43210", `Hi ${E.wave} 100% done`);
    expect(url.startsWith("https://api.whatsapp.com/send/?phone=919876543210&text=")).toBe(true);
    expect(url).toContain("100%25");
    expect(url).not.toContain("%2525");
    expect(decodeURIComponent(url.split("text=")[1])).toBe(`Hi ${E.wave} 100% done`);
    expect(waUrl("", "x")).toBe("https://api.whatsapp.com/send/?text=x");
  });

  it("messages carry no U+FE0F variation selectors", () => {
    const text = docWhatsAppText(
      { kind: "invoice", title: "Tax Invoice", number: "SSM/1", date: "2026-11-11", branch: "Branch 1", customer: { name: "A" },
        lines: [{ name: "Tabla", qty: 1, rate: 118000, gst: 18, amount: 118000 }], subtotal: 100000, cgst: 9000, sgst: 9000, igst: 0, total: 118000,
        discount: 1000, delivery: 500, paid: 118000, balance: 0, notice: "note" },
      "Shop",
      "https://x",
    );
    expect(text).not.toMatch(/️/);
    expect(text).toContain(E.notes);
  });
});
