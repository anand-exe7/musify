"use client";
import { useEffect, useMemo, useState } from "react";
import type { Bill } from "@/lib/store/pos";
import type { Order, Product } from "@/types";
import { useProducts } from "@/lib/client/catalog";

/**
 * A unified sale row that flattens both storefront web orders and POS bills into
 * the same shape the admin Orders & Analytics pages already understand. Both
 * ledgers share the same date-driven filters, item lists, and totals — this
 * lets a single UI show the whole business, POS + online, in one place.
 */
export type UnifiedBill = Bill;

function toIso(dateStr: string): string {
  // Order rows store dates as YYYY-MM-DD; convert to a full ISO instant so the
  // same "date-time" filters used by POS bills work without a special case.
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return `${dateStr}T00:00:00.000Z`;
  return dateStr;
}

/** Convert a storefront order into the unified sale shape. */
export function orderToBill(order: Order, productById?: Map<string, Product>): UnifiedBill {
  return {
    id: order.id,
    createdAt: toIso(order.date),
    customerName: order.customerName || "Online customer",
    phone: order.phone || "",
    source: "online",
    branch: order.branch ?? "Branch 1",
    items: order.items.map((it) => ({
      name: productById?.get(it.productId)?.name ?? it.productId,
      price: it.price,
      qty: it.quantity,
    })),
    subtotal: order.subtotal,
    discount: 0,
    delivery: order.shipping,
    total: order.total,
    status: order.status === "cancelled" ? "pending" : "completed",
    payment: order.paymentMethod || "razorpay",
  };
}

/**
 * Hydrate the admin combined sales feed: /api/orders (web) + /api/pos/bills
 * (in-store), merged newest-first. Both endpoints already require admin.
 */
export function useAllSales(): { sales: UnifiedBill[]; loading: boolean } {
  const [orders, setOrders] = useState<Order[]>([]);
  const [posBills, setPosBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const { products } = useProducts();

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/orders").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/pos/bills").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([o, b]) => {
      if (!alive) return;
      setOrders(Array.isArray(o) ? o : []);
      setPosBills(Array.isArray(b) ? b : []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const sales = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const webBills: UnifiedBill[] = orders.map((o) => orderToBill(o, byId));
    return [...webBills, ...posBills].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );
  }, [orders, posBills, products]);

  return { sales, loading };
}
