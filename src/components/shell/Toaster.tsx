"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useStore } from "@/lib/store/useStore";
import { cn } from "@/lib/utils";

const ICONS = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  critical: XCircle,
};

export function Toaster() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="glass-raised pointer-events-auto flex items-start gap-3 rounded-compact p-3.5"
            >
              <span
                className={cn(
                  "mt-0.5 grid size-7 shrink-0 place-items-center rounded-[9px]",
                  t.tone === "success" && "bg-success-050 text-[#1b8f68]",
                  t.tone === "info" && "bg-secondary-050 text-[#2b7fd4]",
                  t.tone === "warning" && "bg-warning-050 text-[#b4741f]",
                  t.tone === "critical" && "bg-critical-050 text-[#c93a51]",
                )}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-ink">{t.title}</p>
                {t.description ? (
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{t.description}</p>
                ) : null}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="rounded-full p-1 text-faint transition-colors hover:bg-[rgb(var(--c-line))] hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
