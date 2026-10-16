"use client";
import dynamic from "next/dynamic";
import { LazyMount } from "@/components/ui/LazyMount";

// The playable keyboard (Web Audio and a lot of code) only loads when the visitor scrolls near it.
const PlayableSection = dynamic(() => import("@/components/home/PlayableSection").then((m) => m.PlayableSection), { ssr: false });

export function LazyPlayable() {
  return (
    <LazyMount minHeight="40rem" rootMargin="600px">
      <PlayableSection />
    </LazyMount>
  );
}
