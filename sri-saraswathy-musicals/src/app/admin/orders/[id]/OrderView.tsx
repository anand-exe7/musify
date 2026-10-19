"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, Check, ExternalLink, Mail, MapPin, Package, Phone, Truck, Undo2 } from "lucide-react";
import type { Order } from "@/types";
import { cn, formatINR } from "@/lib/utils";
import { branchLabel } from "@/lib/stock";

type Stage = Order["status"];
const STEPS: { key: Exclude<Stage, "cancelled">; label: string }[] = [
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];
const COURIERS = ["Delhivery", "DTDC", "India Post", "Blue Dart", "Professional Couriers", "Our own delivery"];

function fmtDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(+d) ? iso : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** An online order: the stage it is at, and the buttons that move it on. */
export function OrderView({ order: initial, names, invoice }: {
  order: Order;
  names: Record<string, string>;
  invoice: { id: string; number: string; reference: string } | null;
}) {
  const [order, setOrder] = useState<Order>(initial);
  const [courier, setCourier] = useState(initial.courier ?? "");
  const [trackingNo, setTrackingNo] = useState(initial.trackingNo ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const cancelled = order.status === "cancelled";
  const stepIndex = STEPS.findIndex((s) => s.key === order.status);
  const detailsChanged = courier.trim() !== (order.courier ?? "") || trackingNo.trim() !== (order.trackingNo ?? "");

  async function send(body: { status?: Stage; courier?: string; trackingNo?: string }, label: string, done: string) {
    setBusy(label);
    setMessage(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(order.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage({ ok: false, text: typeof data?.error === "string" ? data.error : `That didn't work (${res.status}).` });
        return;
      }
      const next = data as Order;
      setOrder(next);
      setCourier(next.courier ?? "");
      setTrackingNo(next.trackingNo ?? "");
      setMessage({ ok: true, text: done });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Network error" });
    } finally {
      setBusy(null);
    }
  }

  const move = (status: Stage, done: string) => send({ status, courier: courier.trim(), trackingNo: trackingNo.trim() }, status, done);
  const cancel = () => {
    if (!confirm(`Cancel order ${order.id}?\n\nIts invoice is cancelled and the stock goes back to ${branchLabel(order.branch)}. Any refund to the customer must be made separately in Razorpay.`)) return;
    void send({ status: "cancelled" }, "cancelled", "Order cancelled. The stock has been put back.");
  };

  const input = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20 disabled:opacity-60";
  const lbl = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";
  const card = "rounded-2xl border border-ink-100 bg-ivory-50 p-5";

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5 md:p-8">
      <Link href="/admin/orders" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-gold-600">
        <ArrowLeft className="h-4 w-4" /> Back to orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Order {order.id}</h1>
          <p className="mt-1 text-sm text-ink-500">Placed {order.date} · {branchLabel(order.branch)} · online</p>
        </div>
        {invoice && (
          <Link href={`/admin/invoices/${invoice.id}`} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ivory-100">
            Invoice {invoice.reference || invoice.number} <ExternalLink className="h-3.5 w-3.5 text-ink-400" />
          </Link>
        )}
      </div>

      {/* Where it is */}
      <section className={card}>
        {cancelled ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-danger"><Ban className="h-4 w-4" /> This order was cancelled. Its invoice is cancelled and the stock went back.</p>
        ) : (
          <ol className="flex items-center">
            {STEPS.map((s, i) => {
              const done = i <= stepIndex;
              return (
                <li key={s.key} className="flex flex-1 items-center last:flex-none">
                  <div className="flex items-center gap-2">
                    <span className={cn("grid h-8 w-8 place-items-center rounded-full text-xs font-bold", done ? "bg-ink-900 text-ivory-50" : "bg-ink-100 text-ink-400")}>
                      {done ? <Check className="h-4 w-4" /> : i + 1}
                    </span>
                    <span className={cn("text-sm font-semibold", done ? "text-ink-900" : "text-ink-400")}>{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && <span className={cn("mx-3 h-0.5 flex-1 rounded", i < stepIndex ? "bg-ink-900" : "bg-ink-100")} />}
                </li>
              );
            })}
          </ol>
        )}
        {!cancelled && (order.shippedAt || order.deliveredAt) && (
          <p className="mt-3 text-xs text-ink-500">
            {order.shippedAt && <>Shipped {fmtDateTime(order.shippedAt)}</>}
            {order.deliveredAt && <> · Delivered {fmtDateTime(order.deliveredAt)}</>}
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {/* Items */}
          <section className={card}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900"><Package className="h-4 w-4 text-gold-600" /> What was ordered</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                    <th className="py-2">Item</th><th className="text-center">Qty</th><th className="text-right">Price</th><th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  {order.items.map((it, i) => (
                    <tr key={i}>
                      <td className="py-2.5">
                        <p className="font-semibold text-ink-900">{names[it.productId] ?? it.productId}</p>
                        {it.variantLabel && <p className="text-[11px] text-ink-500">{it.variantLabel}</p>}
                      </td>
                      <td className="text-center tabular-nums">{it.quantity}</td>
                      <td className="text-right tabular-nums text-ink-600">{formatINR(it.price)}</td>
                      <td className="text-right font-semibold tabular-nums">{formatINR(it.price * it.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-sm">
              <div className="flex justify-between text-ink-600"><dt>Items</dt><dd className="tabular-nums">{formatINR(order.subtotal)}</dd></div>
              {(order.discount ?? 0) > 0 && <div className="flex justify-between text-success"><dt>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</dt><dd className="tabular-nums">− {formatINR(order.discount ?? 0)}</dd></div>}
              <div className="flex justify-between text-ink-600"><dt>Shipping</dt><dd className="tabular-nums">{order.shipping === 0 ? "Free" : formatINR(order.shipping)}</dd></div>
              <div className="flex justify-between text-base font-bold text-ink-900"><dt>Total paid</dt><dd className="tabular-nums">{formatINR(order.total)}</dd></div>
              <p className="text-[11px] text-ink-400">Includes {formatINR(order.gst)} GST · {order.paymentMethod || "Online payment"}{order.paymentId ? ` · ${order.paymentId}` : ""}</p>
            </dl>
          </section>

          {/* Customer + address */}
          <section className={card}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900"><MapPin className="h-4 w-4 text-gold-600" /> Customer &amp; delivery</h2>
            <p className="text-base font-semibold text-ink-900">{order.customerName || "Online customer"}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-600">
              {order.phone && <a href={`tel:${order.phone}`} className="inline-flex items-center gap-1.5 hover:text-gold-700"><Phone className="h-3.5 w-3.5" /> {order.phone}</a>}
              {order.email && <a href={`mailto:${order.email}`} className="inline-flex items-center gap-1.5 hover:text-gold-700"><Mail className="h-3.5 w-3.5" /> {order.email}</a>}
            </div>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-700">{order.address || "No address on this order."}</p>
          </section>
        </div>

        {/* Actions */}
        <section className={cn(card, "h-fit space-y-4")}>
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900"><Truck className="h-4 w-4 text-gold-600" /> Shipping</h2>

          <div>
            <label className={lbl}>Courier</label>
            <input list="couriers" value={courier} onChange={(e) => setCourier(e.target.value)} disabled={cancelled} placeholder="Pick or type a courier" className={input} />
            <datalist id="couriers">{COURIERS.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className={lbl}>Tracking number</label>
            <input value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} disabled={cancelled} placeholder="AWB / consignment no." className={input} />
          </div>

          {message && (
            <p role="status" className={cn("rounded-lg px-3 py-2 text-xs font-semibold", message.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>{message.text}</p>
          )}

          {!cancelled && (
            <div className="space-y-2">
              {order.status === "processing" && (
                <button onClick={() => move("shipped", order.email ? "Marked as shipped. The customer has been emailed." : "Marked as shipped.")} disabled={busy !== null}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 py-3 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900 disabled:opacity-60">
                  <Truck className="h-4 w-4" /> {busy === "shipped" ? "Saving…" : "Mark as shipped"}
                </button>
              )}
              {order.status === "shipped" && (
                <button onClick={() => move("delivered", "Marked as delivered.")} disabled={busy !== null}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 py-3 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900 disabled:opacity-60">
                  <Check className="h-4 w-4" /> {busy === "delivered" ? "Saving…" : "Mark as delivered"}
                </button>
              )}
              {order.status === "shipped" && (
                <button onClick={() => move("processing", "Moved back to processing.")} disabled={busy !== null}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5 disabled:opacity-60">
                  <Undo2 className="h-4 w-4" /> Back to processing
                </button>
              )}
              {order.status === "delivered" && (
                <button onClick={() => move("shipped", "Moved back to shipped.")} disabled={busy !== null}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5 disabled:opacity-60">
                  <Undo2 className="h-4 w-4" /> Back to shipped
                </button>
              )}
              {detailsChanged && (
                <button onClick={() => send({ courier: courier.trim(), trackingNo: trackingNo.trim() }, "details", "Tracking details saved.")} disabled={busy !== null}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gold-500/50 bg-gold-50 py-2.5 text-sm font-semibold text-gold-800 hover:bg-gold-100 disabled:opacity-60">
                  {busy === "details" ? "Saving…" : "Save tracking details"}
                </button>
              )}
              {order.status !== "delivered" && (
                <button onClick={cancel} disabled={busy !== null}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger/5 py-2.5 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-60">
                  <Ban className="h-4 w-4" /> {busy === "cancelled" ? "Cancelling…" : "Cancel order"}
                </button>
              )}
            </div>
          )}
          {!cancelled && order.status === "processing" && order.email && (
            <p className="text-[11px] text-ink-400">Marking it shipped emails {order.email} with the courier and tracking number.</p>
          )}
        </section>
      </div>
    </div>
  );
}
