"use client";
import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Use inside a `<Link>`: shows `icon` normally and a spinner while that link's page is opening, so a click always
 * gets an answer even when the next page is slow.
 */
export function LinkIcon({ icon, className }: { icon: ReactNode; className?: string }) {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className={cn("animate-spin", className)} aria-hidden /> : <>{icon}</>;
}

/** Use inside a `<Link>`: its text, swapped for e.g. "Opening…" while the page loads. */
export function LinkLabel({ label, pendingLabel = "Opening…" }: { label: ReactNode; pendingLabel?: ReactNode }) {
  const { pending } = useLinkStatus();
  return <>{pending ? pendingLabel : label}</>;
}
