"use client";
import { useState } from "react";
import { StatCard } from "@/components/admin/StatCard";
import { SalesChart, CategoryPie } from "@/components/admin/SalesChart";
import { invoices, categorySales } from "@/lib/data/invoices";
import { products } from "@/lib/data/products";
import { formatINR } from "@/lib/utils";
import { Download, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const branchData = [
  { name: "Branch 1", revenue: 483420, invoices: 4 },
  { name: "Branch 2", revenue: 440460, invoices: 3 },
];

const monthlyGST = [
  { m: "Apr", cgst: 42000, sgst: 42000 },
  { m: "May", cgst: 58000, sgst: 58000 },
  { m: "Jun", cgst: 71000, sgst: 71000 },
  { m: "Jul", cgst: 62000, sgst: 62000 },
  { m: "Aug", cgst: 89000, sgst: 89000 },
  { m: "Sep", cgst: 47000, sgst: 47000 },
];

export default function AnalyticsPage() {
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "1y">("30d");

  const totalRevenue = invoices.reduce((n, i) => n + i.total, 0);
  const totalGST = invoices.reduce((n, i) => n + i.cgst + i.sgst, 0);
  const avgOrderValue = totalRevenue / invoices.length;
  const topProduct = [...products].sort((a, b) => b.reviews - a.reviews)[0];

  return (
    <div className="p-5 md:p-10">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">Analytics</p>
          <h1 className="heading-serif mt-3 text-display-md text-ink-900">Reports <em>& insights</em></h1>
          <p className="mt-2 text-sm text-ink-500">Sales, GST summaries, and branch-wise performance.</p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 border border-ink-200 p-1">
            {(["7d", "30d", "90d", "1y"] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)}
                className={cn("px-3 py-1.5 text-[10px] uppercase tracking-widest",
                  range === r ? "bg-ink-900 text-ivory-50" : "text-ink-600 hover:text-ink-900")}>
                {r}
              </button>
            ))}
          </div>
          <button className="btn-ghost"><Download className="h-3.5 w-3.5" /> Export</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total revenue" value={formatINR(totalRevenue)} change={14.2} hint="MoM" accent="gold" index={0} />
        <StatCard label="Total GST" value={formatINR(totalGST)} change={11.8} hint="CGST + SGST" accent="ink" index={1} />
        <StatCard label="Avg. order value" value={formatINR(avgOrderValue)} change={-2.4} hint="per invoice" accent="maroon" index={2} />
        <StatCard label="Top piece" value={topProduct.name.split(" ").slice(0, 2).join(" ")} hint={`${topProduct.reviews} reviews`} accent="gold" index={3} />
      </div>

      {/* Sales chart */}
      <div className="mt-6"><SalesChart /></div>

      {/* Branch + Category */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="border border-ink-100 bg-ivory-50 p-5 md:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-500">Branch comparison</p>
          <p className="heading-serif mt-1 text-xl text-ink-900">Revenue by branch</p>
          <div className="mt-4 h-56">
            <ResponsiveContainer>
              <BarChart data={branchData} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#E4D5B0" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#8A7A65" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#8A7A65" }} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip contentStyle={{ background: "#0A0908", border: "1px solid #C9A24B", borderRadius: 0, fontSize: 12, color: "#FAF6EC" }}
                  formatter={(v: number) => [formatINR(v), "Revenue"]} />
                <Bar dataKey="revenue" fill="#C9A24B" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <CategoryPie />
      </div>

      {/* GST monthly */}
      <div className="mt-6 border border-ink-100 bg-ivory-50 p-5 md:p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-500">GST summary · FY 2026-27</p>
        <p className="heading-serif mt-1 text-xl text-ink-900">Monthly CGST & SGST</p>
        <div className="mt-4 h-64">
          <ResponsiveContainer>
            <BarChart data={monthlyGST} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#E4D5B0" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#8A7A65" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#8A7A65" }} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip contentStyle={{ background: "#0A0908", border: "1px solid #C9A24B", borderRadius: 0, fontSize: 12, color: "#FAF6EC" }}
                formatter={(v: number, n) => [formatINR(v), n as string]} />
              <Bar dataKey="cgst" fill="#C9A24B" stackId="s" name="CGST" />
              <Bar dataKey="sgst" fill="#5B1E1E" stackId="s" name="SGST" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top products */}
      <div className="mt-6 border border-ink-100 bg-ivory-50 p-5 md:p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-500">Top performers</p>
        <p className="heading-serif mt-1 text-xl text-ink-900">Most-sold instruments</p>
        <div className="mt-4 divide-y divide-ink-100">
          {[...products].sort((a, b) => b.reviews - a.reviews).slice(0, 5).map((p, i) => (
            <div key={p.id} className="flex items-center gap-4 py-3">
              <span className="tabular w-8 text-center font-display text-lg text-gold-500">{i + 1}</span>
              <div className="flex-1">
                <p className="text-sm text-ink-900">{p.name}</p>
                <p className="text-xs text-ink-400">{p.brand} · HSN {p.hsn}</p>
              </div>
              <div className="text-right">
                <p className="tabular text-sm font-medium text-ink-900">{p.reviews} sold</p>
                <p className="tabular text-xs text-ink-500">{formatINR(p.price * p.reviews)}</p>
              </div>
              <div className="hidden w-32 text-right text-xs md:block">
                <div className="ml-auto h-1.5 w-full rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-gold-500" style={{ width: `${Math.min(100, (p.reviews / 200) * 100)}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
