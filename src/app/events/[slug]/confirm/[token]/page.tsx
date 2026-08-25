"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Check, Loader2, MapPin, PencilLine } from "lucide-react";

import {
  cardRows,
  type ConfirmationPlayer,
  moneyLines,
} from "@/lib/domain/confirmation";
import { usePublicEvent } from "@/lib/supabase/usePublicEvent";
import {
  confirmationGroup,
  confirmDetails,
  requestCorrection,
} from "@/lib/supabase/confirmation";
import { cn, formatDate } from "@/lib/utils";

const CREAM = "#F6F1E7";
const FOREST = "#2F5D3A";
const GOLD = "#C89B3C";
const BROWN = "#3E2F23";

/**
 * "Are these details right?"
 *
 * Sent before the day so the roster is correct before sixty people are standing in a room.
 * No account and no password: the link carries the token the registration already holds, and
 * that token is the key to one contact's own details and nobody else's.
 *
 * A family shares an email, so one parent gets one page with a card for each of their
 * children. The records stay separate — this groups the message, never the people.
 *
 * Nothing here mentions certificates. Those come after the tournament, from the results.
 */
export default function ConfirmPage() {
  const params = useParams<{ slug: string; token: string }>();
  const token = String(params.token ?? "");

  /*
   * The event named in the link, not a hardcoded one. This page ignored its own `[slug]`
   * segment and resolved every visitor to the single seeded event — so a confirmation sent
   * for a second tournament would have looked up the wrong event's registrations, and the
   * card below stated the 23 August date, time and venue whatever event it was actually for.
   */
  const { event, resolved } = usePublicEvent(params.slug);
  const eventId = event?.id ?? "";

  const [players, setPlayers] = React.useState<ConfirmationPlayer[] | null>(null);
  const [nudge, setNudge] = React.useState(0);
  const reload = React.useCallback(() => setNudge((n) => n + 1), []);

  React.useEffect(() => {
    if (!eventId) return;
    let live = true;
    (async () => {
      const found = await confirmationGroup(eventId, token);
      if (live) setPlayers(found);
    })();
    return () => {
      live = false;
    };
  }, [eventId, token, nudge]);

  return (
    <main className="min-h-dvh pb-16" style={{ background: CREAM, color: BROWN }}>
      <div className="mx-auto w-full max-w-[460px] px-4 py-8">
        <p
          className="text-center text-[11px] font-bold uppercase tracking-[0.22em]"
          style={{ color: GOLD }}
        >
          {event?.name ?? " "}
        </p>
        <h1 className="mt-2 text-center text-[24px] font-extrabold leading-tight">
          Player registration confirmation
        </h1>

        {resolved && !event ? (
          <div className="mt-8 rounded-[16px] border-2 border-dashed p-7 text-center" style={{ borderColor: `${BROWN}33` }}>
            <p className="text-[16px] font-bold">Event not found</p>
            <p className="mt-2 text-[13px] leading-relaxed opacity-70">
              Check the link, or reply to the message this link came in.
            </p>
          </div>
        ) : players === null ? (
          <p className="mt-10 flex items-center justify-center gap-2 text-[13px] opacity-70">
            <Loader2 className="size-4 animate-spin" /> Finding your registration…
          </p>
        ) : players.length === 0 ? (
          <div className="mt-8 rounded-[16px] border-2 border-dashed p-7 text-center" style={{ borderColor: `${BROWN}33` }}>
            <p className="text-[16px] font-bold">This link did not match a registration</p>
            <p className="mt-2 text-[13px] leading-relaxed opacity-70">
              It may have been mistyped. Ask at the desk on the day, or reply to the message
              this link came in.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-3 text-center text-[13.5px] leading-relaxed opacity-75">
              {players.length === 1
                ? "Please check that everything below is correct."
                : `${players.length} registrations are connected to your contact. Please check each one.`}
            </p>

            {players.map((p) => (
              <PlayerCard
                key={p.number}
                player={p}
                eventId={eventId}
                token={token}
                only={players.length === 1}
                onChanged={reload}
              />
            ))}

            <div
              className="mt-6 rounded-[16px] px-5 py-4 text-center"
              style={{ background: `${FOREST}0F` }}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
                Event details
              </p>
              {event?.startDate ? (
                <p className="mt-1.5 text-[15px] font-bold">{formatDate(event.startDate)}</p>
              ) : null}
              {event?.startTime ? (
                <p className="text-[14px]">
                  {event.startTime}
                  {event.expectedFinish ? ` – ${event.expectedFinish}` : ""}
                </p>
              ) : null}
              {event?.venueName ? (
                <p className="mt-1 flex items-center justify-center gap-1.5 text-[13.5px] opacity-80">
                  <MapPin className="size-3.5" /> {event.venueName}
                  {event.city ? `, ${event.city}` : ""}
                </p>
              ) : null}
            </div>

            <p className="mt-5 text-center text-[12.5px] leading-relaxed opacity-70">
              Please keep your player number to hand for check-in on the day.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

const FIELDS = ["Name", "Age", "Mobile", "Email", "Category", "PSA Status", "Payment", "Other"];

function PlayerCard({
  player,
  token,
  eventId,
  only,
  onChanged,
}: {
  player: ConfirmationPlayer;
  eventId: string;
  token: string;
  only: boolean;
  onChanged: () => void;
}) {
  const [correcting, setCorrecting] = React.useState(false);
  const [field, setField] = React.useState(FIELDS[0]);
  const [detail, setDetail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /* One send per press, whatever a second tap in the same tick believes. */
  const sending = React.useRef(false);

  const rows = cardRows(player);
  const money = moneyLines(player);
  const confirmed = player.confirmedAt !== null;
  const asked = player.correction !== "";

  const act = async (what: "confirm" | "correct") => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);

    const ok =
      what === "confirm"
        ? await confirmDetails(eventId, token, player.number)
        : await requestCorrection(eventId, token, player.number, field, detail);

    sending.current = false;
    setBusy(false);

    if (!ok) {
      setError("That did not save. Please try again, or tell us at the desk.");
      return;
    }
    setCorrecting(false);
    setDetail("");
    onChanged();
  };

  return (
    <div
      className="mt-5 overflow-hidden rounded-[18px] border-2 bg-white"
      style={{ borderColor: confirmed ? FOREST : `${GOLD}77` }}
    >
      <div className="px-5 py-4" style={{ background: confirmed ? FOREST : GOLD, color: "white" }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-90">
          Player {player.number}
        </p>
        <p className="mt-0.5 text-[20px] font-extrabold leading-tight">{player.name}</p>
      </div>

      <dl className="px-5 py-1">
        {rows
          .filter((r) => r.label !== "Player Number" && r.label !== "Name")
          .map((r) => (
            <div
              key={r.label}
              className="flex items-baseline justify-between gap-4 border-b py-2.5 last:border-b-0"
              style={{ borderColor: `${BROWN}14` }}
            >
              <dt className="shrink-0 text-[12.5px] opacity-65">{r.label}</dt>
              <dd
                className={cn(
                  "text-right text-[14px] font-semibold",
                  r.label === money.amountLabel && "num",
                )}
              >
                {r.value}
              </dd>
            </div>
          ))}
      </dl>

      <div className="px-5 pb-5 pt-3">
        {confirmed ? (
          <p className="flex items-center justify-center gap-1.5 text-[13.5px] font-bold" style={{ color: FOREST }}>
            <Check className="size-4" /> Confirmed. Thank you.
          </p>
        ) : asked ? (
          <div className="rounded-[12px] px-4 py-3 text-[12.5px] leading-relaxed" style={{ background: `${GOLD}1F` }}>
            <p className="flex items-start gap-2 font-semibold">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              A correction has been sent to the organizer.
            </p>
            <p className="mt-1 opacity-75">&ldquo;{player.correction}&rdquo;</p>
          </div>
        ) : correcting ? (
          <div>
            <p className="text-[12.5px] font-semibold">Which information is incorrect?</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FIELDS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setField(f)}
                  className="rounded-full border px-3 py-1.5 text-[12px] font-semibold"
                  style={
                    field === f
                      ? { borderColor: FOREST, background: FOREST, color: "white" }
                      : { borderColor: `${BROWN}2E` }
                  }
                >
                  {f}
                </button>
              ))}
            </div>

            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value.slice(0, 600))}
              rows={3}
              placeholder="What should it say instead?"
              aria-label="The correct information"
              className="mt-3 w-full rounded-[12px] border-2 bg-white px-3.5 py-3 text-[15px] outline-none"
              style={{ borderColor: `${BROWN}2E` }}
            />

            {error ? <p className="mt-2 text-[12.5px] text-critical">{error}</p> : null}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={detail.trim() === "" || busy}
                onClick={() => void act("correct")}
                className="rounded-[12px] py-3.5 text-[14px] font-bold text-white disabled:opacity-45"
                style={{ background: FOREST }}
              >
                {busy ? "Sending…" : "Submit correction"}
              </button>
              <button
                type="button"
                onClick={() => setCorrecting(false)}
                className="rounded-[12px] border-2 py-3.5 text-[14px] font-bold"
                style={{ borderColor: `${BROWN}2E` }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {error ? <p className="mb-2 text-[12.5px] text-critical">{error}</p> : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("confirm")}
              className="w-full rounded-[12px] py-4 text-[15px] font-bold text-white disabled:opacity-45"
              style={{ background: FOREST }}
            >
              {busy ? "Saving…" : only ? "Confirm my details" : `Confirm ${player.name.split(" ")[0]}`}
            </button>
            <button
              type="button"
              onClick={() => setCorrecting(true)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 py-2.5 text-[13px] font-semibold opacity-70"
            >
              <PencilLine className="size-3.5" /> Request a correction
            </button>
          </>
        )}
      </div>
    </div>
  );
}
