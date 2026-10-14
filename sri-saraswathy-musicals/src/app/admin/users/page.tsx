"use client";
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Info } from "lucide-react";
import { useAuth } from "@/lib/store/auth";
import type { User } from "@/types";
import { cn } from "@/lib/utils";
import { BUSINESS } from "@/lib/data/business";
import { isBranch, branchManagerRole, branchLabel, DEFAULT_BRANCH } from "@/lib/stock";

/** The four access levels an admin can assign. Each maps to a concrete
 *  (isAdmin, branch, role) combination on the user record. */
type Access = "admin" | "staff" | "none";

const ACCESS_OPTIONS: { value: Access; label: string }[] = [
  { value: "admin", label: "Admin · All branches" },
  { value: "staff", label: "Branch staff · pick branches" },
  { value: "none", label: "No admin access" },
];

/** The branches a non-admin user may work in (primary first). */
function branchesOfUser(u: User): string[] {
  return [...new Set([...(u.branchAccess ?? []), ...(u.branch ? [u.branch] : [])])].filter(isBranch);
}

function accessOf(u: User): Access {
  if (u.isAdmin) return "admin";
  return branchesOfUser(u).length > 0 ? "staff" : "none";
}

/** DB fields implied by a list of branches (the first is the primary / role branch). */
function patchForBranches(list: string[]): Partial<User> {
  return { isAdmin: false, branchAccess: list, branch: list[0], role: branchManagerRole(list[0]) };
}

/** Turn an access choice into the DB fields it implies. */
function patchForAccess(a: Access, current: string[]): Partial<User> {
  if (a === "admin") return { isAdmin: true, branch: null, branchAccess: [], role: "admin" };
  if (a === "staff") return patchForBranches(current.length > 0 ? current : [DEFAULT_BRANCH]);
  return { isAdmin: false, branch: null, branchAccess: [], role: "customer" };
}

const accessTone = (a: Access): string =>
  a === "admin" ? "bg-gold-100 text-gold-700" : a === "none" ? "bg-ink-100 text-ink-500" : "bg-info/15 text-info";

const accessText = (a: Access, list: string[]): string =>
  a === "none" ? "Customer" : a === "admin" ? "Admin" : list.map(branchLabel).join(" · ");

export default function UsersPage() {
  const meId = useAuth((s) => s.user?.id);
  const isAdmin = useAuth((s) => s.isAdmin);
  const authHydrated = useAuth((s) => s.hydrated);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (authHydrated && !isAdmin) {
      setLoading(false);
      return;
    }
    if (!isAdmin) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/users", { cache: "no-store" });
        if (res.ok && alive) setUsers((await res.json()) as User[]);
      } catch {
        /* keep empty */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAdmin, authHydrated]);

  const patchUser = async (id: string, patch: Partial<User>) => {
    const prev = users;
    setUsers((us) => us.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      alert("Couldn't save the change. Reverting.");
      setUsers(prev);
    }
  };

  const rows = useMemo(
    () =>
      users.filter(
        (u) =>
          u.name.toLowerCase().includes(query.toLowerCase()) ||
          u.email.toLowerCase().includes(query.toLowerCase()),
      ),
    [users, query],
  );

  if (authHydrated && !isAdmin) {
    return (
      <div className="p-5 md:p-8">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-ink-100 bg-ivory-50 px-6 py-16 text-center">
          <ShieldCheck className="h-8 w-8 text-ink-300" />
          <h1 className="text-lg font-bold text-ink-900">Admins only</h1>
          <p className="text-sm text-ink-500">Only a full admin can view and manage user access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 md:p-8">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Users &amp; Roles</h1>
          <p className="mt-1 text-sm text-ink-500">Assign branch access to the people who sign in</p>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search users…" className="rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none sm:w-64" />
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-info/20 bg-info/5 px-4 py-3 text-xs text-ink-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p>
          <span className="font-semibold text-ink-800">Admin · All Branches</span> sees everything and can switch branches.
          Branch staff are limited to the branches you tick — one or several. Changes take effect the next time they sign in.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
              <th className="px-5 py-4">Name</th>
              <th>Email</th>
              <th>Branch access</th>
              <th className="text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-50">
            {rows.map((u) => {
              const access = accessOf(u);
              const userBranches = branchesOfUser(u);
              const isMe = u.id === meId;
              return (
                <tr key={u.id} className="text-ink-800">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-900 text-sm font-semibold text-gold-400">{u.name?.[0]?.toUpperCase() || "?"}</div>
                      <div>
                        <p className="font-semibold text-ink-900">{u.name || "—"}{isMe && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-gold-600">You</span>}</p>
                        <span className={cn("mt-0.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider", accessTone(access))}>{accessText(access, userBranches)}</span>
                      </div>
                    </div>
                  </td>
                  <td className="text-ink-600">{u.email}</td>
                  <td>
                    <select
                      value={access}
                      disabled={isMe}
                      title={isMe ? "You can't change your own access" : undefined}
                      onChange={(e) => patchUser(u.id, patchForAccess(e.target.value as Access, userBranches))}
                      className="rounded-lg border border-ink-200 bg-ivory-50 px-3 py-1.5 text-xs font-semibold text-ink-900 focus:border-gold-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {ACCESS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {access === "staff" && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        {BUSINESS.branches.map((br) => {
                          const on = userBranches.includes(br.key);
                          return (
                            <label key={br.key} className="flex items-center gap-1.5 text-xs text-ink-700">
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={isMe || (on && userBranches.length === 1)}
                                title={on && userBranches.length === 1 ? "A staff member needs at least one branch" : undefined}
                                onChange={() => {
                                  const next = on ? userBranches.filter((k) => k !== br.key) : [...userBranches, br.key];
                                  // keep the shop's own order so the primary branch is predictable
                                  const ordered = BUSINESS.branches.map((x) => x.key).filter((k) => next.includes(k));
                                  patchUser(u.id, patchForBranches(ordered));
                                }}
                              />
                              {br.area}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => patchUser(u.id, { active: !u.active })}
                      disabled={isMe}
                      className={cn(
                        "rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        u.active ? "bg-success/15 text-success hover:bg-success/25" : "bg-ink-100 text-ink-400 hover:bg-ink-200",
                      )}
                    >
                      {u.active ? "Active" : "Disabled"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && <tr><td colSpan={4} className="px-5 py-16 text-center text-sm text-ink-400">No users found.</td></tr>}
            {loading && <tr><td colSpan={4} className="px-5 py-16 text-center text-sm text-ink-400">Loading users…</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
