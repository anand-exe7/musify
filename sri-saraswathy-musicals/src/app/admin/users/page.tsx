"use client";
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Info } from "lucide-react";
import { useAuth } from "@/lib/store/auth";
import type { User } from "@/types";
import { cn } from "@/lib/utils";

/** The four access levels an admin can assign. Each maps to a concrete
 *  (isAdmin, branch, role) combination on the user record. */
type Access = "admin" | "Branch 1" | "Branch 2" | "none";

const ACCESS_OPTIONS: { value: Access; label: string }[] = [
  { value: "admin", label: "Admin · All Branches" },
  { value: "Branch 1", label: "Branch 1 (Vadapalani)" },
  { value: "Branch 2", label: "Branch 2 (Porur)" },
  { value: "none", label: "No admin access" },
];

function accessOf(u: User): Access {
  if (u.isAdmin) return "admin";
  if (u.branch === "Branch 1" || u.branch === "Branch 2") return u.branch;
  return "none";
}

/** Turn an access choice into the DB fields it implies. */
function patchForAccess(a: Access): Partial<User> {
  switch (a) {
    case "admin":
      return { isAdmin: true, branch: null, role: "admin" };
    case "Branch 1":
      return { isAdmin: false, branch: "Branch 1", role: "branch1-manager" };
    case "Branch 2":
      return { isAdmin: false, branch: "Branch 2", role: "branch2-manager" };
    default:
      return { isAdmin: false, branch: null, role: "customer" };
  }
}

const ACCESS_TONE: Record<Access, string> = {
  admin: "bg-gold-100 text-gold-700",
  "Branch 1": "bg-info/15 text-info",
  "Branch 2": "bg-info/15 text-info",
  none: "bg-ink-100 text-ink-500",
};

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
          A branch assignment scopes that person to one shop. Changes take effect the next time they sign in.
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
              const isMe = u.id === meId;
              return (
                <tr key={u.id} className="text-ink-800">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-900 text-sm font-semibold text-gold-400">{u.name?.[0]?.toUpperCase() || "?"}</div>
                      <div>
                        <p className="font-semibold text-ink-900">{u.name || "—"}{isMe && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-gold-600">You</span>}</p>
                        <span className={cn("mt-0.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider", ACCESS_TONE[access])}>{access === "none" ? "Customer" : access === "admin" ? "Admin" : access}</span>
                      </div>
                    </div>
                  </td>
                  <td className="text-ink-600">{u.email}</td>
                  <td>
                    <select
                      value={access}
                      disabled={isMe}
                      title={isMe ? "You can't change your own access" : undefined}
                      onChange={(e) => patchUser(u.id, patchForAccess(e.target.value as Access))}
                      className="rounded-lg border border-ink-200 bg-ivory-50 px-3 py-1.5 text-xs font-semibold text-ink-900 focus:border-gold-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {ACCESS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
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
