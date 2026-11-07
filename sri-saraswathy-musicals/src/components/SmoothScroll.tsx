"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

/**
 * App-wide smooth scrolling via Lenis. Renders nothing — drives the native
 * scroll with easing.
 *
 * Lenis is skipped entirely on /admin. The dashboard uses ordinary browser
 * scrolling, and Lenis's stopped state adds `overflow:hidden` to <html>
 * (see `.lenis.lenis-stopped` in globals.css), which would freeze the admin
 * pages from scrolling at all. The effect only re-runs when crossing the
 * admin boundary, so normal page-to-page navigation keeps one Lenis instance.
 */
export function SmoothScroll() {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin") ?? false;
  const lenisRef = useRef<Lenis | null>(null);

  // Every route change starts at the top. Next's scroll restoration fights with
  // Lenis, which left new pages opening part-way down; force it to the top here.
  // A plain hash link ("#play") is left alone so in-page anchors still work.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash) return;
    if (lenisRef.current) lenisRef.current.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    // Dashboard: let the browser scroll natively (no Lenis, no overflow lock).
    if (isAdmin) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });
    lenisRef.current = lenis;

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Smoothly scroll to in-page anchors (#featured, #play, …)
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.(
        'a[href^="#"]',
      ) as HTMLAnchorElement | null;
      if (!a) return;
      const id = a.getAttribute("href");
      if (!id || id === "#") return;
      const el = document.querySelector(id);
      if (el) {
        e.preventDefault();
        lenis.scrollTo(el as HTMLElement, { offset: -80 });
      }
    };
    document.addEventListener("click", onClick);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("click", onClick);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [isAdmin]);

  return null;
}
