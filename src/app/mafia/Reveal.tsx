"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import styles from "./mafia.module.css";

/**
 * Fades a block up into place the first time it scrolls into view. For anybody who has asked for
 * less motion it is just a block: nothing hidden, nothing moving.
 */
export function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A pill that floats at the foot of the screen until the form itself is in view, then gets out
 * of the way. The form sits below the poster-like top of the page, and on a phone that is a long
 * scroll for somebody who has already decided to come; one tap takes them there.
 */
export function JumpToForm({ targetId }: { targetId: string }) {
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || typeof IntersectionObserver === "undefined") return;

    /* Hidden once any part of the form is on screen, and back when it has scrolled away. */
    const watcher = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      {
        threshold: 0.05,
      },
    );
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [targetId]);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          key="jump"
          type="button"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.25 }}
          onClick={() =>
            document
              .getElementById(targetId)
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          className={`${styles.cta} fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full px-6 py-3 text-[15px] font-bold text-white`}
          style={{ boxShadow: "0 14px 34px -8px rgba(179,38,43,0.8)" }}
        >
          <span aria-hidden>♠</span>
          Sign me up
          <span aria-hidden>↓</span>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
