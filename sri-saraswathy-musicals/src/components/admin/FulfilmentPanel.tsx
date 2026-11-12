"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Truck, CreditCard, Scale, Clock, MapPin, ExternalLink, AlertTriangle } from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { daysUntil, formatWeight } from "@/lib/delivery/types";
import { branchLabel } from "@/lib/stock";
import type { Invoice, Order } from "@/types";

function fmtDay(d?: string | null) {
  if (!d) return "—";
  const date = new Date(`${d}T00:00:00`);
  return isNaN(+date) ? d : date.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
}

/**
 * How a web sale ships, shown on the invoice itself.
 *
 * Once a few orders stack up, the one that has to leave today is invisible in a list — so the
 * deadline, the method and the courier details live on the invoice the shop opens, not only in
 * the orders screen. Nothing here prints: it is working information, not part of the tax invoice.
 */
export function FulfilmentPanel({ invoice }: { invoice: Invoice }) {
  const [order, setOrder] = useState<Order | null>(null);
  const orderId = invoice.source === "web" ? invoice.refId : undefined;

  useEffect(() => {
    if (!orderId) return;
    const ctl = new AbortController();
    fetch(`/api/orders/${encodeURIComponent(orderId)}`, { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Order>) : Promise.reject(new Error("order"))))
      .then(setOrder)
      .catch(() => {
        /* the invoice's own fields still show below */
      });
    return () => ctl.abort();
  }, [orderId]);

  const method = order?.deliveryMethod || invoice.deliveryMethod || "";
  const eta = order?.deliveryEta || invoice.deliveryEta || "";
  const dispatchBy = order?.dispatchBy ?? invoice.dispatchBy ?? null;
  const shipped = Boolean(order?.shippedAt);
  const days = daysUntil(dispatchBy);
  const late = !shipped && days !== null && days < 0;
  const soon = !shipped && days !== null && days >= 0 && days <= 2;

  // Nothing to say for a counter sale with no delivery at all.
  if (!method && !order && !invoice.delivery) return null;

  return (
    <section className="mx-auto mb-5 max-w-3xl overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50 print:hidden">
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 px-5 py-3",
          late ? "bg-danger/10" : soon ? "bg-warning/15" : "bg-ivory-100/70",
        )}
      >
        <Truck className={cn("h-4 w-4", late ? "text-danger" : soon ? "text-[#8a6a1f]" : "text-ink-500")} />
        <p className="text-sm font-bold text-ink-900">Fulfilment</p>
        {shipped ? (
          <span className="rounded-full bg-success/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-success">
            Dispatched {order?.shippedAt ? fmtDay(order.shippedAt.slice(0, 10)) : ""}
          </span>
        ) : days !== null ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
              late ? "bg-danger/20 text-danger" : soon ? "bg-warning/25 text-[#8a6a1f]" : "bg-ink-900/5 text-ink-600",
            )}
          >
            {late && <AlertTriangle className="h-3 w-3" />}
            {late
              ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} late`
              : days === 0
                ? "Dispatch today"
                : days === 1
                  ? "Dispatch tomorrow"
                  : `Dispatch within ${days} days`}
          </span>
        ) : null}
        {orderId && (
          <Link
            href={`/admin/orders/${encodeURIComponent(orderId)}`}
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-gold-700 hover:underline"
          >
            Open the order <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:grid-cols-3 lg:grid-cols-4">
        <Cell icon={<CreditCard className="h-3.5 w-3.5" />} label="Paid by">
          <span className="uppercase">{invoice.paymentMode || "—"}</span>
          {invoice.payments && invoice.payments.length > 0 && (
            <span className="block text-[11px] font-normal text-ink-500">
              {invoice.payments.map((p) => `${p.method} ${formatINR(p.amount)}`).join(" · ")}
            </span>
          )}
        </Cell>
        <Cell icon={<Truck className="h-3.5 w-3.5" />} label="Delivery">
          {method || "—"}
          {eta && <span className="block text-[11px] font-normal text-ink-500">{eta}</span>}
        </Cell>
        <Cell icon={<Clock className="h-3.5 w-3.5" />} label="Dispatch by">
          {fmtDay(dispatchBy)}
        </Cell>
        <Cell icon={<Scale className="h-3.5 w-3.5" />} label="Parcel weight">
          {order?.weightG ? formatWeight(order.weightG) : "—"}
          <span className="block text-[11px] font-normal text-ink-500">
            Charged {formatINR(invoice.delivery ?? order?.shipping ?? 0)}
          </span>
        </Cell>
        {order && (
          <>
            <Cell icon={<MapPin className="h-3.5 w-3.5" />} label="Ships to">
              {order.shipState || "—"}
              <span className="block text-[11px] font-normal text-ink-500">from {branchLabel(order.branch ?? "")}</span>
            </Cell>
            <Cell icon={<Truck className="h-3.5 w-3.5" />} label="Courier">
              {order.courier || <span className="text-ink-400">Not booked yet</span>}
              {order.trackingNo && <span className="block text-[11px] font-normal text-ink-500">{order.trackingNo}</span>}
            </Cell>
            <Cell icon={<Clock className="h-3.5 w-3.5" />} label="Order status">
              <span className="capitalize">{order.status}</span>
              <span className="block text-[11px] font-normal text-ink-500">Placed {fmtDay(order.date)}</span>
            </Cell>
          </>
        )}
      </dl>
    </section>
  );
}

function Cell({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">
        <span className="text-ink-400">{icon}</span>
        {label}
      </dt>
      <dd className="truncate text-sm font-semibold text-ink-900">{children}</dd>
    </div>
  );
}
