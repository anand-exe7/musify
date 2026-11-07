"use client";
import Image from "next/image";
import { motion } from "framer-motion";

/**
 * Minimal loading visual — a large centred logo and a single quiet progress
 * line. Nothing else. Used by both the route-level loading.tsx and <Splash/>.
 */
export function MusicLoader() {
  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden bg-[#FAF6EC]">
      {/* soft warm glow behind the mark */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50% 40% at 50% 46%, rgba(201,162,75,0.12) 0%, rgba(201,162,75,0) 64%)",
        }}
      />

      <div className="relative flex flex-col items-center gap-8 px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="relative h-28 w-[260px] sm:h-36 sm:w-[340px]"
        >
          <Image
            src="/Logo.png"
            alt="Sri Saraswathy Musicals"
            fill
            sizes="340px"
            priority
            className="object-contain"
          />
        </motion.div>

        {/* indeterminate gold progress */}
        <div className="relative h-[3px] w-40 overflow-hidden rounded-full bg-ink-200/60">
          <motion.span
            className="absolute inset-y-0 left-0 w-1/2 rounded-full"
            style={{ background: "linear-gradient(90deg, transparent, #C9A24B, transparent)" }}
            animate={{ x: ["-120%", "240%"] }}
            transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>

      <span className="sr-only" role="status">Loading Sri Saraswathy Musicals</span>
    </div>
  );
}
