"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronRight, Loader2 } from "lucide-react";

import { Button, Card } from "@/components/ui";
import type { Runbook, RunbookStep, StepAction } from "@/lib/domain/runbook";
import { cn } from "@/lib/utils";

/**
 * The event day, on one card, as seven numbered steps.
 *
 * A tester could not work out how to operate Round 1 and said they would rather run the
 * tournament on paper. The control room gave them twenty-one buttons of equal weight and a
 * dropdown of state names; nothing on it said which of the twenty-one to press.
 *
 * So: the whole day, always visible, numbered. What is finished is ticked and quiet. What is
 * next is the only thing with a button on it. What is in the way is said in a sentence
 * beside the step it blocks, rather than as a toast that has already gone by the time
 * somebody looks up.
 *
 * Everything below is derived from `runbookFor`. This component decides nothing about the
 * tournament — it renders a decision and reports which button was pressed, so there is one
 * implementation of locking a roster and not two.
 */
export function EventDayRunbook({
  runbook,
  busy,
  onAction,
}: {
  runbook: Runbook;
  /** The id of the step whose action is running, so only that button spins. */
  busy?: string | null;
  /** The caller owns every write. Navigation is handled here, since it writes nothing. */
  onAction: (action: StepAction) => void;
}) {
  const router = useRouter();

  const act = (action: StepAction) => {
    if (action.kind === "navigate") {
      router.push(ROUTE[action.to]);
      return;
    }
    onAction(action);
  };

  return (
    <Card className="overflow-hidden" data-runbook>
      {/*
        The header answers the two questions somebody walking up to the laptop has, in the
        order they have them: where are we, and is anything wrong.
      */}
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-[17px] font-extrabold text-ink">{runbook.headline}</h2>
          <p className="text-[13px] text-muted">{runbook.status}</p>
        </div>

        {runbook.blocker ? (
          <p className="mt-2.5 flex items-start gap-2 rounded-control bg-warning-050 px-3 py-2.5 text-[13px] font-semibold leading-relaxed text-warning-700">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {runbook.blocker}
          </p>
        ) : null}
      </div>

      <ol className="divide-y divide-line">
        {runbook.steps.map((step) => (
          <Step key={step.id} step={step} busy={busy === step.id} onAct={act} />
        ))}
      </ol>
    </Card>
  );
}

const ROUTE: Record<"check-in" | "score-entry" | "standings", string> = {
  "check-in": "/app/desk",
  "score-entry": "/app/score-entry",
  standings: "/app/live-event",
};

function Step({
  step,
  busy,
  onAct,
}: {
  step: RunbookStep;
  busy: boolean;
  onAct: (action: StepAction) => void;
}) {
  const live = step.status === "now" || step.status === "blocked";

  return (
    <li
      data-step={step.id}
      data-status={step.status}
      data-current={live ? "true" : "false"}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5 sm:flex-nowrap",
        /* The current step is the only one that draws the eye. */
        live && "bg-primary-050",
      )}
    >
      {/* Ticked when done, numbered when not — a number nobody has reached yet is still a place. */}
      <span
        className={cn(
          "num grid size-7 shrink-0 place-items-center rounded-full text-[12.5px] font-extrabold",
          step.status === "done" && "bg-success-100 text-success-700",
          step.status === "now" && "bg-primary text-white",
          step.status === "blocked" && "bg-warning-100 text-warning-700",
          step.status === "later" && "bg-[rgb(var(--c-surface-strong))] text-faint",
        )}
      >
        {step.status === "done" ? <Check className="size-3.5" strokeWidth={3} /> : step.number}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[14px]",
            live ? "font-bold text-ink" : step.status === "done" ? "font-semibold text-muted" : "font-semibold text-faint",
          )}
        >
          {step.title}
        </span>
        <span className={cn("block text-[12.5px]", live ? "text-muted" : "text-faint")}>
          {step.detail}
        </span>
        {/*
          The blocker is stated once, in the header, and not repeated here.
          Both were rendered at first and the same sentence twice on one small card reads as
          a fault in the page rather than as emphasis. The header is where the eye lands; the
          step is already the highlighted row with the only button on it, so it does not need
          to say why as well.
        */}
      </span>

      {step.action ? (
        <Button
          variant={step.status === "blocked" ? "secondary" : "primary"}
          size="sm"
          disabled={busy}
          onClick={() => onAct(step.action!)}
          icon={
            busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ChevronRight className="size-3.5" />
            )
          }
          className="w-full shrink-0 sm:w-auto"
        >
          {step.action.label}
        </Button>
      ) : null}
    </li>
  );
}
