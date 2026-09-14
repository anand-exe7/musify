"use client";
import { useEffect, useMemo, useState } from "react";
import type { Bill } from "@/lib/store/pos";
import type { Order, Product } from "@/types";
import { useProducts } from "@/lib/client/catalog";
import { grossTotal, balanceDue, isFixed, type RepairTicket } from "@/lib/store/repair";

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
 * A repair ticket earns revenue once the work is done (ready/completed) or once
 * an invoice has been raised for it — cancelled tickets and zero-charge tickets
 * never count.
 */
export function isServiceRevenue(t: RepairTicket): boolean {
  if (t.status === "cancelled") return false;
  if (grossTotal(t) <= 0) return false;
  return isFixed(t.status) || Boolean(t.invoiceNo);
}

/**
 * Flatten a repair ticket into the unified sale shape as a third channel,
 * "service". The GST-inclusive service charge (`grossTotal`) is the sale value,
 * dated by completion so it lands in the right period on the revenue trend.
 */
export function ticketToBill(t: RepairTicket): UnifiedBill {
  const gross = grossTotal(t);
  return {
    id: t.id,
    createdAt: t.completedAt || t.updatedAt || t.createdAt,
    customerName: t.customerName || "Service customer",
    phone: t.phone || "",
    source: "service",
    branch: t.branch,
    items: [{ name: `Repair — ${t.productName}`, price: gross, qty: 1 }],
    subtotal: gross,
    discount: 0,
    delivery: 0,
    total: gross,
    status: "completed",
    payment: balanceDue(t) <= 0 ? "Paid" : "Balance due",
  };
}

/**
 * Hydrate the admin combined sales feed: /api/orders (web) + /api/pos/bills
 * (in-store) + /api/repair (service), merged newest-first. Order & POS
 * endpoints require admin; repair is best-effort so a repair outage never hides
 * product sales.
 */
export function useAllSales(): { sales: UnifiedBill[]; loading: boolean; error: boolean } {
  const [orders, setOrders] = useState<Order[]>([]);
  const [posBills, setPosBills] = useState<Bill[]>([]);
  const [tickets, setTickets] = useState<RepairTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { products } = useProducts();

  useEffect(() => {
    let alive = true;
    // Reject on a failed response so the caller can tell "offline / server
    // unreachable" apart from a genuinely empty ledger. Repair is best-effort
    // (its own catch), so a repair outage never trips the offline state.
    Promise.all([
      fetch("/api/orders").then((r) => { if (!r.ok) throw new Error("orders"); return r.json(); }),
      fetch("/api/pos/bills").then((r) => { if (!r.ok) throw new Error("bills"); return r.json(); }),
      fetch("/api/repair").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ])
      .then(([o, b, t]) => {
        if (!alive) return;
        setOrders(Array.isArray(o) ? o : []);
        setPosBills(Array.isArray(b) ? b : []);
        setTickets(Array.isArray(t) ? t : []);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const sales = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const webBills: UnifiedBill[] = orders.map((o) => orderToBill(o, byId));
    const serviceBills: UnifiedBill[] = tickets.filter(isServiceRevenue).map(ticketToBill);
    return [...webBills, ...posBills, ...serviceBills].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );
  }, [orders, posBills, tickets, products]);

  return { sales, loading, error };
}
