"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useGuidedDemo } from "@/lib/store/guidedDemo";
import { cn } from "@/lib/utils";

/**
 * Presenter-facing walkthrough. It docks to the bottom of the screen, moves the
 * presenter to the right route for each step and spotlights the relevant panel
 * without blocking interaction — the presenter still drives the real interface.
 */
export function GuidedDemoOverlay() {
  const { active, step, next, prev, stop, finish, steps } = useGuidedDemo();
  const router = useRouter();
  const pathname = usePathname();
  const current = steps[step];
  const [rect, setRect] = React.useState<DOMRect | null>(null);

  // Move to the step's route when it differs from the current one.
  React.useEffect(() => {
    if (!active || !current) return;
    const target = current.route.split("?")[0];
    if (pathname !== target) router.push(current.route);
  }, [active, current, pathname, router]);

  // Track the highlighted element so the spotlight follows layout changes.
  React.useEffect(() => {
    if (!active || !current?.anchor) {
      // Clear asynchronously so this never fires during the effect body.
      const id = window.setTimeout(() => setRect(null), 0);
      return () => window.clearTimeout(id);
    }
    let frame = 0;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${current.anchor}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
      frame = window.requestAnimationFrame(measure);
    };
    frame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(frame);
  }, [active, current]);

  if (!active || !current) return null;
  const last = step === steps.length - 1;

  return (
    <>
      {/* Spotlight ring — pointer-events-none so the UI stays usable. */}
      <AnimatePresence>
        {rect ? (
          <motion.div
            key={current.anchor}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed z-[60] rounded-feature ring-2 ring-primary ring-offset-4 ring-offset-transparent"
            style={{
              top: rect.top - 4,
              left: rect.left - 4,
              width: rect.width + 8,
              height: rect.height + 8,
              boxShadow: "0 0 0 9999px rgba(17,22,43,0.14)",
            }}
          />
        ) : null}
      </AnimatePresence>

      <motion.div
        layout
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed inset-x-3 bottom-3 z-[75] mx-auto max-w-3xl sm:inset-x-6"
      >
        <div className="glass-raised rounded-card p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary text-white">
              <Sparkles className="size-4.5" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-primary">
                  Step {step + 1} of {steps.length}
                </p>
                <span className="text-[12px] text-muted">·</span>
                <p className="text-[12.5px] font-medium text-ink">{current.title}</p>
              </div>
              <p className="mt-1 text-[14px] leading-relaxed text-ink">{current.message}</p>
              {current.action ? (
                <p className="mt-1.5 inline-flex rounded-[9px] bg-secondary-050 px-2.5 py-1 text-[12.5px] text-[#2b7fd4]">
                  {current.action}
                </p>
              ) : null}

              <div className="mt-3 flex items-center gap-1">
                {steps.map((s, i) => (
                  <span
                    key={s.id}
                    className={cn(
                      "h-1 flex-1 rounded-full transition-colors",
                      i <= step ? "bg-primary" : "bg-[rgb(var(--c-line-strong))]",
                    )}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={stop}
              aria-label="Exit guided demo"
              className="rounded-full p-1.5 text-faint transition-colors hover:bg-[rgb(var(--c-line))] hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={stop}>
              Exit demo
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={prev}
                disabled={step === 0}
                icon={<ArrowLeft className="size-3.5" />}
              >
                Back
              </Button>
              {last ? (
                <Button
                  variant="success"
                  size="sm"
                  onClick={finish}
                  icon={<Check className="size-3.5" />}
                >
                  Finish
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={next}
                  icon={<ArrowRight className="size-3.5" />}
                >
                  Next
                </Button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

/** Shown once the ten-step story completes. */
export function GuidedDemoSummary() {
  const { completed, finish } = useGuidedDemo();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const [lastCompleted, setLastCompleted] = React.useState(completed);
  if (lastCompleted !== completed) {
    setLastCompleted(completed);
    setOpen(completed);
  }
  if (!open) return null;

  const close = () => {
    setOpen(false);
    finish();
  };

  return (
    <div className="fixed inset-0 z-[85] grid place-items-center p-4">
      <div className="absolute inset-0 bg-[rgb(17_22_43/0.34)] backdrop-blur-[3px]" onClick={close} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-lg overflow-hidden rounded-feature border border-[rgb(var(--glass-border))] bg-[#fcfcff]/98 p-7 text-center shadow-[0_30px_80px_rgba(44,55,96,0.24)]"
      >
        <span className="mx-auto grid size-12 place-items-center rounded-[15px] bg-success-050 text-success">
          <Check className="size-6" />
        </span>
        <h2 className="mt-4 text-[21px] font-semibold tracking-[-0.02em] text-ink">
          Round 6 generated successfully
        </h2>
        <ul className="mx-auto mt-4 grid max-w-xs gap-1.5 text-left text-[13.5px] text-ink">
          {["64 pairings", "0 repeat opponents", "0 duplicate players", "0 board conflicts"].map(
            (l) => (
              <li key={l} className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-success" />
                {l}
              </li>
            ),
          )}
        </ul>
        <p className="mt-5 text-[15px] font-medium text-ink">
          Blufy&rsquo;s AlphaBattle is ready to run your next championship.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            variant="primary"
            onClick={() => {
              close();
              router.push("/app/scope");
            }}
          >
            Review Implementation Scope
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              close();
              router.push("/app/scope#schedule");
            }}
          >
            Schedule Setup
          </Button>
        </div>
        <button
          onClick={close}
          className="mt-4 text-[12.5px] text-muted underline underline-offset-2 hover:text-ink"
        >
          Continue exploring the demo
        </button>
      </motion.div>
    </div>
  );
}
