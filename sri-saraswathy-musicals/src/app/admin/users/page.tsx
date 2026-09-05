"use client";
import { useState } from "react";
import { useStaff, type StaffRole } from "@/lib/store/staff";
import { cn } from "@/lib/utils";

const ROLES: StaffRole[] = ["Admin", "Manager", "Cashier", "Staff"];

export default function UsersPage() {
  const staff = useStaff((s) => s.staff);
  const setRole = useStaff((s) => s.setRole);
  const toggleActive = useStaff((s) => s.toggleActive);
  const [query, setQuery] = useState("");

  const rows = staff.filter(
    (u) => u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="p-5 md:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Users &amp; Roles</h1>
          <p className="mt-1 text-sm text-ink-500">Staff with access to this admin</p>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search users…" className="rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none sm:w-64" />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
              <th className="px-5 py-4">Name</th><th>Email</th><th>Role</th><th className="text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-50">
            {rows.map((u) => (
              <tr key={u.id} className="text-ink-800">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-900 text-sm font-semibold text-gold-400">{u.name[0]}</div>
                    <div><p className="font-semibold text-ink-900">{u.name}</p>{u.branch && <p className="text-[11px] text-ink-400">{u.branch}</p>}</div>
                  </div>
                </td>
                <td className="text-ink-600">{u.email}</td>
                <td>
                  <select value={u.role} onChange={(e) => setRole(u.id, e.target.value as StaffRole)} className="rounded-lg border border-ink-200 bg-ivory-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ink-900 focus:border-gold-500 focus:outline-none">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="text-right">
                  <button onClick={() => toggleActive(u.id)} className={cn("rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors", u.active ? "bg-success/15 text-success hover:bg-success/25" : "bg-ink-100 text-ink-400 hover:bg-ink-200")}>
                    {u.active ? "Active" : "Disabled"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-5 py-16 text-center text-sm text-ink-400">No users found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
