"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Compass } from "lucide-react";

import { Badge, Button, Card, CardHeader } from "@/components/ui";
import {
  phaseGuidance,
  type PhaseAction,
  type WorkspaceTab,
} from "@/lib/domain/eventPhase";
import { EVENT_STATE_LABEL, type EventState } from "@/lib/domain/events";

/**
 * Where the event is, and the one thing to do next.
 *
 * `phaseGuidance` has always known this — a table naming, for every phase, the state in
 * plain language, what happens next, one primary action and a short list of related ones.
 * It was rendered nowhere. So the rules existed, and were tested, while the director saw a
 * dropdown of nine phase names with nothing to say which one to pick or what it would do.
 *
 * Every action states its consequence, because each of these changes what a room full of
 * people sees on their phones. Anything irreversible confirms first.
 */

/** Where each workspace tab lives. */
const TAB_ROUTE: Record<WorkspaceTab, string> = {
  payments: "/app/payments",
  live: "/app/live-event",
  awards: "/app/certificates",
  analytics: "/app/analytics",
};

export function PhaseGuidance({
  state,
  onTransition,
  onHandler,
  busy = false,
}: {
  state: EventState;
  /** Moves the event. The caller owns the write and the reporting. */
  onTransition: (to: EventState) => void;
  /** Screen-specific actions, by action id. Unhandled ids are not offered. */
  onHandler?: Record<string, () => void>;
  busy?: boolean;
}) {
  const router = useRouter();
  const guidance = phaseGuidance(state);

  /*
   * A handler action with nothing behind it would be a button that does nothing, so it is
   * dropped rather than rendered dead.
   */
  const runnable = (a: PhaseAction) => a.kind !== "handler" || !!onHandler?.[a.id];

  const act = (a: PhaseAction) => {
    if (a.kind === "navigate" && a.tab) {
      router.push(TAB_ROUTE[a.tab]);
      return;
    }

    if (a.kind === "transition" && a.to) {
      if (
        a.confirm &&
        !window.confirm(
          `${a.label}?\n\nThis moves the event to "${EVENT_STATE_LABEL[a.to]}" and cannot be undone from here.`,
        )
      ) {
        return;
      }
      onTransition(a.to);
      return;
    }

    if (a.kind === "handler") onHandler?.[a.id]?.();
  };

  const secondary = guidance.secondary.filter(runnable);

  return (
    <Card>
      <CardHeader
        title="What to do next"
        subtitle={guidance.status}
        icon={<Compass className="size-4.5" />}
        action={<Badge tone="neutral">{EVENT_STATE_LABEL[state]}</Badge>}
      />
      <div className="px-5 pb-5">
        <p className="text-[13.5px] leading-relaxed text-muted">{guidance.next}</p>

        <div className="mt-3.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {runnable(guidance.primary) ? (
            <Button
              variant="primary"
              icon={<ArrowRight className="size-4" />}
              disabled={busy}
              onClick={() => act(guidance.primary)}
              className="w-full sm:w-auto"
            >
              {guidance.primary.label}
            </Button>
          ) : null}

          {secondary.map((a) => (
            <Button
              key={a.id}
              variant="secondary"
              disabled={busy}
              onClick={() => act(a)}
              className="w-full sm:w-auto"
            >
              {a.label}
            </Button>
          ))}
        </div>

        {/*
          * The reason for the primary action, spelled out. "Open check-in" and "Players
          * can mark themselves present" are different amounts of information, and the
          * second is the one that decides whether now is the right moment.
          */}
        {guidance.primary.hint ? (
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-faint">
            {guidance.primary.hint}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
