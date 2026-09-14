import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getOrder } from "@/lib/db/queries/orders";
import { getBill } from "@/lib/db/queries/pos";
import { getAllProducts } from "@/lib/db/queries/products";
import { BUSINESS } from "@/lib/data/business";
import { OrderInvoiceView } from "./InvoiceView";
import type { Order } from "@/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order ${id.toUpperCase()} · ${BUSINESS.name}`, robots: { index: false } };
}

/**
 * Customer-facing order invoice. The `id` may be either a storefront order id
 * or a POS bill id — both surface here as a simple order-level bill (items,
 * subtotal, discount, delivery, total). This is NOT the GST tax invoice: that
 * carries the sequential invoice number and CGST/SGST/IGST split, and it stays
 * behind /admin/invoices/[id] (admin only).
 */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const order = await getOrder(id);
  if (order) {
    const products = await getAllProducts();
    const byId = new Map(products.map((p) => [p.id, p]));
    const lines = order.items.map((it) => {
      const p = byId.get(it.productId);
      return {
        name: p ? p.name : it.productId,
        brand: p?.brand ?? "",
        qty: it.quantity,
        rate: it.price,
        amount: it.price * it.quantity,
      };
    });
    return <OrderInvoiceView order={order} lines={lines} discount={0} />;
  }

  const bill = await getBill(id);
  if (bill) {
    const orderShape: Order = {
      id: bill.id,
      date: bill.createdAt,
      status: bill.status === "pending" ? "processing" : "delivered",
      customerName: bill.customerName || "Walk-in",
      phone: bill.phone,
      paymentMethod: bill.payment,
      branch: bill.branch,
      items: bill.items.map((i) => ({ productId: i.name, quantity: i.qty, price: i.price })),
      subtotal: bill.subtotal,
      gst: 0,
      shipping: bill.delivery,
      total: bill.total,
      address: "",
    };
    const lines = bill.items.map((i) => ({
      name: i.name,
      brand: "",
      qty: i.qty,
      rate: i.price,
      amount: i.price * i.qty,
    }));
    const taxBreakup =
      bill.gstEnabled && (bill.gst ?? 0) > 0
        ? { taxable: bill.taxable ?? 0, cgst: bill.cgst ?? 0, sgst: bill.sgst ?? 0, gst: bill.gst ?? 0 }
        : null;
    return <OrderInvoiceView order={orderShape} lines={lines} discount={bill.discount} coupon={bill.coupon} taxBreakup={taxBreakup} />;
  }

  notFound();
}
