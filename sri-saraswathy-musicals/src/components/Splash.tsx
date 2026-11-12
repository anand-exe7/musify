"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { MusicLoader } from "./MusicLoader";

/**
 * Intro splash on a hard load of the HOME page only. It is an arrival moment, not a loading screen:
 * landing straight on a product or the shop (a link, a search result, a reload) used to sit behind nearly
 * two seconds of logo before anything could be read. It does NOT re-show on in-app navigation, since the
 * root layout — and therefore this component — stays mounted across those.
 */
export function Splash() {
  const pathname = usePathname();
  const [show, setShow] = useState(true);
  // Only the front door gets it: never the dashboard, invoices or quotations, and never a deep link.
  const splashHere = (pathname ?? "/") === "/";

  useEffect(() => {
    if (!splashHere) return;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      setShow(false);
      document.body.style.overflow = "";
    }, 700);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = "";
    };
  }, [splashHere]);

  if (!splashHere) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[200]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, filter: "blur(6px)" }}
          transition={{ duration: 0.45, ease: "easeInOut" }}
        >
          <MusicLoader />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
