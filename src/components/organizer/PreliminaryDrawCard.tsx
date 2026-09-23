"use client";

import * as React from "react";
import { Moon, Sunrise, Trash2 } from "lucide-react";

import { Badge, Button, Card } from "@/components/ui";
import {
  preliminaryDraw,
  reconcile,
  reconciliationSummary,
  type PreliminaryPlayer,
} from "@/lib/domain/preliminary";
import type { Pairing, Player } from "@/lib/domain/types";
import { seededRandom } from "@/lib/engine/tournamentSim";
import {
  readPreliminaryDraw,
  savePreliminaryDraw,
  type StoredPreliminaryDraw,
} from "@/lib/supabase/preliminaryDraw";

/**
 * Round 1, prepared the night before and settled on the morning.
 *
 * Two moments on one card, because they are two halves of one act:
 *
 *   The night before  — everybody registered, drawn at random within their category, saved
 *                       on the event so any laptop can find it in the morning. Printable.
 *   The morning       — the same draw held against who has actually checked in. Pairs where
 *                       both arrived stand. Pairs where one did not are broken, and the
 *                       survivor goes back to the engine with everybody else who needs an
 *                       opponent.
 *
 * The saving is the intact pairs: for a room where most people come, most of Round 1 was done
 * at midnight. The protection is that the draw is never published as it stands. It reaches the
 * engine as locked boards, and the engine — with the real roster, the table plan and the
 * validator — makes the round.
 *
 * Shown only until Round 1 exists. After that it is history, and history goes in the audit
 * log rather than on the control room.
 */
export function PreliminaryDrawCard({
  eventId,
  players,
  divisions,
  roundOnePublished,
  by,
  onUseSurvivors,
}: {
  eventId: string;
  /** The whole roster, checked in or not. Registration is what the night-before draw is from. */
  players: Player[];
  divisions: string[];
  roundOnePublished: boolean;
  by: string;
  /** Opens the pairing preview with these boards carried through untouched. */
  onUseSurvivors: (keep: Pairing[]) => void;
}) {
  const [stored, setStored] = React.useState<StoredPreliminaryDraw | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    (async () => {
      const draw = await readPreliminaryDraw(eventId);
      if (!live) return;
      setStored(draw);
      setLoaded(true);
    })();
    return () => {
      live = false;
    };
  }, [eventId]);

  if (roundOnePublished || !loaded) return null;

  const registered: PreliminaryPlayer[] = players
    .filter((p) => p.checkIn !== "withdrawn")
    .map((p) => ({ id: p.id, fullName: p.fullName, playerNumber: p.playerId, division: p.division }));

  const arrived = registered.filter((p) =>
    players.some((x) => x.id === p.id && x.checkIn === "checked-in"),
  );

  const make = async () => {
    setBusy(true);
    setError(null);

    /*
     * The seed is the moment of drawing. Stored with the draw, so regenerating from it gives
     * the identical sheet — a director who printed one at midnight must not find a different
     * one on the screen at nine.
     */
    const seed = freshSeed();
    const draw = preliminaryDraw(registered, divisions, seededRandom(seed));
    const next: StoredPreliminaryDraw = { ...draw, seed };

    const out = await savePreliminaryDraw(eventId, next, by);
    setBusy(false);

    if (!out.ok) {
      setError(out.message ?? "The draw was not saved.");
      return;
    }
    setStored(next);
  };

  const discard = async () => {
    setBusy(true);
    const out = await savePreliminaryDraw(eventId, null, by);
    setBusy(false);
    if (out.ok) setStored(null);
  };

  /* ---- The night before: nothing drawn yet. ------------------------------ */

  if (!stored) {
    return (
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Moon className="mt-0.5 size-4 shrink-0 text-muted" />
            <div>
              <p className="text-[14px] font-bold text-ink">Prepare Round 1 the night before</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                Draws everybody registered, at random within their category. Saved as a draft,
                never published — on the morning it is checked against who actually arrives.
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm" disabled={busy || registered.length < 2} onClick={() => void make()}>
            {busy ? "Drawing…" : `Draw ${registered.length} registered`}
          </Button>
        </div>
        {error ? <p className="mt-2 text-[12.5px] text-critical">{error}</p> : null}
      </Card>
    );
  }

  /* ---- The morning: hold the draft against the room. ---------------------- */

  const morning = reconcile(stored, arrived);
  const nobodyHere = arrived.length === 0;

  /* Intact pairs, in the shape the engine carries through untouched. */
  const survivors: Pairing[] = morning.intact.map((pair, i) => ({
    id: `pr-1-prelim-${pair.a.id}-${pair.b.id}`,
    tournamentId: eventId,
    round: 1,
    division: pair.division,
    board: i + 1,
    playerAId: pair.a.id,
    playerBId: pair.b.id,
    status: "scheduled",
    locked: true,
    reason: "Drawn the night before; both players arrived.",
    confidence: 100,
    conflicts: [],
  }));

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          {nobodyHere ? <Moon className="size-4 text-muted" /> : <Sunrise className="size-4 text-muted" />}
          <h3 className="text-[14px] font-bold text-ink">
            {nobodyHere ? "Round 1 draft, drawn the night before" : "Round 1 draft, against the room"}
          </h3>
        </div>
        <Badge tone="warning">Preliminary — not published</Badge>
      </div>

      <div className="px-4 py-3">
        <p className="text-[13px] text-ink">
          <span className="num font-semibold">{stored.pairs.length}</span> pair
          {stored.pairs.length === 1 ? "" : "s"} drawn from{" "}
          <span className="num font-semibold">{stored.pairs.length * 2 + stored.unpaired.length}</span>{" "}
          registered
          {stored.unpaired.length > 0
            ? ` · ${stored.unpaired.length} without an opponent`
            : ""}
        </p>

        {nobodyHere ? (
          <p className="mt-1 text-[12.5px] text-muted">
            Nobody has checked in yet. As they arrive this card will show which pairs still stand.
          </p>
        ) : (
          <>
            <p className="mt-1 text-[13px] font-semibold text-ink">{reconciliationSummary(morning)}</p>

            {morning.broken.length > 0 ? (
              <ul className="mt-2 space-y-0.5">
                {morning.broken.map((b) => (
                  <li key={b.pair.a.id + b.pair.b.id} className="text-[12.5px] text-muted">
                    <span className="font-semibold text-ink">{b.survivor.fullName}</span> is here;{" "}
                    {b.missing.fullName} is not.
                  </li>
                ))}
              </ul>
            ) : null}

            {morning.unexpected.length > 0 ? (
              <p className="mt-2 text-[12.5px] text-muted">
                Not in the draft:{" "}
                <span className="font-semibold text-ink">
                  {morning.unexpected.map((p) => p.fullName).join(", ")}
                </span>
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-[rgb(var(--c-surface-soft))] px-4 py-2.5">
        <p className="text-[11.5px] leading-relaxed text-faint">
          Surviving pairs are carried into the draw untouched; everybody else is paired around them.
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="size-3.5" />}
            disabled={busy}
            onClick={() => void discard()}
          >
            Discard
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || nobodyHere}
            onClick={() => onUseSurvivors(survivors)}
          >
            {morning.intact.length > 0
              ? `Pair round 1, keeping ${morning.intact.length}`
              : "Pair round 1"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/**
 * A seed for tonight's draw.
 *
 * Outside the component because the React compiler refuses an impure call inside one, even
 * in an event handler — and it is right to, since a render must never depend on the clock.
 * This runs only when the button is pressed.
 */
function freshSeed(): number {
  return Date.now() % 2147483647;
}
