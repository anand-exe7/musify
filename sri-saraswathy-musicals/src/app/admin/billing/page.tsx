"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { invoices } from "@/lib/data/invoices";
import { products } from "@/lib/data/products";
import { formatINR, calculateGST } from "@/lib/utils";
import { Plus, Download, Printer, Search, X, ChevronRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Line {
  productId: string;
  qty: number;
  discount: number;
}

export default function BillingPage() {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "pending" | "cancelled">("all");
  const [branch, setBranch] = useState<"Branch 1" | "Branch 2">("Branch 1");
  const [customer, setCustomer] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"upi" | "cash" | "card" | "bank">("upi");

  const filtered = useMemo(() => {
    let list = [...invoices];
    if (statusFilter !== "all") list = list.filter(i => i.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i => i.number.toLowerCase().includes(q) || i.customer.toLowerCase().includes(q));
    }
    return list;
  }, [search, statusFilter]);

  const addLine = (productId: string) => {
    setLines((ls) => [...ls, { productId, qty: 1, discount: 0 }]);
    setProductPickerOpen(false);
  };

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l, i) => i === idx ? { ...l, ...patch } : l));
  };

  const removeLine = (idx: number) => {
    setLines((ls) => ls.filter((_, i) => i !== idx));
  };

  const invoiceCalc = useMemo(() => {
    let subtotal = 0, cgst = 0, sgst = 0;
    lines.forEach((l) => {
      const p = products.find(pr => pr.id === l.productId);
      if (!p) return;
      const lineAmt = p.price * l.qty * (1 - l.discount / 100);
      const g = calculateGST(lineAmt, p.gstRate);
      subtotal += lineAmt;
      cgst += g.cgst;
      sgst += g.sgst;
    });
    return { subtotal, cgst, sgst, total: subtotal + cgst + sgst };
  }, [lines]);

  return (
    <div className="p-5 md:p-10">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">Billing</p>
          <h1 className="heading-serif mt-3 text-display-md text-ink-900">Invoices <em>& GST</em></h1>
          <p className="mt-2 text-sm text-ink-500">Create, view, and export invoices for both branches.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-gold-solid">
          <Plus className="h-3.5 w-3.5" /> New invoice
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by invoice # or customer"
            className="w-full border border-ink-200 bg-ivory-50 py-2.5 pl-9 pr-3 text-sm focus:border-gold-500 focus:outline-none" />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["all", "paid", "pending", "cancelled"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn("border px-4 py-2 text-xs uppercase tracking-widest transition-all",
                statusFilter === s ? "border-ink-900 bg-ink-900 text-ivory-100" : "border-ink-200 hover:border-gold-400")}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-ink-100 bg-ivory-50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ivory-100 text-left text-[10px] uppercase tracking-[0.16em] text-ink-500">
              <th className="px-4 py-3">Invoice #</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {filtered.map((i) => (
              <tr key={i.id} className="hover:bg-ivory-100/50">
                <td className="px-4 py-3 tabular font-medium text-ink-900">{i.number}</td>
                <td className="px-4 py-3 text-ink-600">{i.date}</td>
                <td className="px-4 py-3 text-ink-900">{i.customer}</td>
                <td className="px-4 py-3 text-ink-600">{i.branch}</td>
                <td className="px-4 py-3 text-ink-600">{i.items.length}</td>
                <td className="px-4 py-3 tabular text-right font-medium text-ink-900">{formatINR(i.total)}</td>
                <td className="px-4 py-3">
                  <span className={cn("px-2 py-1 text-[10px] font-semibold uppercase tracking-widest",
                    i.status === "paid" && "bg-success/10 text-success",
                    i.status === "pending" && "bg-warning/10 text-warning",
                    i.status === "cancelled" && "bg-danger/10 text-danger",
                  )}>{i.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button className="grid h-7 w-7 place-items-center text-ink-500 hover:text-gold-600" aria-label="Print">
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                    <button className="grid h-7 w-7 place-items-center text-ink-500 hover:text-gold-600" aria-label="Download">
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Slide-over: New Invoice */}
      {showForm && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setShowForm(false)} />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto bg-ivory-50 shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-100 bg-ivory-50 px-6 py-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gold-600">New</p>
                <h2 className="heading-serif text-2xl text-ink-900">Create invoice</h2>
              </div>
              <button onClick={() => setShowForm(false)} className="grid h-9 w-9 place-items-center hover:bg-ivory-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 p-6">
              {/* Branch + customer */}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Branch</span>
                  <select value={branch} onChange={(e) => setBranch(e.target.value as any)} className="w-full border border-ink-200 bg-ivory-50 px-4 py-3 text-sm focus:border-gold-500 focus:outline-none">
                    <option>Branch 1</option>
                    <option>Branch 2</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Invoice #</span>
                  <input readOnly value={`SSM/26-27/${String(143 + invoices.length).padStart(4, "0")}`} className="w-full border border-ink-200 bg-ivory-100 px-4 py-3 text-sm text-ink-500" />
                </label>
                <div className="md:col-span-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Customer</span>
                    <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Name or GSTIN"
                      className="w-full border border-ink-200 bg-ivory-50 px-4 py-3 text-sm focus:border-gold-500 focus:outline-none" />
                  </label>
                </div>
              </div>

              {/* Line items */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Line items</p>
                  <button onClick={() => setProductPickerOpen(true)} className="text-xs font-semibold uppercase tracking-widest text-gold-600 hover:underline">
                    + Add product
                  </button>
                </div>

                {lines.length === 0 ? (
                  <div className="border border-dashed border-ink-200 py-10 text-center text-sm text-ink-400">
                    No products yet. <button onClick={() => setProductPickerOpen(true)} className="text-gold-600 underline">Add one</button>
                  </div>
                ) : (
                  <div className="divide-y divide-ink-100 border border-ink-100 bg-ivory-100/40">
                    {lines.map((l, idx) => {
                      const p = products.find(pr => pr.id === l.productId)!;
                      const amt = p.price * l.qty * (1 - l.discount / 100);
                      return (
                        <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 p-3 text-sm">
                          <div className="min-w-0">
                            <p className="truncate text-ink-900">{p.name}</p>
                            <p className="text-xs text-ink-400">HSN {p.hsn} · {p.gstRate}%</p>
                          </div>
                          <input type="number" value={l.qty} min={1} onChange={(e) => updateLine(idx, { qty: +e.target.value })}
                            className="tabular w-16 border border-ink-200 bg-ivory-50 px-2 py-1.5 text-center text-sm" />
                          <input type="number" value={l.discount} min={0} max={100} onChange={(e) => updateLine(idx, { discount: +e.target.value })}
                            className="tabular w-14 border border-ink-200 bg-ivory-50 px-2 py-1.5 text-center text-sm" placeholder="%" />
                          <p className="tabular w-28 text-right font-medium text-ink-900">{formatINR(amt)}</p>
                          <button onClick={() => removeLine(idx)} className="grid h-8 w-8 place-items-center text-ink-400 hover:text-danger">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Payment */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Payment mode</p>
                <div className="grid grid-cols-4 gap-2">
                  {(["upi", "cash", "card", "bank"] as const).map((m) => (
                    <button key={m} onClick={() => setPaymentMode(m)}
                      className={cn("border py-2.5 text-xs uppercase tracking-widest transition-all",
                        paymentMode === m ? "border-gold-500 bg-gold-500 text-ink-900" : "border-ink-200 hover:border-gold-400")}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="border border-ink-100 bg-ivory-100/40 p-5">
                <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Summary</p>
                <div className="space-y-2 text-sm">
                  <SumRow label="Taxable value" value={formatINR(invoiceCalc.subtotal)} />
                  <SumRow label="CGST" value={formatINR(invoiceCalc.cgst)} />
                  <SumRow label="SGST" value={formatINR(invoiceCalc.sgst)} />
                  <div className="flex items-end justify-between border-t border-ink-100 pt-3">
                    <span className="text-xs uppercase tracking-[0.18em] text-ink-500">Grand total</span>
                    <span className="tabular font-display text-2xl text-ink-900">{formatINR(invoiceCalc.total)}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button className="btn-gold-solid flex-1">Generate invoice</button>
                <button onClick={() => setShowForm(false)} className="btn-ghost">Cancel</button>
              </div>
            </div>
          </motion.div>

          {/* Product picker overlay */}
          {productPickerOpen && (
            <div className="absolute inset-0 z-20 bg-ink-900/60 p-4 md:p-10" onClick={() => setProductPickerOpen(false)}>
              <div className="mx-auto max-w-2xl bg-ivory-50 p-6" onClick={(e) => e.stopPropagation()}>
                <div className="mb-4 flex items-center justify-between">
                  <p className="heading-serif text-xl text-ink-900">Pick a product</p>
                  <button onClick={() => setProductPickerOpen(false)}><X className="h-5 w-5" /></button>
                </div>
                <div className="max-h-96 divide-y divide-ink-100 overflow-y-auto">
                  {products.map((p) => (
                    <button key={p.id} onClick={() => addLine(p.id)} className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-ivory-100">
                      <div>
                        <p className="text-sm text-ink-900">{p.name}</p>
                        <p className="text-xs text-ink-500">{p.brand} · HSN {p.hsn}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="tabular text-sm text-ink-900">{formatINR(p.price)}</p>
                        <ChevronRight className="h-4 w-4 text-ink-400" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-500">{label}</span>
      <span className="tabular text-ink-900">{value}</span>
    </div>
  );
}
