"use client";
import Link from "next/link";
import { StatCard } from "@/components/admin/StatCard";
import { SalesChart, CategoryPie } from "@/components/admin/SalesChart";
import { invoices } from "@/lib/data/invoices";
import { products } from "@/lib/data/products";
import { formatINR } from "@/lib/utils";
import { Plus, ArrowUpRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminDashboard() {
  const paidTotal = invoices.filter(i => i.status === "paid").reduce((n, i) => n + i.total, 0);
  const pendingTotal = invoices.filter(i => i.status === "pending").reduce((n, i) => n + i.total, 0);
  const invoicesToday = invoices.filter(i => i.date === "2026-09-05").length;
  const lowStock = products.filter(p => p.stock <= 3);

  return (
    <div className="p-5 md:p-10">
      {/* Header */}
      <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="heading-serif mt-3 text-display-md text-ink-900">Good morning, <em>Ravi.</em></h1>
          <p className="mt-2 text-sm text-ink-500">Here's what happened at the two branches today.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/billing?new=1" className="btn-gold-solid">
            <Plus className="h-3.5 w-3.5" /> New invoice
          </Link>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Today's revenue" value={formatINR(158000)} change={12.4} hint="vs yesterday" accent="gold" index={0} />
        <StatCard label="Invoices today" value={String(invoicesToday || 7)} change={8.2} hint="paid & pending" accent="ink" index={1} />
        <StatCard label="Outstanding" value={formatINR(pendingTotal)} change={-3.1} hint="across 4 bills" accent="maroon" index={2} />
        <StatCard label="Low stock" value={String(lowStock.length)} change={0} hint="items ≤ 3" accent="gold" index={3} />
      </div>

      {/* Charts */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <SalesChart />
        <CategoryPie />
      </div>

      {/* Two-column split: recent invoices + low stock */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="border border-ink-100 bg-ivory-50 p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-500">Latest invoices</p>
              <p className="heading-serif mt-1 text-xl text-ink-900">Last 5 bills</p>
            </div>
            <Link href="/admin/billing" className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-gold-600 hover:underline">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-ink-100 -mx-2">
            {invoices.slice(0, 5).map((i) => (
              <div key={i.id} className="flex items-center justify-between px-2 py-3 text-sm">
                <div className="min-w-0">
                  <p className="tabular font-medium text-ink-900">{i.number}</p>
                  <p className="truncate text-xs text-ink-500">{i.customer} · {i.branch}</p>
                </div>
                <div className="text-right">
                  <p className="tabular font-medium text-ink-900">{formatINR(i.total)}</p>
                  <p className={cn("text-[10px] uppercase tracking-widest",
                    i.status === "paid" && "text-success",
                    i.status === "pending" && "text-warning",
                    i.status === "cancelled" && "text-danger",
                  )}>{i.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-ink-100 bg-ivory-50 p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-500">Alerts</p>
              <p className="heading-serif mt-1 text-xl text-ink-900">Needs attention</p>
            </div>
            <Link href="/admin/inventory" className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-gold-600 hover:underline">
              Manage <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-ink-100 -mx-2">
            {lowStock.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-2 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <AlertTriangle className={cn("h-4 w-4 shrink-0", p.stock === 0 ? "text-danger" : "text-warning")} />
                  <div>
                    <p className="text-ink-900">{p.name}</p>
                    <p className="text-xs text-ink-400">{p.brand}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn("tabular font-semibold", p.stock === 0 ? "text-danger" : "text-warning")}>{p.stock} left</p>
                  <p className="text-[10px] uppercase tracking-widest text-ink-400">Reorder</p>
                </div>
              </div>
            ))}
            {lowStock.length === 0 && <p className="p-4 text-sm text-ink-400">All items are well-stocked.</p>}
          </div>
        </div>
      </div>

      {/* Branch summary */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {(["Branch 1", "Branch 2"] as const).map((b) => {
          const branchInvoices = invoices.filter(i => i.branch === b);
          const rev = branchInvoices.reduce((n, i) => n + i.total, 0);
          return (
            <div key={b} className="border border-ink-100 bg-gradient-to-br from-ink-900 to-ink-800 p-6 text-ivory-100 md:p-8">
              <p className="text-[10px] uppercase tracking-[0.22em] text-gold-400">{b === "Branch 1" ? "Chennai · Mylapore" : "Bengaluru · Basavanagudi"}</p>
              <p className="heading-serif mt-2 text-3xl">{b}</p>
              <div className="mt-6 grid grid-cols-3 gap-4 border-t border-ivory-100/10 pt-6">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-ivory-100/50">Revenue</p>
                  <p className="tabular mt-2 font-display text-xl text-ivory-100">{formatINR(rev)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-ivory-100/50">Invoices</p>
                  <p className="tabular mt-2 font-display text-xl text-ivory-100">{branchInvoices.length}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-ivory-100/50">Manager</p>
                  <p className="mt-2 text-xs text-ivory-100">{b === "Branch 1" ? "Lakshmi Menon" : "Suresh Iyer"}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
