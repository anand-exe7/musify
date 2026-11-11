/**
 * Repair / service payments (REP-01 … REP-04).
 *
 * A ticket keeps a history of the payments received against it. Each one is a **part-payment against the job**
 * (it gets a payment receipt) — not an advance order, and not a tax invoice. The GST tax invoice is issued only once
 * the ticket is fully paid. `advance` on the ticket is kept equal to the sum of the payments, so every older screen
 * that reads "amount paid" from it stays correct.
 *
 * Pure functions — shared by the browser (ticket page) and the server (API validation).
 */
export const REPAIR_PAY_MODES = ["CASH", "UPI", "CARD", "BANK", "OTHER"] as const;
export type RepairPayMode = (typeof REPAIR_PAY_MODES)[number];

export const PAY_MODE_LABEL: Record<string, string> = {
  CASH: "Cash",
  UPI: "GPay / UPI",
  CARD: "Card",
  BANK: "Bank transfer",
  OTHER: "Other",
};

export interface RepairPayment {
  id: string;
  /** ISO time the money was received. */
  at: string;
  /** Paise, > 0. */
  amount: number;
  mode: string;
  note?: string;
  /** Printed on the payment receipt, e.g. REP-2026-AB12C/R2. */
  receiptNo?: string;
}

/** The fields of a ticket these helpers need (keeps this module free of the client store). */
export interface PayableTicket {
  id: string;
  createdAt: string;
  advance: number;
  paymentMode?: string;
  payments?: RepairPayment[];
}

export function isPayMode(m: unknown): m is RepairPayMode {
  return typeof m === "string" && (REPAIR_PAY_MODES as readonly string[]).includes(m);
}

/**
 * The ticket's payments. Tickets raised before payment history existed only have an `advance` figure; that shows
 * as one payment taken at intake, so the history always adds up to what was paid.
 */
export function ticketPayments(t: PayableTicket): RepairPayment[] {
  const list = t.payments ?? [];
  if (list.length > 0) return list;
  if ((t.advance || 0) > 0) {
    return [{ id: `${t.id}-intake`, at: t.createdAt, amount: t.advance, mode: isPayMode(t.paymentMode) ? t.paymentMode : "CASH", note: "Paid at intake", receiptNo: `${t.id}/R1` }];
  }
  return [];
}

export function paymentsTotal(list: Pick<RepairPayment, "amount">[]): number {
  return list.reduce((n, p) => n + (p.amount || 0), 0);
}

/** The mode most of the money came in by (for payment-mode analytics). */
export function dominantMode(list: Pick<RepairPayment, "amount" | "mode">[], fallback = "CASH"): string {
  const by = new Map<string, number>();
  for (const p of list) by.set(p.mode, (by.get(p.mode) ?? 0) + p.amount);
  let best = fallback;
  let max = -1;
  for (const [m, v] of by) if (v > max) [best, max] = [m, v];
  return best;
}

/** Add a payment to a ticket: returns the new history and the matching `advance` (total paid). */
export function withPayment(t: PayableTicket, p: { amount: number; mode: string; note?: string; at?: string }): { payments: RepairPayment[]; advance: number } {
  const prev = ticketPayments(t);
  const payment: RepairPayment = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
    at: p.at ?? new Date().toISOString(),
    amount: Math.round(p.amount),
    mode: isPayMode(p.mode) ? p.mode : "OTHER",
    note: p.note?.trim() || undefined,
    receiptNo: `${t.id}/R${prev.length + 1}`,
  };
  const payments = [...prev, payment];
  return { payments, advance: paymentsTotal(payments) };
}

/** Remove a payment (entered by mistake). Receipt numbers already handed out are kept as they were. */
export function withoutPayment(t: PayableTicket, paymentId: string): { payments: RepairPayment[]; advance: number } {
  const payments = ticketPayments(t).filter((p) => p.id !== paymentId);
  return { payments, advance: paymentsTotal(payments) };
}

/** Server-side clean-up of a payments array sent by the browser. Throws on anything malformed. */
export function cleanPayments(input: unknown): RepairPayment[] {
  if (!Array.isArray(input)) throw new Error("Payments must be a list");
  return input.map((raw, i) => {
    const p = raw as Partial<RepairPayment>;
    const amount = Math.round(Number(p.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Payment ${i + 1}: amount must be more than zero`);
    if (!isPayMode(p.mode)) throw new Error(`Payment ${i + 1}: choose a payment mode`);
    const at = typeof p.at === "string" && !isNaN(+new Date(p.at)) ? p.at : new Date().toISOString();
    return {
      id: typeof p.id === "string" && p.id ? p.id.slice(0, 64) : crypto.randomUUID(),
      at,
      amount,
      mode: p.mode,
      note: typeof p.note === "string" && p.note.trim() ? p.note.trim().slice(0, 200) : undefined,
      receiptNo: typeof p.receiptNo === "string" ? p.receiptNo.slice(0, 64) : undefined,
    };
  });
}
