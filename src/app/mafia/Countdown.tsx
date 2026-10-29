"use client";

import * as React from "react";

import { countdownTo, startInstant } from "@/lib/domain/mafia";

import styles from "./mafia.module.css";
import { NOIR } from "./noir";

/**
 * How long until the night, in three little flip-cards: days, hours, minutes.
 *
 * It starts empty and fills in after the page opens, because "now" is a thing only the visitor's
 * own clock knows — drawing it on the server would put a stale number in the page and then
 * change it under their eyes. It ticks every thirty seconds, which is as fine as minutes need.
 * Once the night has started it says so, and once it is over it says nothing at all.
 */
export function Countdown({
  date,
  start,
  end,
}: {
  date: string | undefined;
  start: string | undefined;
  end: string | undefined;
}) {
  const startMs = startInstant(date, start);
  const endMs = startInstant(date, end);

  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    /* Both through timers: a state change straight in an effect body would render twice for nothing. */
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    const every = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);

  if (now === null) return <div className="h-[74px]" aria-hidden />;
  const state = countdownTo(startMs, endMs, now);
  if (!state || state.phase === "over") return null;

  if (state.phase === "now") {
    return (
      <p
        className="text-center text-[13px] font-bold uppercase tracking-[0.3em]"
        style={{ color: NOIR.redBright }}
      >
        Tonight &mdash; the doors are open
      </p>
    );
  }

  const cells: [string, number][] = [
    ["days", state.days],
    ["hours", state.hours],
    ["mins", state.minutes],
  ];

  return (
    <div className="text-center">
      <p
        className="text-[10.5px] font-bold uppercase tracking-[0.34em]"
        style={{ color: NOIR.muted }}
      >
        The night begins in
      </p>
      <div
        className="mt-2.5 flex items-stretch justify-center gap-2.5"
        role="timer"
        aria-live="off"
      >
        {cells.map(([label, value]) => (
          <div key={label} className={styles.flip}>
            <span
              className="num text-[30px] font-black leading-none"
              style={{ fontFamily: NOIR.serif }}
            >
              {String(value).padStart(2, "0")}
            </span>
            <span
              className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.2em]"
              style={{ color: NOIR.muted }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
