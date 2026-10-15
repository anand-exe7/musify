/**
 * The lines and tax of a service invoice: the service charge, then each product the
 * customer bought during the service. Everything is GST-inclusive (like the rest of
 * the shop), so each line's tax is extracted from what was charged and
 * subtotal + CGST + SGST always equals the total. Pure (all amounts in paise).
 */
export interface ServicePart {
  id: string;
  productId?: string;
  variantIndex?: number;
  name: string;
  hsn?: string;
  qty: number;
  /** Price per unit, GST included. */
  price: number;
  /** GST rate (%) on this part. */
  gst: number;
}

export interface ServiceInvoiceLine { name: string; hsn: string; qty: number; rate: number; gst: number; amount: number }

export interface ServiceInvoiceBreakup {
  items: ServiceInvoiceLine[];
  subtotal: number;
  cgst: number;
  sgst: number;
  total: number;
}

export function partsTotal(parts: ServicePart[] | undefined): number {
  return (parts ?? []).reduce((n, p) => n + Math.max(0, p.qty) * Math.max(0, p.price), 0);
}

const taxIn = (gross: number, rate: number) => (rate > 0 ? gross - Math.round(gross / (1 + rate / 100)) : 0);

/**
 * `serviceCharge` is the GST-inclusive charge for the work itself (0 when only
 * parts were sold); `rate` is the service's GST rate.
 */
export function serviceInvoiceBreakup(productName: string, serviceCharge: number, rate: number, parts: ServicePart[] | undefined): ServiceInvoiceBreakup {
  const items: ServiceInvoiceLine[] = [];
  let total = 0;
  let tax = 0;
  if (serviceCharge > 0) {
    items.push({ name: `Repair & service — ${productName}`, hsn: "9954", qty: 1, rate: serviceCharge, gst: rate, amount: serviceCharge });
    total += serviceCharge;
    tax += taxIn(serviceCharge, rate);
  }
  for (const p of parts ?? []) {
    const gross = Math.max(0, p.qty) * Math.max(0, p.price);
    if (gross <= 0) continue;
    items.push({ name: p.name, hsn: p.hsn || "-", qty: p.qty, rate: p.price, gst: p.gst || 0, amount: gross });
    total += gross;
    tax += taxIn(gross, p.gst || 0);
  }
  const cgst = Math.round(tax / 2);
  return { items, subtotal: total - tax, cgst, sgst: tax - cgst, total };
}
