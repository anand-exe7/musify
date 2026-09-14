import { Loader2, WifiOff } from "lucide-react";

/** Full-width "still fetching" panel — shown before the first load resolves. */
export function LoadingPanel({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-ink-100 bg-ivory-50 py-24 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-gold-500" />
      <p className="mt-3 text-sm font-medium text-ink-500">{label}</p>
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
      <WifiOff className="h-6 w-6 text-danger" />
      <p className="mt-3 text-sm font-bold text-ink-900">{label}</p>
      <p className="mt-1 max-w-sm text-xs text-ink-500">{hint}</p>
    </div>
  );
}
