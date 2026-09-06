"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MusicLoader } from "./MusicLoader";

/**
 * Intro splash shown on a hard page load. Guarantees the musical loader is on
 * screen for a minimum beat (so it doesn't just flash by), then fades away.
 * It does NOT re-show on in-app (client-side) navigation, since the root
 * layout — and therefore this component — stays mounted across those.
 */
export function Splash() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      setShow(false);
      document.body.style.overflow = "";
    }, 2600);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[200]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, filter: "blur(6px)" }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
        >
          <MusicLoader />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
