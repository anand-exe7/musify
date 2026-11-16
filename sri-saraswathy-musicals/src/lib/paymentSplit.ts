/**
 * How a sale was paid: a list of (method, amount) lines. One method is a list of one; a split is several.
 * Pure, so the counter screen, the invoice editor and the server all apply the same rules.
 */
export const PAY_METHODS = ["CASH", "CARD", "UPI"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];
export const PAY_LABEL: Record<PayMethod, string> = { CASH: "Cash", CARD: "Card", UPI: "UPI" };

export interface PaymentLine { method: PayMethod; amount: number }

export const isPayMethod = (v: unknown): v is PayMethod => (PAY_METHODS as readonly unknown[]).includes(v);

/** Total of the lines (paise). */
export const paidTotal = (lines: readonly PaymentLine[] | null | undefined): number => (lines ?? []).reduce((n, l) => n + l.amount, 0);

/**
 * Check and tidy the lines: known methods, whole-paise amounts above zero, one line per method (in Cash, Card,
 * UPI order). The total may not pass what is due. Returns the lines, or the first problem as a sentence.
 */
export function cleanPayments(input: unknown, due: number): { ok: true; lines: PaymentLine[] } | { ok: false; error: string } {
  if (input == null) return { ok: true, lines: [] };
  if (!Array.isArray(input)) return { ok: false, error: "Payments must be a list." };
  const byMethod = new Map<PayMethod, number>();
  for (const raw of input as Partial<PaymentLine>[]) {
    if (!raw || !isPayMethod(raw.method)) return { ok: false, error: "Payment method must be Cash, Card or UPI." };
    if (typeof raw.amount !== "number" || !Number.isInteger(raw.amount) || raw.amount < 0) return { ok: false, error: "Payment amounts must be whole paise, not negative." };
    if (raw.amount > 0) byMethod.set(raw.method, (byMethod.get(raw.method) ?? 0) + raw.amount);
  }
  const lines = PAY_METHODS.filter((m) => byMethod.has(m)).map((m) => ({ method: m, amount: byMethod.get(m) as number }));
  if (paidTotal(lines) > due) return { ok: false, error: "The payments add up to more than the total." };
  return { ok: true, lines };
}

/** The short text kept in the old single "payment mode" field: "cash", "upi", "card" or "split"; "" when nothing was paid. */
export function paymentLabel(lines: readonly PaymentLine[]): string {
  if (lines.length === 0) return "";
  return lines.length === 1 ? lines[0].method.toLowerCase() : "split";
}

/** "Cash ₹5,000 · UPI ₹3,000" for the printed invoice. */
export function paymentText(lines: readonly PaymentLine[], money: (paise: number) => string): string {
  return lines.map((l) => `${PAY_LABEL[l.method]} ${money(l.amount)}`).join(" · ");
}

export type PayBox = { mode: PayMethod | "SPLIT"; amounts: Record<PayMethod, number | null> };
export const freshPayBox = (): PayBox => ({ mode: "CASH", amounts: { CASH: null, CARD: null, UPI: null } });

/**
 * Turn what was typed at the counter into payment lines. A single method left blank means "paid in full".
 * Money handed over can exceed the bill only in cash (that is change): the extra is taken off the cash line.
 */
export function resolvePayBox(box: PayBox, due: number): { ok: true; lines: PaymentLine[]; change: number; balance: number } | { ok: false; error: string } {
  const typed = (m: PayMethod) => box.amounts[m] ?? 0;
  let lines: PaymentLine[];
  if (box.mode === "SPLIT") {
    lines = PAY_METHODS.map((m) => ({ method: m, amount: typed(m) }));
  } else {
    const m = box.mode;
    lines = [{ method: m, amount: box.amounts[m] ?? due }];
  }
  const given = paidTotal(lines);
  let change = 0;
  if (given > due) {
    const cash = lines.find((l) => l.method === "CASH")?.amount ?? 0;
    change = given - due;
    if (change > cash) return { ok: false, error: "Card and UPI amounts can't be more than what is left to pay." };
    lines = lines.map((l) => (l.method === "CASH" ? { ...l, amount: l.amount - change } : l));
  }
  const clean = cleanPayments(lines, due);
  if (!clean.ok) return clean;
  return { ok: true, lines: clean.lines, change, balance: due - paidTotal(clean.lines) };
}

/** Invoice status that follows from what has been paid. */
export const statusFor = (due: number, lines: readonly PaymentLine[]): "paid" | "pending" => (paidTotal(lines) >= due ? "paid" : "pending");

/* ─────────────────────────  Reporting  ───────────────────────── */

/**
 * The payment modes every report splits money by: the three counter modes, plus one
 * "Online" bucket for everything collected through the payment gateway. The shop never
 * reports a gateway instrument ("netbanking", "wallet", "razorpay") as a mode of its own.
 */
export const REPORT_MODES = ["Cash", "Card", "UPI", "Online"] as const;
export type ReportMode = (typeof REPORT_MODES)[number];

/**
 * Bucket a free-text payment label into one of the reported modes. Anything paid through the
 * website (razorpay, net banking, a wallet…) reads as "Online"; `null` means the label says
 * nothing useful ("split", "", "credit"), and the caller should look at the payment lines instead.
 */
export function reportMode(label: string | null | undefined): ReportMode | null {
  const s = (label || "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("razorpay") || s.includes("netbank") || s.includes("net bank") || s.includes("wallet") || s.includes("emi") || s.includes("paylater") || s.includes("online") || s.includes("cod"))
    return "Online";
  if (s.includes("cash")) return "Cash";
  if (s.includes("card") || s.includes("debit") || s.includes("credit card")) return "Card";
  if (s.includes("upi") || s.includes("gpay") || s.includes("google pay") || s.includes("phonepe") || s.includes("paytm")) return "UPI";
  return null;
}

/**
 * How a payment mode reads on screen. Raw gateway words never reach the user: an online
 * collection is "Online", a counter split is spelled out from its lines by `paymentText`.
 */
export function modeText(label: string | null | undefined): string {
  const s = (label || "").trim();
  if (!s) return "—";
  if (s.toLowerCase() === "split") return "Split";
  // A repair keeps its modes as one label ("Cash + UPI") — read each part on its own.
  if (s.includes("+")) return s.split("+").map((part) => modeText(part)).join(" + ");
  return reportMode(s) ?? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** "Cash ₹5,000 · UPI ₹3,000" when a sale was split, else just the mode ("Cash", "Online"). */
export function paidViaText(
  lines: readonly { method: string; amount: number }[] | null | undefined,
  mode: string | null | undefined,
  money: (paise: number) => string,
): string {
  const list = (lines ?? []).filter((l) => l.amount > 0);
  if (list.length === 0) return modeText(mode);
  if (list.length === 1) return modeText(list[0].method);
  return list.map((l) => `${modeText(l.method)} ${money(l.amount)}`).join(" · ");
}

/** The shape the mode split needs off a sale — a POS bill, a web order or a repair, all alike. */
export interface ModeSplitSale {
  /** "online" sales are gateway collections, whatever instrument was used. */
  source?: string;
  /** Billed total (paise). */
  total: number;
  /** The sale's single payment label, when it has no split lines. */
  payment?: string | null;
  /** The split: one line per mode, each with what came in that way. */
  payments?: readonly { method: string; amount: number }[] | null;
}

/**
 * ANA-01: how much money came in by each reported mode, over a set of sales.
 *
 * A sale paid two ways counts under BOTH modes, each for its own amount — never under the larger
 * one alone. What is still owed on a part-paid sale is simply not in the split: that money hasn't
 * arrived. Every web sale counts as one "Online" collection. The map always has all four modes, in
 * the order they are shown, so a mode with no money still reads as ₹0 rather than going missing.
 */
export function modeSplit(sales: readonly ModeSplitSale[]): Map<ReportMode, number> {
  const out = new Map<ReportMode, number>(REPORT_MODES.map((k) => [k, 0]));
  const add = (k: ReportMode, amount: number) => out.set(k, (out.get(k) ?? 0) + Math.max(0, amount));
  for (const s of sales) {
    if (s.source === "online") {
      add("Online", s.total);
      continue;
    }
    const lines = (s.payments ?? []).filter((p) => p.amount > 0);
    if (lines.length > 0) {
      for (const p of lines) {
        const k = reportMode(p.method);
        if (k) add(k, p.amount);
      }
      continue;
    }
    const k = reportMode(s.payment);
    if (k) add(k, s.total);
  }
  return out;
}

/**
 * Just the modes a sale was paid by, with no amounts: "Cash", "Cash + Card", "Cash + Card + UPI".
 * For a narrow column in a list, where the figures would only be cut off — the full split with its
 * amounts is `paidViaText`.
 */
export function paidModesText(
  lines: readonly { method: string; amount: number }[] | null | undefined,
  mode: string | null | undefined,
): string {
  const list = (lines ?? []).filter((l) => l.amount > 0);
  if (list.length === 0) return modeText(mode);
  return [...new Set(list.map((l) => modeText(l.method)))].join(" + ");
}
