/**
 * A product is either taxable (`isGstApplicable` true, `gstRate` a slab) or
 * exempt (`isGstApplicable` false, `gstRate` null). The two columns must never
 * disagree, so every write goes through here.
 */
export const DEFAULT_GST_RATE = 18;

export interface GstColumns {
  gstRate: number | null;
  isGstApplicable: boolean;
}

/**
 * Resolve the pair for a new product. An explicit `isGstApplicable` wins; when
 * it is absent, a `null` rate means exempt and a missing rate means "taxable at
 * the default slab".
 */
export function resolveGstColumns(input: {
  gstRate?: number | null;
  isGstApplicable?: boolean;
}): GstColumns {
  const exempt =
    input.isGstApplicable === false ||
    (input.isGstApplicable === undefined && input.gstRate === null);
  if (exempt) return { gstRate: null, isGstApplicable: false };
  return { gstRate: input.gstRate ?? DEFAULT_GST_RATE, isGstApplicable: true };
}
