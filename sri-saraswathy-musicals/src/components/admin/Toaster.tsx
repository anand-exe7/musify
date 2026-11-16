"use client";
/**
 * Renders whatever is in the toast queue, stacked above the page. Mounted once, at the root, so
 * any screen — admin or storefront — can raise a message with `toastOk` / `toastError`.
 */
import { useToasts } from "@/lib/store/toast";
import { Toast } from "./Toast";

export function Toaster() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);
  if (items.length === 0) return null;
  return (
    <>
      {items.map((t, i) => (
        <Toast
          key={t.id}
          message={t.message}
          tone={t.tone}
          // Each one sits above the last, so two messages never cover each other.
          offset={i * 64}
          ms={t.tone === "bad" ? 7000 : 4000}
          onClose={() => dismiss(t.id)}
        />
      ))}
    </>
  );
}
