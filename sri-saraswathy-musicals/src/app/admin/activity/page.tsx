"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingBag, Wrench, MessageSquare, PackageMinus, AlertTriangle, Clock, Activity, RefreshCw, Check,
} from "lucide-react";
import { useRepair, alertLevel, daysUntil, statusLabel } from "@/lib/store/repair";
import { useInquiry, useInquiriesLoaded } from "@/lib/store/inquiry";
import { useOrderAlerts } from "@/lib/store/orderAlerts";
import { useSettings } from "@/lib/store/settings";
import { fetchJson } from "@/lib/client/api";
import { LoadingInline } from "@/components/admin/LoadState";
import { branchLabel } from "@/lib/stock";
import { cn, formatINR } from "@/lib/utils";
import type { StockAlert } from "@/lib/db/queries/inventoryPage";

type Kind = "order" | "repair" | "inquiry" | "stock";

interface Item {
  id: string;
  kind: Kind;
  /** Sort key — newest first. Items without a real timestamp (stock) sort to the end of their group. */
  at: number;
  title: string;
  sub: string;
  badge: string;
  tone: string;
  href: string;
  urgent?: boolean;
}

const KINDS: { key: Kind | "all"; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "Everything", icon: <Activity className="h-3.5 w-3.5" /> },
  { key: "order", label: "Orders", icon: <ShoppingBag className="h-3.5 w-3.5" /> },
  { key: "repair", label: "Repairs", icon: <Wrench className="h-3.5 w-3.5" /> },
  { key: "inquiry", label: "Inquiries", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { key: "stock", label: "Stock", icon: <PackageMinus className="h-3.5 w-3.5" /> },
];

const ICON: Record<Kind, React.ReactNode> = {
  order: <ShoppingBag className="h-4 w-4" />,
  repair: <Wrench className="h-4 w-4" />,
  inquiry: <MessageSquare className="h-4 w-4" />,
  stock: <PackageMinus className="h-4 w-4" />,
};

/** "2 hours ago" — short, because the exact time is on the item's own screen. */
function ago(ms: number): string {
  if (!ms) return "";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

const time = (iso?: string) => (iso ? new Date(iso).getTime() || 0 : 0);

/**
 * One screen for everything happening around the shops: online orders waiting to go out, repairs overdue or due
 * soon, new website inquiries and stock that has run low. The bell in the top bar shows the same counts — this is
 * where you come to read them all in one place.
 */
export default function ActivityPage() {
  const router = useRouter();
  const tickets = useRepair((s) => s.tickets);
  const hydrateRepair = useRepair((s) => s.hydrate);
  useInquiriesLoaded();
  const inquiries = useInquiry((s) => s.inquiries);
  const hydrateInquiries = useInquiry((s) => s.hydrate);
  const orderLatest = useOrderAlerts((s) => s.latest);
  const orderCount = useOrderAlerts((s) => s.count);
  const refreshOrders = useOrderAlerts((s) => s.refresh);
  const lowStockAlerts = useSettings((s) => s.lowStockAlerts);

  const [stock, setStock] = useState<StockAlert[] | null>(null);
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [busy, setBusy] = useState(false);

  const load = useMemo(
    () => async () => {
      setBusy(true);
      await Promise.allSettled([
        refreshOrders(),
        hydrateRepair(),
        hydrateInquiries(),
        fetchJson<StockAlert[]>("/api/inventory?view=alerts").then((a) => setStock(Array.isArray(a) ? a : [])),
      ]);
      setBusy(false);
    },
    [refreshOrders, hydrateRepair, hydrateInquiries],
  );

  useEffect(() => { void load(); }, [load]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];

    for (const o of orderLatest) {
      out.push({
        id: `order-${o.id}`, kind: "order", at: time(o.date),
        title: o.customerName || "Online customer",
        sub: `${o.id} · ${branchLabel(o.branch)}`,
        badge: formatINR(o.total), tone: "bg-gold-100 text-gold-700",
        href: `/admin/orders/${encodeURIComponent(o.id)}`, urgent: true,
      });
    }

    for (const t of tickets) {
      const level = alertLevel(t);
      if (level !== "overdue" && level !== "due-soon") continue;
      const d = daysUntil(t.deadline);
      out.push({
        id: `repair-${t.id}`, kind: "repair", at: time(t.updatedAt) || time(t.createdAt),
        title: t.productName,
        sub: `${t.id} · ${t.customerName} · ${statusLabel(t.status)}`,
        badge: level === "overdue" ? `${Math.abs(d)}d late` : d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : `${d}d left`,
        tone: level === "overdue" ? "bg-danger/15 text-danger" : "bg-warning/20 text-[#8a6a1f]",
        href: `/admin/service/${t.id}`, urgent: level === "overdue",
      });
    }

    for (const i of inquiries) {
      if (i.status !== "new") continue;
      out.push({
        id: `inq-${i.id}`, kind: "inquiry", at: time(i.createdAt),
        title: i.name,
        sub: [i.topic, i.productInterest, i.branch ? branchLabel(i.branch) : ""].filter(Boolean).join(" · "),
        badge: "New", tone: "bg-gold-100 text-gold-700",
        href: "/admin/inquiries",
      });
    }

    for (const a of stock ?? []) {
      if (a.state === "low" && !lowStockAlerts) continue;
      out.push({
        id: `stock-${a.productId}-${a.variant}`, kind: "stock", at: 0,
        title: a.productName,
        sub: `${a.category} · ${a.variant}`,
        badge: a.state === "out" ? "Out of stock" : `${a.stock} left`,
        tone: a.state === "out" ? "bg-danger/15 text-danger" : "bg-warning/20 text-[#8a6a1f]",
        href: "/admin/inventory", urgent: a.state === "out",
      });
    }

    return out.sort((x, y) => y.at - x.at);
  }, [orderLatest, tickets, inquiries, stock, lowStockAlerts]);

  const counts = useMemo(() => {
    const c: Record<Kind, number> = { order: 0, repair: 0, inquiry: 0, stock: 0 };
    for (const i of items) c[i.kind] += 1;
    return c;
  }, [items]);

  const shown = filter === "all" ? items : items.filter((i) => i.kind === filter);

  const overdue = tickets.filter((t) => alertLevel(t) === "overdue").length;
  const dueSoon = tickets.filter((t) => alertLevel(t) === "due-soon").length;
  const outOfStock = (stock ?? []).filter((a) => a.state === "out").length;
  const lowStock = (stock ?? []).filter((a) => a.state === "low").length;

  const tiles = [
    { label: "Orders to ship", value: orderCount, icon: <ShoppingBag className="h-4 w-4" />, tone: "text-gold-700", go: () => setFilter("order") },
    { label: "Repairs overdue", value: overdue, icon: <AlertTriangle className="h-4 w-4" />, tone: "text-danger", go: () => setFilter("repair") },
    { label: "Repairs due soon", value: dueSoon, icon: <Clock className="h-4 w-4" />, tone: "text-[#8a6a1f]", go: () => setFilter("repair") },
    { label: "New inquiries", value: inquiries.filter((i) => i.status === "new").length, icon: <MessageSquare className="h-4 w-4" />, tone: "text-gold-700", go: () => setFilter("inquiry") },
    { label: "Out of stock", value: outOfStock, icon: <PackageMinus className="h-4 w-4" />, tone: "text-danger", go: () => setFilter("stock") },
    ...(lowStockAlerts ? [{ label: "Running low", value: lowStock, icon: <PackageMinus className="h-4 w-4" />, tone: "text-[#8a6a1f]", go: () => setFilter("stock") }] : []),
  ];

  const chip = (active: boolean) => cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors", active ? "bg-ink-900 text-ivory-50" : "text-ink-600 hover:text-ink-900");

  return (
    <div className="p-5 md:p-8">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="border-l-4 border-ink-900 pl-4">
          <h1 className="text-2xl font-bold text-ink-900">Activity</h1>
          <p className="mt-1 text-sm text-ink-500">Everything waiting for attention across the three shops — orders, repairs, inquiries and stock.</p>
        </div>
        <button onClick={() => void load()} disabled={busy} className="inline-flex h-10 items-center gap-2 self-start rounded-xl border border-ink-200 bg-ivory-50 px-3.5 text-sm font-semibold text-ink-700 hover:border-gold-500 hover:text-gold-600 disabled:opacity-60">
          <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} /> {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Counts — tap one to narrow the list below. */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <button key={t.label} onClick={t.go} className="rounded-2xl border border-ink-100 bg-ivory-50 px-4 py-3 text-left transition-colors hover:border-gold-500">
            <span className={cn("flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]", t.tone)}>{t.icon} {t.label}</span>
            <span className="mt-1 block text-2xl font-bold tabular-nums text-ink-900">{t.value}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-ink-100 bg-ivory-50 p-3">
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-ink-900/[0.04] p-1">
          {KINDS.map((k) => (
            <button key={k.key} onClick={() => setFilter(k.key)} className={chip(filter === k.key)}>
              {k.icon} {k.label}
              {k.key !== "all" && counts[k.key as Kind] > 0 && (
                <span className={cn("rounded-full px-1.5 text-[10px] font-bold", filter === k.key ? "bg-ivory-50/20" : "bg-ink-900/10")}>{counts[k.key as Kind]}</span>
              )}
            </button>
          ))}
        </div>
        <p className="ml-auto text-[11px] text-ink-400">{shown.length} item{shown.length === 1 ? "" : "s"}</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50">
        {stock === null && items.length === 0 ? (
          <p className="px-4 py-14 text-center"><LoadingInline label="Reading what's happening…" /></p>
        ) : shown.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <Check className="mx-auto mb-2 h-7 w-7 text-success" />
            <p className="text-sm font-semibold text-ink-700">Nothing waiting here.</p>
            <p className="mt-1 text-xs text-ink-400">Orders, repairs, inquiries and low stock all show up on this page as they happen.</p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-50">
            {shown.map((i) => (
              <li key={i.id}>
                <button onClick={() => router.push(i.href)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-900/[0.03]">
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", i.urgent ? "bg-danger/10 text-danger" : "bg-ink-900/[0.06] text-ink-600")}>{ICON[i.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-900" title={i.title}>{i.title}</span>
                    <span className="block truncate text-xs text-ink-500" title={i.sub}>{i.sub}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={cn("block whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", i.tone)}>{i.badge}</span>
                    {i.at > 0 && <span className="mt-0.5 block text-[10px] text-ink-400">{ago(i.at)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
