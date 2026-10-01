/**
 * Place of supply: a sale to the seller's own state is intra-state (CGST+SGST);
 * anywhere else is inter-state (IGST). A missing buyer state is treated as
 * intra-state (counter / unspecified sales). Pure, so the ledger, pricing and
 * the storefront all agree.
 */
export function isIntraSupply(buyerState: string | null | undefined, homeState: string): boolean {
  const buyer = (buyerState ?? "").trim().toLowerCase();
  return !buyer || buyer === homeState.trim().toLowerCase();
}
