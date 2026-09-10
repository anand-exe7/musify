"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PanelLeft, ArrowLeft, Bell, Wrench, MessageSquare, AlertTriangle, Clock, X } from "lucide-react";
import { useRepair, alertLevel, daysUntil, statusLabel } from "@/lib/store/repair";
import { useInquiry } from "@/lib/store/inquiry";
import { cn } from "@/lib/utils";

export function AdminTopbar({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();
  const tickets = useRepair((s) => s.tickets);
  const inquiries = useInquiry((s) => s.inquiries);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const { overdue, dueSoon, newInq } = useMemo(() => {
    const overdue = tickets
      .filter((t) => alertLevel(t) === "overdue")
      .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline));
    const dueSoon = tickets
      .filter((t) => alertLevel(t) === "due-soon")
      .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline));
    const newInq = inquiries.filter((i) => i.status === "new");
    return { overdue, dueSoon, newInq };
  }, [tickets, inquiries]);

  const count = mounted ? overdue.length + dueSoon.length + newInq.length : 0;

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-100 bg-ivory-50/90 px-4 py-3 backdrop-blur-md md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenu}
          aria-label="Toggle menu"
          className="grid h-9 w-9 place-items-center rounded-lg text-ink-700 hover:bg-ink-900/5"
        >
          <PanelLeft className="h-5 w-5" />
        </button>
        <span className="text-lg font-bold text-ink-900">Dashboard</span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Notification bell */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Notifications"
            className={cn(
              "relative grid h-9 w-9 place-items-center rounded-lg text-ink-700 transition-colors hover:bg-ink-900/5",
              open && "bg-ink-900/5",
            )}
          >
            <Bell className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[1rem] place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                {count > 9 ? "9+" : count}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-11 z-50 w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50 shadow-2xl">
              <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
                <p className="text-sm font-bold text-ink-900">Alerts</p>
                <button onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 hover:bg-ink-900/5 hover:text-ink-900">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto">
                {count === 0 && (
                  <p className="px-4 py-10 text-center text-sm text-ink-400">You&apos;re all caught up 🎵</p>
                )}

                {overdue.length > 0 && (
                  <Section icon={<AlertTriangle className="h-3.5 w-3.5" />} label={`Overdue repairs · ${overdue.length}`} tone="text-danger">
                    {overdue.map((t) => (
                      <AlertRow
                        key={t.id}
                        onClick={() => go(`/admin/service/${t.id}`)}
                        title={t.productName}
                        sub={`${t.id} · ${t.customerName}`}
                        badge={`${Math.abs(daysUntil(t.deadline))}d late`}
                        badgeTone="bg-danger/15 text-danger"
                        note={statusLabel(t.status)}
                      />
                    ))}
                  </Section>
                )}

                {dueSoon.length > 0 && (
                  <Section icon={<Clock className="h-3.5 w-3.5" />} label={`Due soon · ${dueSoon.length}`} tone="text-[#8a6a1f]">
                    {dueSoon.map((t) => {
                      const d = daysUntil(t.deadline);
                      return (
                        <AlertRow
                          key={t.id}
                          onClick={() => go(`/admin/service/${t.id}`)}
                          title={t.productName}
                          sub={`${t.id} · ${t.customerName}`}
                          badge={d === 0 ? "Today" : d === 1 ? "Tomorrow" : `${d}d`}
                          badgeTone="bg-warning/20 text-[#8a6a1f]"
                          note={statusLabel(t.status)}
                        />
                      );
                    })}
                  </Section>
                )}

                {newInq.length > 0 && (
                  <Section icon={<MessageSquare className="h-3.5 w-3.5" />} label={`New inquiries · ${newInq.length}`} tone="text-gold-700">
                    {newInq.slice(0, 6).map((i) => (
                      <AlertRow
                        key={i.id}
                        onClick={() => go("/admin/inquiries")}
                        title={i.name}
                        sub={i.topic}
                        badge="New"
                        badgeTone="bg-gold-100 text-gold-700"
                        note={i.productInterest || ""}
                      />
                    ))}
                  </Section>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-ink-100 bg-[#FAF7EF] px-3 py-2.5">
                <Link href="/admin/service" onClick={() => setOpen(false)} className="flex items-center justify-center gap-1.5 rounded-lg bg-ink-900 py-2 text-[11px] font-bold uppercase tracking-wider text-ivory-50 hover:bg-ink-800">
                  <Wrench className="h-3.5 w-3.5" /> Repairs
                </Link>
                <Link href="/admin/inquiries" onClick={() => setOpen(false)} className="flex items-center justify-center gap-1.5 rounded-lg border border-ink-200 py-2 text-[11px] font-bold uppercase tracking-wider text-ink-700 hover:border-gold-500 hover:text-gold-600">
                  <MessageSquare className="h-3.5 w-3.5" /> Inquiries
                </Link>
              </div>
            </div>
          )}
        </div>

        <Link
          href="/"
          className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-ink-500 transition-colors hover:text-gold-600"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">View Store</span>
        </Link>
        <div className="grid h-9 w-9 place-items-center rounded-full bg-ink-900 text-sm font-semibold text-gold-400">
          A
        </div>
      </div>
    </header>
  );
}

function Section({ icon, label, tone, children }: { icon: React.ReactNode; label: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-ink-50 last:border-0">
      <div className={cn("flex items-center gap-1.5 px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.16em]", tone)}>
        {icon} {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function AlertRow({
  onClick, title, sub, badge, badgeTone, note,
}: { onClick: () => void; title: string; sub: string; badge: string; badgeTone: string; note?: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ink-900/[0.04]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-900">{title}</p>
        <p className="truncate text-xs text-ink-500">{sub}</p>
        {note && <p className="truncate text-[11px] text-ink-400">{note}</p>}
      </div>
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", badgeTone)}>{badge}</span>
    </button>
  );
}
