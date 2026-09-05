"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { users } from "@/lib/data/users";
import { Plus, Search, ShieldCheck, ShieldX, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { User } from "@/types";

type Perm = keyof User["permissions"];

export default function UsersPage() {
  const [list, setList] = useState<User[]>(users);
  const [selected, setSelected] = useState<User | null>(null);
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);

  const filtered = list.filter(u => !q || u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()));

  const togglePerm = (id: string, perm: Perm) => {
    setList((ls) => ls.map(u => u.id === id ? { ...u, permissions: { ...u.permissions, [perm]: !u.permissions[perm] } } : u));
    if (selected?.id === id) {
      setSelected(prev => prev ? { ...prev, permissions: { ...prev.permissions, [perm]: !prev.permissions[perm] } } : null);
    }
  };

  const toggleActive = (id: string) => {
    setList((ls) => ls.map(u => u.id === id ? { ...u, active: !u.active } : u));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, active: !prev.active } : null);
  };

  return (
    <div className="p-5 md:p-10">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">Users</p>
          <h1 className="heading-serif mt-3 text-display-md text-ink-900">Access <em>& permissions</em></h1>
          <p className="mt-2 text-sm text-ink-500">Grant or revoke module access per staff member. Changes apply on next sign-in.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-gold-solid"><Plus className="h-3.5 w-3.5" /> Add user</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border border-ink-100 bg-ivory-50 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-500">Total users</p>
          <p className="tabular mt-3 font-display text-2xl text-ink-900">{list.length}</p>
        </div>
        <div className="border border-ink-100 bg-ivory-50 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-500">Active</p>
          <p className="tabular mt-3 font-display text-2xl text-success">{list.filter(u => u.active).length}</p>
        </div>
        <div className="border border-ink-100 bg-ivory-50 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-500">Disabled</p>
          <p className="tabular mt-3 font-display text-2xl text-ink-400">{list.filter(u => !u.active).length}</p>
        </div>
      </div>

      {/* Search */}
      <div className="my-6 max-w-sm relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email"
          className="w-full border border-ink-200 bg-ivory-50 py-2.5 pl-9 pr-3 text-sm focus:border-gold-500 focus:outline-none" />
      </div>

      {/* Users table */}
      <div className="overflow-x-auto border border-ink-100 bg-ivory-50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ivory-100 text-left text-[10px] uppercase tracking-[0.16em] text-ink-500">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Permissions</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {filtered.map((u) => (
              <tr key={u.id} className={cn("hover:bg-ivory-100/50", !u.active && "opacity-60")}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-ink-900 text-xs font-semibold text-gold-400">
                      {u.name.split(" ").map(s => s[0]).join("")}
                    </div>
                    <div>
                      <p className="text-ink-900">{u.name}</p>
                      <p className="text-xs text-ink-400">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs uppercase tracking-widest text-ink-600">{u.role.replace("-", " ")}</span>
                </td>
                <td className="px-4 py-3 text-ink-600">{u.branch ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    {(["billing", "inventory", "analytics", "users"] as const).map((p) => (
                      <span key={p} title={p}
                        className={cn("border px-2 py-1 text-[9px] font-semibold uppercase tracking-widest",
                          u.permissions[p] ? "border-gold-500 bg-gold-100/50 text-gold-700" : "border-ink-100 bg-ivory-50 text-ink-300",
                        )}>
                        {p.slice(0, 3)}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-ink-500">{u.lastLogin}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(u.id)} className={cn("flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest",
                    u.active ? "text-success" : "text-ink-400")}>
                    {u.active ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldX className="h-3.5 w-3.5" />}
                    {u.active ? "Active" : "Disabled"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => setSelected(u)} className="text-[10px] uppercase tracking-widest text-gold-600 hover:underline">Edit →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit drawer */}
      {selected && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setSelected(null)} />
          <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} transition={{ duration: 0.3 }}
            className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-ivory-50 shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
              <h2 className="heading-serif text-2xl text-ink-900">Edit user</h2>
              <button onClick={() => setSelected(null)} className="grid h-9 w-9 place-items-center hover:bg-ivory-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-6 p-6">
              <div className="flex items-center gap-4 border-b border-ink-100 pb-6">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-ink-900 text-lg font-semibold text-gold-400">
                  {selected.name.split(" ").map(s => s[0]).join("")}
                </div>
                <div>
                  <p className="heading-serif text-xl text-ink-900">{selected.name}</p>
                  <p className="text-xs text-ink-500">{selected.email}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-gold-600">{selected.role.replace("-", " ")}</p>
                </div>
              </div>

              <div>
                <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Module access</p>
                <div className="space-y-2">
                  {([
                    { p: "billing", label: "Billing & GST", desc: "Create invoices, view sales" },
                    { p: "inventory", label: "Inventory", desc: "Stock, purchases, vendors" },
                    { p: "analytics", label: "Analytics", desc: "Reports & dashboards" },
                    { p: "users", label: "Users & Access", desc: "Manage staff permissions" },
                  ] as const).map((x) => (
                    <label key={x.p} className="flex cursor-pointer items-start gap-3 border border-ink-100 bg-ivory-100/40 p-3 hover:border-gold-300">
                      <input type="checkbox" checked={selected.permissions[x.p]} onChange={() => togglePerm(selected.id, x.p)}
                        className="mt-1 h-4 w-4 accent-gold-500" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-ink-900">{x.label}</p>
                        <p className="text-xs text-ink-500">{x.desc}</p>
                      </div>
                      {selected.permissions[x.p] && <Check className="h-4 w-4 text-gold-600" />}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Account status</p>
                <div className="flex gap-2">
                  <button onClick={() => toggleActive(selected.id)}
                    className={cn("flex flex-1 items-center justify-center gap-2 border py-3 text-xs font-semibold uppercase tracking-widest",
                      selected.active ? "border-success bg-success/10 text-success" : "border-ink-200 text-ink-500")}>
                    <ShieldCheck className="h-3.5 w-3.5" /> Active
                  </button>
                  <button onClick={() => toggleActive(selected.id)}
                    className={cn("flex flex-1 items-center justify-center gap-2 border py-3 text-xs font-semibold uppercase tracking-widest",
                      !selected.active ? "border-danger bg-danger/10 text-danger" : "border-ink-200 text-ink-500")}>
                    <ShieldX className="h-3.5 w-3.5" /> Disabled
                  </button>
                </div>
              </div>

              <div className="flex gap-2 border-t border-ink-100 pt-6">
                <button className="btn-gold-solid flex-1">Save changes</button>
                <button onClick={() => setSelected(null)} className="btn-ghost">Cancel</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Add user modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/50 p-4">
          <div className="w-full max-w-md bg-ivory-50 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="heading-serif text-xl text-ink-900">Add new user</h3>
              <button onClick={() => setShowNew(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4">
              <input placeholder="Full name" className="w-full border border-ink-200 bg-ivory-50 px-4 py-3 text-sm focus:border-gold-500 focus:outline-none" />
              <input placeholder="Email" type="email" className="w-full border border-ink-200 bg-ivory-50 px-4 py-3 text-sm focus:border-gold-500 focus:outline-none" />
              <input placeholder="Phone" className="w-full border border-ink-200 bg-ivory-50 px-4 py-3 text-sm focus:border-gold-500 focus:outline-none" />
              <div className="grid grid-cols-2 gap-3">
                <select className="border border-ink-200 bg-ivory-50 px-4 py-3 text-sm">
                  <option>Role · Cashier</option>
                  <option>Branch manager</option>
                  <option>Admin</option>
                </select>
                <select className="border border-ink-200 bg-ivory-50 px-4 py-3 text-sm">
                  <option>Branch 1</option>
                  <option>Branch 2</option>
                </select>
              </div>
              <button onClick={() => setShowNew(false)} className="btn-gold-solid w-full">Invite user</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
