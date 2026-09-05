"use client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { salesLast30Days, categorySales } from "@/lib/data/invoices";
import { formatINR } from "@/lib/utils";

export function SalesChart() {
  return (
    <div className="border border-ink-100 bg-ivory-50 p-5 md:p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-500">Sales · Last 30 days</p>
          <p className="heading-serif mt-1 text-2xl text-ink-900">Daily revenue</p>
        </div>
        <div className="flex gap-2 text-[10px] uppercase tracking-widest text-ink-500">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-gold-500" /> Revenue</span>
        </div>
      </div>
      <div className="h-64 w-full md:h-72">
        <ResponsiveContainer>
          <AreaChart data={salesLast30Days} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#C9A24B" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#C9A24B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#E4D5B0" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="d" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#8A7A65" }} interval="preserveStartEnd" />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#8A7A65" }} tickFormatter={(v) => `${v / 1000}k`} />
            <Tooltip
              contentStyle={{ background: "#0A0908", border: "1px solid #C9A24B", borderRadius: 0, fontSize: 12, color: "#FAF6EC" }}
              formatter={(v: number) => [formatINR(v), "Revenue"]}
              labelStyle={{ color: "#C9A24B" }}
            />
            <Area type="monotone" dataKey="v" stroke="#C9A24B" strokeWidth={1.8} fill="url(#rev-fill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function CategoryPie() {
  return (
    <div className="border border-ink-100 bg-ivory-50 p-5 md:p-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-500">Category · Last quarter</p>
      <p className="heading-serif mt-1 text-2xl text-ink-900">Revenue by family</p>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={categorySales} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
              {categorySales.map((c) => (
                <Cell key={c.name} fill={c.color} stroke="#FAF6EC" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "#0A0908", border: "1px solid #C9A24B", borderRadius: 0, fontSize: 12, color: "#FAF6EC" }}
              formatter={(v: number, n) => [formatINR(v), n as string]}
            />
            <Legend wrapperStyle={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "#8A7A65" }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
