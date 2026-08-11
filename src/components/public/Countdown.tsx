"use client";

import * as React from "react";

/**
 * How long until the event starts.
 *
 * A date on a card is information; "in 12 days" is a reason to act now. It is also the
 * one number on this page that changes on its own, which is what makes the card feel live
 * rather than printed.
 *
 * Nothing here is invented — it counts to the event's own start, and when that moment
 * passes it says so rather than counting into negative numbers or freezing at zero.
 */

export interface CountdownProps {
  /** ISO date, `YYYY-MM-DD`. */
  startDate: string;
  /** `HH:MM`, local to the venue. */
  startTime?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The event's start as an instant.
 *
 * Pinned to +05:00 rather than to the reader's clock. The event happens in Karachi at
 * midday whether the reader is in Karachi or not, and a visitor abroad being told it
 * starts at a different hour would simply be wrong.
 */
function startsAt(startDate: string, startTime = "12:00"): number {
  return new Date(`${startDate}T${startTime}:00+05:00`).getTime();
}

/**
 * Now, as a subscription rather than a render-time read.
 *
 * `Date.now()` called during render makes the component impure — two renders in the same
 * frame can disagree — so the clock is an external store the component subscribes to. It
 * also means one timer serves every countdown on the page instead of one each.
 */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (!timer) timer = setInterval(() => listeners.forEach((l) => l()), 1000);

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/*
 * The server has no clock the client will agree with, so it returns 0 and the first client
 * render replaces it. Returning `Date.now()` here instead would guarantee a hydration
 * mismatch on every load.
 */
const nowSnapshot = () => Date.now();
const serverSnapshot = () => 0;

export function Countdown({ startDate, startTime, className, style }: CountdownProps) {
  const now = React.useSyncExternalStore(subscribe, nowSnapshot, serverSnapshot);

  /* Nothing until the clock is the browser's, so the server and client markup agree. */
  if (now === 0) return null;

  const remaining = startsAt(startDate, startTime) - now;

  if (remaining <= 0) {
    return (
      <p className={className} style={style}>
        Happening now
      </p>
    );
  }

  const totalMinutes = Math.floor(remaining / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  /*
   * The unit that matters changes as the event approaches. A month out, minutes are noise;
   * on the morning itself, days are the only thing that would be.
   */
  const label =
    days > 0
      ? `${days} ${days === 1 ? "day" : "days"} and ${hours} ${hours === 1 ? "hour" : "hours"} to go`
      : hours > 0
        ? `${hours} ${hours === 1 ? "hour" : "hours"} and ${minutes} ${minutes === 1 ? "minute" : "minutes"} to go`
        : `${minutes} ${minutes === 1 ? "minute" : "minutes"} to go`;

  return (
    <p className={className} style={style} aria-live="off">
      {label}
    </p>
  );
}
