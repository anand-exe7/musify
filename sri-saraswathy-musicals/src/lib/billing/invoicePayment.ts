/**
 * What has been paid against an invoice, in the one shape every invoice sheet and printed
 * document takes: `{ paid, balance, history }`.
 *
 * A repair's history comes from the ticket's own payment receipts (cash at intake, GPay on
 * pickup…) — the same lines the Service → invoice screen shows. A counter or online sale has
 * its split saved on the invoice row itself. Pure and server-safe: no store, no React.
 */
import type { Invoice } from "@/types";
import { paymentLines, ticketPayments, type PayableTicket } from "@/lib/billing/repairPayments";
import { partsTotal, type ServicePart } from "@/lib/billing/serviceInvoice";
import { modeText } from "@/lib/paymentSplit";

export interface PaymentSummary {
  /** Paise received so far (never more than the invoice total). */
  paid: number;
  /** Paise still owed. */
  balance: number;
  /** One line per payment: "12 Nov 2026 · Cash · REP-…/R1". */
  history?: { label: string; amount: number }[];
}

/** The ticket fields these helpers read — keeps the module free of the client store. */
export type PayableRepair = PayableTicket & {
  finalCost: number;
  estimate: number;
  parts?: ServicePart[];
};

/** Everything a repair customer owes (GST-inclusive): the service charge plus any parts sold with it. */
export function repairGross(t: PayableRepair): number {
  return (t.finalCost > 0 ? t.finalCost : t.estimate) + partsTotal(t.parts);
}

/** Payment summary of a repair ticket — what the service invoice screen shows. */
export function repairPaymentSummary(t: PayableRepair): PaymentSummary {
  const total = repairGross(t);
  const paid = Math.min(total, t.advance || 0);
  return { paid, balance: Math.max(0, total - paid), history: paymentLines(ticketPayments(t)) };
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Payment summary read off an invoice row: its split lines when it has them (a counter sale paid
 * part cash, part card), otherwise one line for the whole amount once the invoice is marked paid.
 * A cancelled invoice has nothing to show.
 */
export function invoicePaymentSummary(inv: Invoice): PaymentSummary | undefined {
  if (inv.status === "cancelled") return undefined;
  const day = fmtDay(inv.date);
  const lines = (inv.payments ?? []).filter((p) => p.amount > 0);
  if (lines.length > 0) {
    const paid = Math.min(inv.total, lines.reduce((n, p) => n + p.amount, 0));
    return {
      paid,
      balance: Math.max(0, inv.total - paid),
      history: lines.map((p) => ({ label: `${day} · ${modeText(p.method)}`, amount: p.amount })),
    };
  }
  if (inv.status === "paid") {
    return { paid: inv.total, balance: 0, history: [{ label: `${day} · ${modeText(inv.paymentMode)}`, amount: inv.total }] };
  }
  return { paid: 0, balance: inv.total, history: [] };
}
