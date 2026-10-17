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
