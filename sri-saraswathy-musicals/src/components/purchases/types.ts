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
  paymentMode: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  /** Part-payments recorded after the purchase (on top of amountPaid). */
  paymentsTotal: number;
  lines: { id: string; productName: string; variant: string; quantity: number; unitCost: number; gst: number; branch: string }[];
}

export const PAY_MODES = ["", "CASH", "UPI", "CARD", "BANK", "CREDIT", "OTHER"] as const;

/** Branches a purchase put stock into (payments must come from one of them). */
export function receivingBranches(p: Pick<PurchaseRow, "lines">): string[] {
  return [...new Set(p.lines.map((l) => l.branch))];
}
