/** A purchase as returned by `/api/purchases` (header + its lines + later part-payments). */
export interface PurchaseRow {
  id: string;
  vendorId: string;
  invoiceNo: string;
  purchaseDate: string;
  subtotal: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
  amountPaid: number;
  /** What each branch paid of `amountPaid` (absent on older purchases). */
  paidAllocations?: Record<string, number>;
  /** Set on an opening-balance bill: the branch that owes it (it has no items). */
  openingBranch?: string | null;
  paymentMode: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  /** Part-payments recorded after the purchase (on top of amountPaid). */
  paymentsTotal: number;
  /** What each branch still owes on this bill (branches that received stock, even at 0). */
  branchOwed?: Record<string, number>;
  /** What each branch has paid since the purchase (part-payments). */
  paidLater?: Record<string, number>;
  lines: { id: string; productName: string; variant: string; quantity: number; unitCost: number; gst: number; branch: string }[];
}

export const PAY_MODES = ["", "CASH", "UPI", "CARD", "BANK", "CREDIT", "OTHER"] as const;

/** Branches a purchase put stock into (payments must come from one of them). */
export function receivingBranches(p: Pick<PurchaseRow, "lines" | "openingBranch">): string[] {
  if (p.openingBranch) return [p.openingBranch];
  return [...new Set(p.lines.map((l) => l.branch))];
}
