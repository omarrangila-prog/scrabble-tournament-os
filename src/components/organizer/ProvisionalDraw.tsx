"use client";

import * as React from "react";
import { Clock } from "lucide-react";

import { Badge, Card } from "@/components/ui";
import { provisionalDraw, provisionalLine, lockWarnings, type ProvisionalPlayer } from "@/lib/domain/provisional";
import { cn } from "@/lib/utils";

/**
 * The draw as it stands while people are still arriving.
 *
 * Shown before the roster is locked and never after. Its whole job is to answer, at a glance,
 * the question a director is actually asking during check-in: is this room going to pair up,
 * or is somebody going to be left out?
 *
 * Marked provisional everywhere, loudly, because a screen full of names beside table-looking
 * pairs is exactly the kind of thing somebody reads out to the room. Nothing here is written
 * anywhere, nothing here is a table number, and the real draw — made by the engine from the
 * locked roster, against the standings and the opponent history — will not look like this.
 */
export function ProvisionalDraw({
  players,
  divisions,
  locked,
}: {
  /** Everybody checked in, right now. */
  players: ProvisionalPlayer[];
  divisions: string[];
  /** Once the roster is locked this stops being a guess, so it stops being shown. */
  locked: boolean;
}) {
  if (locked) return null;

  const draw = provisionalDraw(players, divisions);
  const warnings = lockWarnings(draw);

  if (draw.arrived === 0) return null;

  return (
    <Card className="mt-3 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted" />
          <h3 className="text-[14px] font-bold text-ink">How the room would pair</h3>
        </div>
        {/*
          Said as a badge rather than as small print. This is the one thing somebody must not
          misunderstand about this card.
        */}
        <Badge tone="warning">Provisional — not published</Badge>
      </div>

      <div className="divide-y divide-line">
        {draw.divisions
          .filter((d) => d.arrived > 0)
          .map((d) => (
            <div key={d.division} className="px-4 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-[13.5px] font-semibold capitalize text-ink">
                  {d.division.replace(/-/g, " ")}
                </p>
                <p
                  className={cn(
                    "text-[12.5px]",
                    d.waiting ? "font-semibold text-warning-700" : "text-muted",
                  )}
                >
                  {provisionalLine(d)}
                </p>
              </div>
            </div>
          ))}
      </div>

      {warnings.length > 0 ? (
        <div className="border-t border-line bg-[rgb(var(--c-surface-soft))] px-4 py-2.5">
          {warnings.map((w) => (
            <p key={w} className="text-[12.5px] leading-relaxed text-muted">
              {w}
            </p>
          ))}
        </div>
      ) : null}

      <p className="border-t border-line px-4 py-2 text-[11.5px] leading-relaxed text-faint">
        Pairs form in arrival order here, so you can see the room filling up. The real draw is
        made from the locked roster against the standings, and will look different.
      </p>
    </Card>
  );
}
