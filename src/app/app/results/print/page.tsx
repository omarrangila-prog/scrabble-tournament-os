"use client";

import * as React from "react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui";
import { useCurrentEvent } from "@/lib/supabase/useCurrentEvent";
import { useGames } from "@/lib/supabase/useGames";
import { useRoster } from "@/lib/supabase/useRoster";

/**
 * Pairing sheets and score sheets, for paper.
 *
 * The backup that matters. The 23 August event finished on hand-written pairings after the
 * software stopped being usable mid-round, and the reason that was painful rather than merely
 * annoying is that nobody could print what the software already knew. A tournament should be
 * able to carry on through a flat battery, a dropped connection or a laptop somebody stood on.
 *
 * Two sheets, because they are read by different people in different places:
 *
 *   Pairings     goes on the wall. Large type, one block per category, table order, so
 *                somebody standing two feet away can find their own name and table.
 *   Score sheets go to the tables. One slip per board with room to write both scores and
 *                initial them, which is what the desk types in afterwards.
 *
 * Deliberately its own route rather than a modal. Printing a modal prints the page behind it,
 * and a director discovering that at the moment they need paper is the whole problem again.
 */
export default function PrintPairingsPage() {
  const currentEvent = useCurrentEvent();
  const roster = useRoster(currentEvent.eventId);
  const games = useGames(currentEvent.eventId);

  const [sheet, setSheet] = React.useState<"pairings" | "scores">("pairings");

  const round = games.round;
  const nameOf = (id: string | null) =>
    id ? roster.players.find((p) => p.id === id)?.fullName ?? "Unknown player" : "Bye";
  const numberOf = (id: string | null) =>
    id ? roster.players.find((p) => p.id === id)?.playerId ?? "" : "";

  const boards = games.games
    .filter((g) => g.round === round)
    .sort((a, b) => a.board - b.board);

  /* One block per category: that is how the wall is read and how the room is seated. */
  const byDivision = React.useMemo(() => {
    const seen = new Map<string, typeof boards>();
    for (const b of boards) {
      const division = b.division || "unspecified";
      seen.set(division, [...(seen.get(division) ?? []), b]);
    }
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [boards]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-5 print:max-w-none print:px-0 print:py-0">
      {/* Everything in here is for the screen. None of it belongs on the paper. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-[20px] font-extrabold text-ink">Print — round {round}</h1>
          <p className="text-[13px] text-muted">
            {boards.length} board{boards.length === 1 ? "" : "s"} across{" "}
            {byDivision.length} categor{byDivision.length === 1 ? "y" : "ies"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={sheet === "pairings" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setSheet("pairings")}
          >
            Pairing sheet
          </Button>
          <Button
            variant={sheet === "scores" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setSheet("scores")}
          >
            Score sheets
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Printer className="size-3.5" />}
            onClick={() => window.print()}
          >
            Print
          </Button>
        </div>
      </div>

      {boards.length === 0 ? (
        <p className="text-[14px] text-muted print:hidden">
          Nothing is published for round {round} yet.
        </p>
      ) : sheet === "pairings" ? (
        <PairingSheet round={round} byDivision={byDivision} nameOf={nameOf} numberOf={numberOf} />
      ) : (
        <ScoreSheets round={round} boards={boards} nameOf={nameOf} numberOf={numberOf} />
      )}
    </div>
  );
}

/**
 * The wall sheet.
 *
 * Big. A pairing sheet is read by a queue of people leaning in, so the names are set at a
 * size that survives being taped to a wall and looked at from a step back — which is a larger
 * size than anything else in this application uses.
 */
function PairingSheet({
  round,
  byDivision,
  nameOf,
  numberOf,
}: {
  round: number;
  byDivision: [string, { board: number; playerA: string; playerB: string | null; aPlaysFirst: boolean | null }[]][];
  nameOf: (id: string | null) => string;
  numberOf: (id: string | null) => string;
}) {
  return (
    <div className="space-y-8 print:space-y-6">
      {byDivision.map(([division, list]) => (
        <section key={division} className="break-inside-avoid print:break-after-page">
          <h2 className="mb-2 border-b-2 border-black pb-1 text-[26px] font-extrabold uppercase tracking-wide text-black print:text-[24pt]">
            {division.replace(/-/g, " ")}
          </h2>
          <p className="mb-3 text-[15px] font-semibold text-black print:text-[12pt]">
            Round {round}
          </p>

          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-black text-left">
                <th className="w-[70px] py-1.5 text-[14px] font-bold uppercase text-black print:text-[11pt]">Table</th>
                <th className="py-1.5 text-[14px] font-bold uppercase text-black print:text-[11pt]">First</th>
                <th className="py-1.5 text-[14px] font-bold uppercase text-black print:text-[11pt]">Second</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => {
                /*
                 * Printed in playing order, not slot order: the left column is whoever
                 * actually goes first. A sheet that lists the slots instead makes every
                 * player check a separate column to find out who opens.
                 */
                const firstIsA = b.aPlaysFirst !== false;
                const first = firstIsA ? b.playerA : b.playerB;
                const second = firstIsA ? b.playerB : b.playerA;

                return (
                  <tr key={b.board} className="border-b border-black/30">
                    <td className="py-2 text-[20px] font-extrabold text-black print:text-[15pt]">
                      {b.playerB === null ? "—" : b.board}
                    </td>
                    <td className="py-2 text-[20px] font-semibold text-black print:text-[15pt]">
                      {nameOf(first)}{" "}
                      <span className="text-[15px] font-normal print:text-[11pt]">{numberOf(first)}</span>
                    </td>
                    <td className="py-2 text-[20px] font-semibold text-black print:text-[15pt]">
                      {b.playerB === null ? (
                        <span className="italic">Bye — no game this round</span>
                      ) : (
                        <>
                          {nameOf(second)}{" "}
                          <span className="text-[15px] font-normal print:text-[11pt]">{numberOf(second)}</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

/**
 * The table slips.
 *
 * One per board, four to a page, with the scores left blank and a line for an initial. This
 * is the artefact the whole tournament falls back on: if every screen in the building dies,
 * these slips plus the pairing sheet are a complete record of the round.
 *
 * A bye gets no slip. There is no game to write down.
 */
function ScoreSheets({
  round,
  boards,
  nameOf,
  numberOf,
}: {
  round: number;
  boards: { id: string; board: number; division: string; playerA: string; playerB: string | null; aPlaysFirst: boolean | null }[];
  nameOf: (id: string | null) => string;
  numberOf: (id: string | null) => string;
}) {
  const playable = boards.filter((b) => b.playerB !== null);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {playable.map((b) => {
        const firstIsA = b.aPlaysFirst !== false;
        const first = firstIsA ? b.playerA : b.playerB;
        const second = firstIsA ? b.playerB : b.playerA;

        return (
          <div key={b.id} className="break-inside-avoid border-2 border-black p-3">
            <div className="flex items-baseline justify-between border-b border-black pb-1.5">
              <p className="text-[22px] font-extrabold text-black print:text-[16pt]">
                Table {b.board}
              </p>
              <p className="text-[13px] font-bold uppercase text-black print:text-[10pt]">
                {b.division.replace(/-/g, " ")} · Round {round}
              </p>
            </div>

            <Line label="First" name={nameOf(first)} number={numberOf(first)} />
            <Line label="Second" name={nameOf(second)} number={numberOf(second)} />

            <div className="mt-3 flex items-end justify-between border-t border-black pt-2">
              <p className="text-[12px] text-black print:text-[9pt]">Spread</p>
              <span className="mx-2 h-6 flex-1 border-b border-black" />
              <p className="ml-3 text-[12px] text-black print:text-[9pt]">Staff initial</p>
              <span className="ml-2 h-6 w-16 border-b border-black" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** One player's row on a slip: who they are, and an empty box for their score. */
function Line({ label, name, number }: { label: string; name: string; number: string }) {
  return (
    <div className="mt-2.5 flex items-end gap-2">
      <span className="w-[54px] shrink-0 text-[11px] font-bold uppercase text-black print:text-[9pt]">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-[17px] font-semibold text-black print:text-[13pt]">
        {name} <span className="text-[13px] font-normal print:text-[10pt]">{number}</span>
      </span>
      {/* Left blank on purpose: this is what somebody writes in at the table. */}
      <span className="h-9 w-[86px] shrink-0 border-2 border-black" />
    </div>
  );
}
