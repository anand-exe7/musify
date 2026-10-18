import { Loader2, WifiOff } from "lucide-react";

/** Full-width "still fetching" panel — shown before the first load resolves. */
export function LoadingPanel({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-ink-100 bg-ivory-50 py-24 text-center shadow-[0_1px_2px_rgba(10,9,8,0.03)]">
      <div className="relative h-10 w-10">
        <Loader2 className="h-10 w-10 animate-spin text-gold-500" />
      </div>
      <p className="mt-4 text-sm font-semibold text-ink-700">{label}</p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-ink-400">Just a moment</p>
    </div>
  );
}

/**
 * Slim banner for a page that still renders but whose last load failed — so an
 * empty list reads as "couldn't load", never as "nothing here". Pass the store's
 * `loadError` (read with a hook, so it appears and clears reactively).
 */
export function LoadErrorBanner({ message, onRetry }: { message: string | null | undefined; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-ink-800">
      <span className="flex items-center gap-2"><WifiOff className="h-4 w-4 shrink-0 text-danger" /> {message}. What you see may be incomplete.</span>
      {onRetry && <button onClick={onRetry} className="shrink-0 rounded-lg bg-danger/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-danger transition-colors hover:bg-danger/15">Retry</button>}
    </div>
  );
}

/**
 * Full-width "couldn't reach the server" panel — shown when a fetch fails, so a
 * network/DB outage reads as offline instead of masquerading as "no data yet".
 */
export function OfflinePanel({
  label = "You appear to be offline",
  hint = "We couldn't reach the server. Check your connection and try again.",
}: {
  label?: string;
  hint?: string;
}) {
  return (
    <div className="grid place-items-center rounded-2xl border border-danger/20 bg-danger/5 py-24 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-danger/15">
        <WifiOff className="h-6 w-6 text-danger" />
      </div>
      <p className="mt-4 text-sm font-bold text-ink-900">{label}</p>
      <p className="mt-1 max-w-sm text-xs text-ink-500">{hint}</p>
    </div>
  );
}
