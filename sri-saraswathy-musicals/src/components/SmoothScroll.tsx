"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

/**
 * App-wide smooth scrolling via Lenis.
 * Renders nothing — just drives the native scroll with easing.
 *
 * The Lenis instance is created ONCE for the whole session and reused across
 * client-side navigations. (Previously it was destroyed and rebuilt — along
 * with its requestAnimationFrame loop — on every route change, which made
 * page-to-page transitions feel laggy.) On /admin it is paused, since the
 * dashboard has its own scrolling panels.
 */
export function SmoothScroll() {
  const pathname = usePathname();
  const lenisRef = useRef<Lenis | null>(null);

  // Create the instance a single time.
  useEffect(() => {
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
  }, []);

  // Pause smooth scroll on the dashboard; resume + reset to top elsewhere.
  useEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;
    if (pathname?.startsWith("/admin")) {
      lenis.stop();
    } else {
      lenis.start();
    }
  }, [pathname]);

  return null;
}
