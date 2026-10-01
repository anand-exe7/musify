"use client";
import { useEffect, useMemo, useState } from "react";
import { usePOS, type Bill } from "@/lib/store/pos";
import { useRepair } from "@/lib/store/repair";
import { fetchJson, errMsg } from "@/lib/client/api";
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
    coupon: order.couponCode ?? undefined,
    discount: order.discount ?? 0,
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
 * The admin combined sales feed: web orders + in-store POS bills + repair
 * tickets, merged newest-first.
 *
 * POS bills and repair tickets are READ FROM THEIR STORES (`usePOS`,
 * `useRepair`) — the same arrays the pages mutate — so deleting a bill removes
 * its row immediately and nothing is fetched twice. Web orders have no store, so
 * they are fetched here. A failure in any of the three is reported through
 * `error` / `errorMessage` rather than looking like an empty ledger.
 */
export function useAllSales(): { sales: UnifiedBill[]; loading: boolean; error: boolean; errorMessage: string | null } {
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const posBills = usePOS((s) => s.bills);
  const posHydrated = usePOS((s) => s.hydrated);
  const posError = usePOS((s) => s.loadError);
  const tickets = useRepair((s) => s.tickets);
  const repairHydrated = useRepair((s) => s.hydrated);
  const repairError = useRepair((s) => s.loadError);
  const { products } = useProducts();

  useEffect(() => {
    let alive = true;
    fetchJson<Order[]>("/api/orders")
      .then((o) => {
        if (!alive) return;
        setOrders(Array.isArray(o) ? o : []);
        setOrdersError(null);
      })
      .catch((e: unknown) => {
        if (alive) setOrdersError(`Couldn't load online orders (${errMsg(e)})`);
      })
      .finally(() => {
        if (alive) setOrdersLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const loading = ordersLoading || (!posHydrated && !posError) || (!repairHydrated && !repairError);
  const errorMessage = ordersError ?? posError ?? repairError;

  const sales = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const webBills: UnifiedBill[] = orders.map((o) => orderToBill(o, byId));
    const serviceBills: UnifiedBill[] = tickets.filter(isServiceRevenue).map(ticketToBill);
    return [...webBills, ...posBills, ...serviceBills].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );
  }, [orders, posBills, tickets, products]);

  return { sales, loading, error: errorMessage !== null, errorMessage };
}
