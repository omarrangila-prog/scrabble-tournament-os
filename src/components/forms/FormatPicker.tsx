"use client";

import * as React from "react";
import { AlertTriangle, Check, ChevronDown, Info, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui";
import {
  COMMON_FORMATS,
  formatWarnings,
  OTHER_FORMATS,
  recommendFormat,
} from "@/lib/domain/pairingFormats";
import { PairingSystem } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/**
 * Choosing a pairing format.
 *
 * Cards rather than a dropdown, because each format needs a line of
 * explanation to be choosable by someone running their first tournament. The
 * recommendation is marked, the consequence of an unusual choice is shown
 * before the event day, and rarer formats stay behind a disclosure so they do
 * not compete with the one most events want.
 */
export function FormatPicker({
  value,
  onChange,
  players,
  rounds,
}: {
  value: PairingSystem;
  onChange: (system: PairingSystem) => void;
  /** Expected entries, used to judge which formats fit. */
  players: number;
  rounds: number;
}) {
  const recommendation = recommendFormat(players, rounds);
  const warnings = formatWarnings(value, players, rounds);

  // Opened automatically when the current choice lives in the hidden list, so
  // the selection is never invisible.
  const selectedIsHidden = OTHER_FORMATS.some((f) => f.id === value);
  const [showMore, setShowMore] = React.useState(selectedIsHidden);

  const [lastValue, setLastValue] = React.useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    if (OTHER_FORMATS.some((f) => f.id === value)) setShowMore(true);
  }

  const card = (
    id: PairingSystem,
    label: string,
    summary: string,
    detail: string,
  ) => {
    const selected = value === id;
    const recommended = recommendation.system === id;

    return (
      <button
        key={id}
        type="button"
        onClick={() => onChange(id)}
        aria-pressed={selected}
        className={cn(
          "w-full rounded-feature border p-3.5 text-left transition-colors",
          selected
            ? "border-primary bg-primary-050"
            : "border-line bg-[rgb(var(--c-surface-strong))] hover:bg-[rgb(var(--c-surface-soft))]",
        )}
      >
        <span className="flex items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full border-2",
              selected ? "border-primary bg-primary text-white" : "border-line",
            )}
          >
            {selected ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "text-[14px] font-bold",
                  selected ? "text-primary" : "text-ink",
                )}
              >
                {label}
              </span>
              {recommended ? (
                <Badge tone="success">
                  <Sparkles className="mr-1 inline size-3" />
                  Recommended
                </Badge>
              ) : null}
            </span>

            <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">
              {summary}
            </span>

            {selected ? (
              <span className="mt-1.5 block text-[12px] leading-relaxed text-faint">
                {detail}
              </span>
            ) : null}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-2">
      {/* Why this one */}
      <p className="flex items-start gap-2 rounded-control bg-success-050 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#12855c]">
        <Sparkles className="mt-0.5 size-3.5 shrink-0" />
        <span>
          <strong className="font-semibold">
            Recommended:{" "}
            {COMMON_FORMATS.concat(OTHER_FORMATS).find(
              (f) => f.id === recommendation.system,
            )?.label ?? "Swiss System"}
            .
          </strong>{" "}
          {recommendation.reason}
        </span>
      </p>

      {COMMON_FORMATS.map((f) => card(f.id, f.label, f.summary, f.detail))}

      {/* Rarer formats stay out of the way until asked for. */}
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        aria-expanded={showMore}
        className="flex w-full items-center justify-center gap-1.5 rounded-control py-2 text-[12.5px] font-semibold text-muted transition-colors hover:text-ink"
      >
        <ChevronDown className={cn("size-4 transition-transform", showMore && "rotate-180")} />
        {showMore ? "Fewer formats" : "More formats"}
      </button>

      {showMore
        ? OTHER_FORMATS.map((f) => card(f.id, f.label, f.summary, f.detail))
        : null}

      {/* Consequences of the current choice */}
      {warnings.length ? (
        <div className="space-y-1.5 pt-1">
          {warnings.map((w, i) => (
            <p
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-control px-3.5 py-2.5 text-[12px] leading-relaxed",
                w.severity === "warning"
                  ? "bg-warning-050 text-[#a76d16]"
                  : "bg-[rgb(var(--c-surface-soft))] text-muted",
              )}
            >
              {w.severity === "warning" ? (
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <Info className="mt-0.5 size-3.5 shrink-0" />
              )}
              <span>{w.message}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
