"use client";
import { useEffect, useMemo, useState } from "react";
import { ticketPayments, dominantMode } from "@/lib/billing/repairPayments";
import { usePOS, type Bill } from "@/lib/store/pos";
import { useRepair } from "@/lib/store/repair";
import { fetchJson, errMsg } from "@/lib/client/api";
import type { Order } from "@/types";
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
export function orderToBill(order: Order, names?: Record<string, string>): UnifiedBill {
  return {
    id: order.id,
    createdAt: toIso(order.date),
    customerName: order.customerName || "Online customer",
    phone: order.phone || "",
    source: "online",
    branch: order.branch ?? "Branch 1",
    items: order.items.map((it) => ({
      name: names?.[it.productId] ?? it.productId,
      price: it.price,
      qty: it.quantity,
    })),
    subtotal: order.subtotal,
    coupon: order.couponCode ?? undefined,
    discount: order.discount ?? 0,
    delivery: order.shipping,
    total: order.total,
    status: order.status === "cancelled" ? "pending" : "completed",
    fulfilment: order.status,
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
 * What a repair has earned so far (GST-inclusive, paise): the full charge once the work is done or invoiced,
 * otherwise just the advance already received. The Service page uses this so its revenue agrees with Analytics.
 */
export function serviceEarned(t: RepairTicket): number {
  if (t.status === "cancelled") return 0;
  if (isServiceRevenue(t)) return grossTotal(t);
  return Math.max(0, t.advance || 0);
}

/** The day that money lands in revenue: completion for a finished repair, intake for an advance. */
export function serviceEarnedAt(t: RepairTicket): string {
  return isServiceRevenue(t) ? t.completedAt || t.updatedAt : t.createdAt;
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
    // ANA-01: the mode most of the money came in by, so the payment-mode split can bucket it.
    payment: `${dominantMode(ticketPayments(t), t.paymentMode || "CASH")}${balanceDue(t) <= 0 ? "" : " · balance due"}`,
  };
}

/**
 * REP-03: part-payments taken on a repair that isn't billable yet. Each is a payment against the job — not an
 * advance order — and shows as its own row, dated the day it was received and carrying its own mode (cash at intake,
 * GPay later…), so revenue and the payment-mode split are right. Once the repair is ready/completed the ticket's
 * full charge replaces these rows, so nothing is counted twice. Cancelled tickets don't count.
 */
export function ticketPartPaymentBills(t: RepairTicket): UnifiedBill[] {
  if (t.status === "cancelled" || isServiceRevenue(t)) return [];
  return ticketPayments(t)
    .filter((p) => p.amount > 0)
    .map((p, n) => ({
      id: `${t.id}-P${n + 1}`,
      createdAt: p.at,
      customerName: t.customerName || "Service customer",
      phone: t.phone || "",
      source: "service" as const,
      branch: t.branch,
      items: [{ name: `Part payment ${n + 1} — ${t.productName}`, price: p.amount, qty: 1 }],
      subtotal: p.amount,
      discount: 0,
      delivery: 0,
      total: p.amount,
      status: "completed" as const,
      payment: `${p.mode} · part payment`,
    }));
}

/** The sales row a ticket's part payment came from → the ticket id (REP-…-P2 → REP-…). */
export function ticketIdOfSaleRow(id: string): string {
  return id.replace(/-P\d+$/, "");
}

let cachedNames: Record<string, string> | null = null;
let namesPromise: Promise<Record<string, string>> | null = null;
/** Product names. A screen shows the last list straight away and refreshes it in the background (one request at a time). */
function loadNames(): Promise<Record<string, string>> {
  namesPromise ??= fetchJson<Record<string, string>>("/api/pos/product-names")
    .then((n) => (cachedNames = n ?? {}))
    .finally(() => {
      namesPromise = null;
    });
  return namesPromise;
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
/** `reloadKey` re-reads the web orders whenever it changes (the Orders page passes the new-order counter). */
export function useAllSales(reloadKey = 0): { sales: UnifiedBill[]; loading: boolean; error: boolean; errorMessage: string | null } {
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const posBills = usePOS((s) => s.bills);
  const posHydrated = usePOS((s) => s.hydrated);
  const posError = usePOS((s) => s.loadError);
  const tickets = useRepair((s) => s.tickets);
  const repairHydrated = useRepair((s) => s.hydrated);
  const repairError = useRepair((s) => s.loadError);
  // Product names for online-order lines — a small list, not the whole catalogue (whose photos take ~30 s to load).
  const [names, setNames] = useState<Record<string, string>>(() => cachedNames ?? {});
  useEffect(() => {
    let alive = true;
    loadNames().then((n) => alive && setNames(n), () => {});
    return () => {
      alive = false;
    };
  }, []);

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
  }, [reloadKey]);

  const loading = ordersLoading || (!posHydrated && !posError) || (!repairHydrated && !repairError);
  const errorMessage = ordersError ?? posError ?? repairError;

  const sales = useMemo(() => {
    const webBills: UnifiedBill[] = orders.map((o) => orderToBill(o, names));
    const serviceBills: UnifiedBill[] = [
      ...tickets.filter(isServiceRevenue).map(ticketToBill),
      ...tickets.flatMap(ticketPartPaymentBills),
    ];
    return [...webBills, ...posBills, ...serviceBills].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );
  }, [orders, posBills, tickets, names]);

  return { sales, loading, error: errorMessage !== null, errorMessage };
}
