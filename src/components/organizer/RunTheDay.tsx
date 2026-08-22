"use client";

import * as React from "react";
import { Clock, Flag, Loader2, Play } from "lucide-react";

import { Button } from "@/components/ui";
import type { EventState } from "@/lib/domain/events";
import {
  type EventFormat,
  ROUND_COUNTS,
  ROUND_LENGTHS,
} from "@/lib/supabase/useEventFormat";
import { cn } from "@/lib/utils";

/**
 * The two decisions a director actually makes on the morning, and one button.
 *
 * How long a round runs and how many there are depend on the room and the clock, not on
 * anything decided weeks earlier — so they are settings, and they are here rather than in a
 * settings screen nobody opens with sixty people waiting.
 *
 * Then one button. It publishes the round if it needs publishing, starts the clock at the
 * chosen length, and puts every phone and the television on the same screen. Anything that
 * takes three presses at the front of a hall is a thing that gets half-done.
 *
 * "Finish after this one" is the other half of the same idea: an event that is running late
 * ends a round early rather than dropping a round nobody knows about. It sets the total to
 * the round being played, so the standings, the certificates and the wall all agree that the
 * tournament is over.
 */
export function RunTheDay({
  format,
  round,
  phase,
  boardsTotal,
  busy,
  onFormat,
  onStart,
  onFinishAfterThis,
}: {
  format: EventFormat;
  round: number;
  phase: EventState | null;
  boardsTotal: number;
  busy: boolean;
  onFormat: (next: EventFormat) => void | Promise<void>;
  onStart: () => void | Promise<void>;
  onFinishAfterThis: () => void | Promise<void>;
}) {
  const running = phase === "round-active";
  const locked = round > 0;

  /*
   * What the one button is about to do, said before it is pressed.
   *
   * `round` is already the round about to be played — it reads 1 before anything is paired —
   * so adding one to it named the wrong round on the button while the correct round was
   * created. The label was wrong, not the pairing, which is the more embarrassing way round.
   */
  const next =
    boardsTotal === 0
      ? `Pair round ${round} and start the clock`
      : running
        ? `Round ${round} is running`
        : `Start round ${round} — ${format.roundMinutes} minutes`;

  return (
    <div className="mt-4 rounded-feature border border-line bg-[rgb(var(--c-surface-strong))] p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Choice
          label="Round length"
          suffix="min"
          options={ROUND_LENGTHS}
          value={format.roundMinutes}
          disabled={running}
          onPick={(roundMinutes) => void onFormat({ ...format, roundMinutes })}
        />

        <Choice
          label="Rounds"
          options={ROUND_COUNTS}
          value={format.rounds}
          /*
           * Still changeable once the day has started — shortening a tournament that is
           * running late is exactly when this is needed. Below the round being played it
           * would be a claim about the past, so that is refused by the buttons themselves.
           */
          min={Math.max(1, round)}
          onPick={(rounds) => void onFormat({ ...format, rounds })}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="lg"
          className="flex-1 min-w-[16rem]"
          icon={busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          disabled={busy || running}
          onClick={() => void onStart()}
        >
          {busy ? "Starting…" : next}
        </Button>

        {locked ? (
          <Button
            variant="secondary"
            icon={<Flag className="size-4" />}
            disabled={busy || format.rounds === round}
            onClick={() => void onFinishAfterThis()}
          >
            {format.rounds === round ? `Round ${round} is the last` : "Finish after this one"}
          </Button>
        ) : null}
      </div>

      <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted">
        <Clock className="mt-0.5 size-3 shrink-0" />
        One press does the lot — the boards, the clock, the wall and every phone. The
        television shows {format.roundMinutes} minutes because that is what is set here.
      </p>
    </div>
  );
}

function Choice({
  label,
  options,
  value,
  suffix,
  disabled,
  min,
  onPick,
}: {
  label: string;
  options: readonly number[];
  value: number;
  suffix?: string;
  disabled?: boolean;
  min?: number;
  onPick: (value: number) => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
      <div className="mt-1.5 flex gap-1.5">
        {options.map((option) => {
          const chosen = option === value;
          const refused = disabled || (min !== undefined && option < min);

          return (
            <button
              key={option}
              type="button"
              disabled={refused}
              onClick={() => onPick(option)}
              aria-pressed={chosen}
              className={cn(
                "num rounded-control border-2 px-4 py-2 text-[15px] font-extrabold transition-colors",
                chosen
                  ? "border-primary bg-primary text-white"
                  : "border-line bg-white text-ink hover:border-primary/45",
                refused && "cursor-not-allowed opacity-40",
              )}
            >
              {option}
              {suffix ? <span className="ml-0.5 text-[11px] font-bold">{suffix}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
