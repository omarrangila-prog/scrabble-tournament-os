"use client";

/**
 * Profile-specific presentation primitives.
 *
 * These build on the shared design tokens in `components/ui` — same radii,
 * shadows, glass treatment and palette — so the profile reads as part of the
 * product rather than a separate page.
 */

import * as React from "react";
import { motion, useInView, useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

/** Counts up to `value` once scrolled into view. Respects reduced motion. */
export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { duration: 900, bounce: 0 });

  // Start at the final value when motion is reduced, so no animation is needed.
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [display, setDisplay] = React.useState(reduced ? value.toFixed(decimals) : "0");

  React.useEffect(() => {
    if (!reduced && inView) motionValue.set(value);
  }, [inView, value, motionValue, reduced]);

  React.useEffect(
    () => spring.on("change", (v) => setDisplay(v.toFixed(decimals))),
    [spring, decimals],
  );

  return (
    <span ref={ref} className={cn("num tabular-nums", className)}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

/** Circular progress ring used for win rate and completion figures. */
export function ProgressRing({
  value,
  size = 92,
  stroke = 8,
  tone = "primary",
  label,
  sublabel,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: "primary" | "success" | "warning" | "critical";
  label?: React.ReactNode;
  sublabel?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color =
    tone === "success" ? "#32C997" : tone === "warning" ? "#F5A94A" : tone === "critical" ? "#EF5B72" : "#6D5DFB";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(17 22 43 / 0.08)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          whileInView={{ strokeDashoffset: circumference - (pct / 100) * circumference }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-[17px] font-semibold leading-none text-ink">{label}</p>
          {sublabel ? <p className="mt-0.5 text-[10.5px] text-muted">{sublabel}</p> : null}
        </div>
      </div>
    </div>
  );
}

/** Statistic tile used across the profile dashboard sections. */
export function ProfileStat({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
  delay = 0,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning" | "critical";
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.35, delay }}
      className="glass rounded-card p-4 transition-shadow hover:shadow-[0_18px_44px_rgba(44,55,96,0.13)]"
    >
      <div className="flex items-start gap-3">
        {icon ? (
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-control",
              tone === "neutral" && "bg-[rgb(var(--c-line))] text-muted",
              tone === "primary" && "bg-primary-050 text-primary",
              tone === "success" && "bg-success-050 text-[#1b8f68]",
              tone === "warning" && "bg-warning-050 text-[#b4741f]",
              tone === "critical" && "bg-critical-050 text-[#c93a51]",
            )}
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-muted">{label}</p>
          <p className="mt-0.5 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            {value}
          </p>
          {sub ? <p className="mt-0.5 text-[11.5px] text-muted">{sub}</p> : null}
        </div>
      </div>
    </motion.div>
  );
}

/** Skeleton placeholder matching the profile card geometry. */
export function ProfileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-card bg-gradient-to-r from-[rgb(17_22_43/0.05)] via-[rgb(17_22_43/0.08)] to-[rgb(17_22_43/0.05)]",
        className,
      )}
    />
  );
}

/** Full-screen image viewer for the player portrait. */
export function Lightbox({
  open,
  onClose,
  children,
  caption,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  caption?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center p-6">
      <div
        className="absolute inset-0 bg-[rgb(17_22_43/0.55)] backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        role="dialog"
        aria-modal="true"
        aria-label={caption ?? "Player portrait"}
        className="relative text-center"
      >
        {children}
        {caption ? <p className="mt-3 text-[13px] text-white/90">{caption}</p> : null}
        <button
          onClick={onClose}
          className="mt-4 rounded-control bg-[rgb(var(--c-surface-strong))] px-4 py-2 text-[13px] font-medium text-ink"
        >
          Close
        </button>
      </motion.div>
    </div>
  );
}
