"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Renders its children only once the spot is about to scroll into view (and keeps them
 * from then on). Until then it holds the space with an empty box so the page doesn't jump.
 * Pair it with `next/dynamic` so the section's code isn't downloaded until it is needed.
 */
export function LazyMount({ children, minHeight = "24rem", rootMargin = "400px" }: { children: ReactNode; minHeight?: string; rootMargin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (typeof IntersectionObserver === "undefined") { setShow(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setShow(true); io.disconnect(); }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [show, rootMargin]);

  return <div ref={ref} style={show ? undefined : { minHeight }}>{show ? children : null}</div>;
}
