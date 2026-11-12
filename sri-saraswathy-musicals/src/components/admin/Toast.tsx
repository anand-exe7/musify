"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";

/**
 * A short confirmation that floats above the page and clears itself — used after a save, so the
 * admin sees that something happened without a banner pushing the page around.
 */
export function Toast({
  message,
  onClose,
  tone = "ok",
  ms = 4000,
}: {
  message: string;
  onClose: () => void;
  tone?: "ok" | "bad";
  ms?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, ms);
    return () => clearTimeout(t);
  }, [message, ms, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[120] flex justify-center px-4">
      <div
        role="status"
        className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm shadow-[0_20px_50px_-20px_rgba(10,9,8,0.6)] ${
          tone === "bad" ? "bg-danger text-white" : "bg-ink-900 text-ivory-50"
        }`}
        style={{ animation: "toast-in 220ms ease-out" }}
      >
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${tone === "bad" ? "bg-white/20" : "bg-gold-400 text-ink-900"}`}>
          {tone === "bad" ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </span>
        <span className="flex-1">{message}</span>
        <button onClick={onClose} aria-label="Dismiss" className="shrink-0 opacity-60 transition-opacity hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <style>{`@keyframes toast-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }`}</style>
    </div>,
    document.body,
  );
}
