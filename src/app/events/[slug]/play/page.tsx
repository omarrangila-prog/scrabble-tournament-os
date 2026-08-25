"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Check, ChevronLeft, Loader2, Search, Trophy } from "lucide-react";

import { usePublicEvent } from "@/lib/supabase/usePublicEvent";
import {
  claimPlayerOpen,
  forgetPlayer,
  playerByNumber,
  type PlayerSummary,
  rememberedPlayer,
  rememberPlayer,
} from "@/lib/supabase/playerNumber";
import { checkInParticipant } from "@/lib/supabase/registrations";
import {
  outcome,
  PlayerHit,
  PlayerRound,
  playerRounds,
  roundState,
  searchPlayers,
} from "@/lib/supabase/playerHub";
import {
  confirmResult,
  disputeResult,
  submitResult,
} from "@/lib/supabase/submitResult";
import { cn } from "@/lib/utils";

const FOREST = "#2F5D3A";
const GOLD = "#C89B3C";
const CREAM = "#F6F1E7";

/**
 * A participant's whole day, on their own phone.
 *
 * One page behind one QR code on the wall. Find yourself, see your table, play, send the
 * score, confirm your opponent's, and watch the next round appear — without a password, an
 * app, or a queue at the desk.
 *
 * It is deliberately the only thing a participant is asked to use, because anything they have
 * to be told twice will be told to sixty-eight people by three volunteers.
 *
 * Nothing personal is ever typed on the television. The wall carries the QR and the public
 * pairing list; who you are is settled here, on the phone in your hand.
 */
export default function PlayPage() {
  const params = useParams<{ slug: string }>();

  /*
   * The event in the URL, not a hardcoded one. This page read `params.slug` and then ignored
   * it, resolving every visitor to the single seeded event id — so once a second tournament
   * existed, everybody scanning that event's QR code landed here and was shown the *other*
   * event's pairings, with no indication anything was wrong.
   */
  const { event, resolved } = usePublicEvent(params.slug);
  const eventId = event?.id ?? "";

  const [rounds, setRounds] = React.useState<PlayerRound[] | null>(null);
  const [chosen, setChosen] = React.useState<number | null>(null);

  /*
   * Who this phone belongs to, kept in local storage from the moment they first identified
   * themselves — so for almost everybody this is the last time they ever type anything.
   *
   * Read through `useSyncExternalStore`, the way the score page already does it: local
   * storage is mutable state outside React, and reading it during render makes the component
   * impure, which the compiler refuses. `claimed` bumps the subscription so identifying
   * yourself re-renders immediately rather than after a poll.
   */
  const [claimed, setClaimed] = React.useState(0);
  const held = React.useSyncExternalStore(
    React.useCallback(() => () => {}, []),
    React.useCallback(() => {
      void claimed;
      const it = rememberedPlayer(eventId);
      return it ? `${it.token}|${it.number}` : "";
    }, [eventId, claimed]),
    () => "",
  );
  const [token, myNumber] = held ? (held.split("|") as [string, string]) : [null, null];

  /*
   * A counter rather than a function to call: bumping it re-runs the read below. Handing an
   * async loader to an effect makes that effect set state directly, which the React Compiler
   * refuses, and it is the same shape every other subscription in this app already uses.
   */
  const [nudge, setNudge] = React.useState(0);
  const reload = React.useCallback(() => setNudge((n) => n + 1), []);

  const [me, setMe] = React.useState<PlayerSummary | null>(null);

  React.useEffect(() => {
    if (!token || !myNumber) return;
    let live = true;

    (async () => {
      const [mine, who] = await Promise.all([
        playerRounds(eventId, token),
        playerByNumber(eventId, myNumber),
      ]);
      if (!live) return;
      setRounds(mine);
      setMe(who);
    })();

    return () => {
      live = false;
    };
  }, [eventId, token, myNumber, nudge]);

  /*
   * And a poll behind it. A round is published by somebody else, on another screen, and the
   * phone in a player's pocket has no way to hear about it — so the page that tells them
   * where to sit has to go and look.
   */
  React.useEffect(() => {
    if (!token) return;
    const id = window.setInterval(reload, 12_000);
    return () => window.clearInterval(id);
  }, [token, reload]);

  /* Which event this is has to be settled before anything is looked up against it. */
  if (!resolved) {
    return (
      <main className="grid min-h-dvh place-items-center" style={{ background: CREAM }}>
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="grid min-h-dvh place-items-center px-6" style={{ background: CREAM }}>
        <div className="text-center">
          <p className="text-[15px] font-bold" style={{ color: FOREST }}>
            Event not found
          </p>
          <p className="mt-1 text-[13px] text-muted">Check the link, or ask a volunteer.</p>
        </div>
      </main>
    );
  }

  if (!token) {
    return (
      <Find
        eventId={eventId}
        onClaimed={(t, n) => {
          rememberPlayer(eventId, t, n);
          setClaimed((c) => c + 1);
        }}
      />
    );
  }

  /*
   * The round in play, taken from the rounds this player actually has rather than from the
   * event record. The highest round they have been paired for is the current one for them,
   * which is also true for somebody who joined late and has fewer rounds than everybody else.
   */
  const currentRound = Math.max(0, ...(rounds ?? []).map((r) => r.round));
  const showing =
    chosen ?? (rounds?.some((r) => r.round === currentRound) ? currentRound : rounds?.at(-1)?.round ?? 0);
  const round = rounds?.find((r) => r.round === showing) ?? null;

  return (
    <main className="min-h-dvh pb-16" style={{ background: CREAM }}>
      <div className="mx-auto w-full max-w-[440px] px-4 py-6">
        <Header
          number={myNumber}
          name={me?.maskedName ?? null}
          onForget={() => {
            forgetPlayer(eventId);
            setRounds(null);
            setClaimed((c) => c + 1);
          }}
        />

        {me && !me.checkedIn ? (
          <Arrive eventId={eventId} token={token} me={me} onArrived={reload} />
        ) : null}

        {rounds === null ? (
          <p className="mt-10 flex items-center justify-center gap-2 text-[13px] text-muted">
            <Loader2 className="size-4 animate-spin" /> Finding your table…
          </p>
        ) : rounds.length === 0 ? (
          <Waiting slug={params.slug} />
        ) : (
          <>
            <RoundTabs
              rounds={rounds}
              showing={showing}
              current={currentRound}
              onPick={setChosen}
            />
            {round ? (
              <MatchCard
                eventId={eventId}
                token={token}
                round={round}
                current={currentRound}
                onChanged={reload}
              />
            ) : null}
            <History rounds={rounds} current={currentRound} onPick={setChosen} />
          </>
        )}
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Finding yourself                                                            */
/* -------------------------------------------------------------------------- */

function Find({
  eventId,
  onClaimed,
}: {
  eventId: string;
  onClaimed: (token: string, number: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<PlayerHit[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  /* Searching as they type, a beat behind, so the list settles rather than flickering. */
  React.useEffect(() => {
    const q = query;
    const id = window.setTimeout(async () => {
      setHits(await searchPlayers(eventId, q));
    }, 220);
    return () => window.clearTimeout(id);
  }, [query, eventId]);

  /*
   * Picking a name is the whole of it.
   *
   * There used to be a second screen asking for the last four digits of the mobile. It is a
   * real protection and the organizer removed it deliberately: at a door with seventy-nine
   * people, most of them children, the step cost more than it earned.
   */
  const pick = async (hit: PlayerHit) => {
    setBusy(true);
    setError(null);

    const token = await claimPlayerOpen(eventId, hit.number);
    setBusy(false);

    if (!token) {
      setError("That did not work. Please try again, or ask at the desk.");
      return;
    }
    onClaimed(token, hit.number);
  };

  return (
    <main className="min-h-dvh" style={{ background: CREAM }}>
      <div className="mx-auto w-full max-w-[440px] px-4 py-10">
        <p
          className="text-center text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ color: GOLD }}
        >
          Blufy&apos;s AlphaBattle
        </p>
        <h1 className="mt-2 text-center text-[26px] font-extrabold leading-tight text-ink">
          Find your player profile
        </h1>

        <p className="mt-2 text-center text-[13px] leading-relaxed text-muted">
          Type your name. Spelling does not have to be exact — part of it is enough.
        </p>

        <div className="relative mt-6">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type your name"
            autoFocus
            autoComplete="off"
            className="w-full rounded-feature border-2 border-line bg-white py-4 pl-10 pr-4 text-[16px] outline-none focus:border-[#2F5D3A]"
            aria-label="Your name"
          />
        </div>

        {error ? <p className="mt-3 text-center text-[12.5px] text-critical">{error}</p> : null}

        <div className="mt-3 space-y-2">
          {hits.map((h) => (
            <button
              key={h.number}
              type="button"
              disabled={busy}
              onClick={() => void pick(h)}
              className="flex w-full items-center gap-3 rounded-feature border-2 border-line bg-white px-4 py-4 text-left active:scale-[0.99] disabled:opacity-50"
            >
              <span
                className="num shrink-0 rounded-control px-2.5 py-1 text-[15px] font-extrabold"
                style={{ background: `${GOLD}2E`, color: "#8A6A1F" }}
              >
                {h.number}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-ink">{h.name}</span>
                <span className="block text-[12px] capitalize text-muted">{h.division}</span>
              </span>
              <span className="shrink-0 text-[12.5px] font-semibold" style={{ color: FOREST }}>
                {busy ? "…" : "That's me"}
              </span>
            </button>
          ))}

          {query.trim().length >= 2 && hits.length === 0 && !busy ? (
            <p className="rounded-feature bg-white px-4 py-5 text-center text-[13px] leading-relaxed text-muted">
              Nobody matches that. Try just your first name or your surname — or ask at the desk.
            </p>
          ) : null}
        </div>

        <p className="mt-8 text-center text-[11.5px] leading-relaxed text-muted">
          {/* The number still works for anybody who has it, but nobody is asked for one. */}
          No app and no password. Your player number works here too, if you have it.
        </p>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* The page, once it knows who you are                                         */
/* -------------------------------------------------------------------------- */

function Header({
  number,
  name,
  onForget,
}: {
  number: string | null;
  name: string | null;
  onForget: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="num shrink-0 rounded-control px-3 py-1.5 text-[17px] font-extrabold"
        style={{ background: `${GOLD}2E`, color: "#8A6A1F" }}
      >
        {number ?? "—"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
          Your tournament
        </span>
        {name ? <span className="block truncate text-[15px] font-bold text-ink">{name}</span> : null}
      </span>
      <button type="button" onClick={onForget} className="shrink-0 text-[12px] font-semibold text-muted">
        Not you?
      </button>
    </div>
  );
}

function Waiting({ slug }: { slug: string }) {
  return (
    <div className="mt-8 rounded-feature border-2 border-dashed border-line bg-white p-7 text-center">
      <Trophy className="mx-auto size-6" style={{ color: GOLD }} />
      <p className="mt-3 text-[16px] font-bold text-ink">You are checked in</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
        Round 1 has not been paired yet. This page will show your table as soon as it is — keep it
        open, there is nothing else to do.
      </p>
      <p className="mt-3 text-[11.5px] text-muted">{slug}</p>
    </div>
  );
}

function RoundTabs({
  rounds,
  showing,
  current,
  onPick,
}: {
  rounds: PlayerRound[];
  showing: number;
  current: number;
  onPick: (n: number) => void;
}) {
  return (
    <div className="mt-5 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(rounds.length, 5)}, 1fr)` }}>
      {rounds.map((r) => {
        const state = roundState(r, current);
        const on = r.round === showing;
        return (
          <button
            key={r.round}
            type="button"
            onClick={() => onPick(r.round)}
            className={cn(
              "rounded-control border-2 py-2.5 text-[13px] font-extrabold transition-colors",
              on ? "text-white" : "bg-white text-ink",
            )}
            style={{
              borderColor: on ? FOREST : state === "live" ? GOLD : "rgba(0,0,0,0.10)",
              background: on ? FOREST : undefined,
            }}
            aria-pressed={on}
          >
            R{r.round}
            <span className="ml-1 text-[11px]">
              {state === "settled" ? "✓" : state === "disputed" ? "!" : state === "live" ? "●" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MatchCard({
  eventId,
  token,
  round,
  current,
  onChanged,
}: {
  eventId: string;
  token: string;
  round: PlayerRound;
  current: number;
  onChanged: () => void | Promise<void>;
}) {
  const state = roundState(round, current);

  return (
    <div className="mt-4 overflow-hidden rounded-feature border-2 bg-white" style={{ borderColor: state === "live" ? GOLD : FOREST }}>
      <div className="px-5 py-4 text-white" style={{ background: state === "live" ? GOLD : FOREST }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-90">
          Round {round.round}
        </p>
        {round.isBye ? (
          <p className="mt-1 text-[22px] font-extrabold">You sit this one out</p>
        ) : (
          <p className="num mt-1 text-[30px] font-extrabold leading-none">Table {round.board}</p>
        )}
      </div>

      {round.isBye ? (
        <p className="px-5 py-5 text-[13px] leading-relaxed text-muted">
          There is an odd number of players in your division this round, so you have a bye. It
          counts as a win and there is no score to enter.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-px bg-[rgba(0,0,0,0.07)]">
            <Cell label="Seat" value={round.seat} />
            <Cell label="Round" value={`${round.round}`} />
            <Cell
              label="Opponent"
              value={round.opponent ?? "To be confirmed"}
              sub={round.opponentNumber ? `Player ${round.opponentNumber}` : undefined}
              wide
            />
          </dl>

          <div className="px-5 py-5">
            <Score
              eventId={eventId}
              token={token}
              round={round}
              state={state}
              onChanged={onChanged}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  sub,
  wide,
}: {
  label: string;
  value: string;
  sub?: string;
  wide?: boolean;
}) {
  return (
    <div className={cn("bg-white px-5 py-3.5", wide && "col-span-2")}>
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[17px] font-extrabold text-ink">{value}</dd>
      {sub ? <dd className="num text-[12px] text-muted">{sub}</dd> : null}
    </div>
  );
}

/**
 * The scores, and everything that can be true about them.
 *
 * Six states, and each says the one thing to do next. A player at a noisy venue reads a
 * heading and a button, so every branch ends in either a button or a sentence explaining why
 * there is not one.
 */
function Score({
  eventId,
  token,
  round,
  state,
  onChanged,
}: {
  eventId: string;
  token: string;
  round: PlayerRound;
  state: ReturnType<typeof roundState>;
  onChanged: () => void | Promise<void>;
}) {
  const [mine, setMine] = React.useState("");
  const [theirs, setTheirs] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /*
   * A ref, not state. Two taps in the same tick both read the old value of a state flag and
   * both send — which is how one board gets two results.
   */
  const sending = React.useRef(false);

  const send = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);

    const out = await submitResult(eventId, { token }, Number(mine), Number(theirs));

    sending.current = false;
    setBusy(false);
    if (!out.ok) {
      setError(out.reason);
      return;
    }
    await onChanged();
  };

  const answer = async (agree: boolean) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);

    const out = agree
      ? await confirmResult(eventId, token)
      : await disputeResult(eventId, token, "Opponent says the score is wrong");

    sending.current = false;
    setBusy(false);
    if (!out.ok) {
      setError(out.reason);
      return;
    }
    await onChanged();
  };

  if (state === "settled" || state === "disputed" || state === "awaiting") {
    const result = outcome(round);
    return (
      <div>
        <div className="flex items-end justify-center gap-4">
          <Big label="You" value={round.myScore} />
          <span className="pb-2 text-[16px] font-bold text-muted">–</span>
          <Big label="Them" value={round.theirScore} />
        </div>

        {result ? (
          <p
            className="mt-3 text-center text-[17px] font-extrabold"
            style={{ color: result === "Won" ? FOREST : result === "Lost" ? "#B4442F" : "#8A6A1F" }}
          >
            {result}
          </p>
        ) : null}

        {state === "disputed" ? (
          <p className="mt-3 flex items-start gap-2 rounded-control bg-[rgba(200,60,60,0.08)] px-3.5 py-3 text-[12.5px] leading-relaxed text-critical">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            This board is being looked at by the desk. Nothing more to do here.
          </p>
        ) : state === "settled" ? (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold" style={{ color: FOREST }}>
            <Check className="size-3.5" /> Confirmed by both players
          </p>
        ) : round.iSubmitted ? (
          <p className="mt-3 text-center text-[12.5px] leading-relaxed text-muted">
            Sent. Waiting for {round.opponent ?? "your opponent"} to confirm.
          </p>
        ) : (
          <>
            <p className="mt-4 text-center text-[13px] font-semibold text-ink">
              Is this right?
            </p>
            <p className="mt-1 text-center text-[12px] leading-relaxed text-muted">
              {/* Neutral about who typed it: the desk enters results too. */}
              This score was entered for your board. Check it before you agree.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void answer(true)}
                className="rounded-feature py-4 text-[15px] font-bold text-white disabled:opacity-45"
                style={{ background: FOREST }}
              >
                Yes, correct
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void answer(false)}
                className="rounded-feature border-2 py-4 text-[15px] font-bold disabled:opacity-45"
                style={{ borderColor: "#B4442F", color: "#B4442F" }}
              >
                No, wrong
              </button>
            </div>
          </>
        )}

        {error ? <p className="mt-3 text-center text-[12.5px] text-critical">{error}</p> : null}
      </div>
    );
  }

  if (state === "upcoming") {
    return (
      <p className="text-center text-[13px] leading-relaxed text-muted">
        Not started yet. Go to table {round.board} when this round is called.
      </p>
    );
  }

  return (
    <div>
      <p className="text-center text-[13px] font-semibold text-ink">Enter the result</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Your score" value={mine} onChange={setMine} />
        <Field label="Their score" value={theirs} onChange={setTheirs} />
      </div>

      {error ? <p className="mt-3 text-center text-[12.5px] text-critical">{error}</p> : null}

      <button
        type="button"
        disabled={mine === "" || theirs === "" || busy}
        onClick={() => void send()}
        className="mt-4 w-full rounded-feature py-4 text-[15px] font-bold text-white disabled:opacity-45"
        style={{ background: FOREST }}
      >
        {busy ? "Sending…" : "Submit result"}
      </button>

      <p className="mt-2.5 text-center text-[11.5px] leading-relaxed text-muted">
        Your opponent confirms it on their own phone.
      </p>
    </div>
  );
}

function Big({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="text-center">
      <span className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      <span className="num block text-[38px] font-extrabold leading-none text-ink">
        {value ?? "—"}
      </span>
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 3))}
        inputMode="numeric"
        placeholder="0"
        aria-label={label}
        className="num mt-1 w-full rounded-feature border-2 border-line bg-white py-4 text-center text-[26px] font-extrabold outline-none focus:border-[#2F5D3A]"
      />
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* The day so far                                                              */
/* -------------------------------------------------------------------------- */

function History({
  rounds,
  current,
  onPick,
}: {
  rounds: PlayerRound[];
  current: number;
  onPick: (n: number) => void;
}) {
  return (
    <div className="mt-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">Your day</p>

      <div className="mt-2 space-y-2">
        {rounds.map((r) => {
          const state = roundState(r, current);
          const result = outcome(r);
          /* A padlock means "not yet yours to do". Waiting on somebody else is not that. */
          const mark =
            state === "settled"
              ? "✅"
              : state === "disputed"
                ? "⚠️"
                : state === "awaiting"
                  ? "⏳"
                  : state === "live"
                    ? "🔴"
                    : state === "bye"
                      ? "—"
                      : "🔒";

          return (
            <button
              key={r.round}
              type="button"
              onClick={() => onPick(r.round)}
              className="flex w-full items-center gap-3 rounded-feature border border-line bg-white px-4 py-3 text-left"
            >
              <span className="shrink-0 text-[15px]">{mark}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold text-ink">
                  Round {r.round}
                  {r.isBye ? " — bye" : r.opponent ? ` · ${r.opponent}` : ""}
                </span>
                <span className="num block text-[12px] text-muted">
                  {r.isBye
                    ? "No game"
                    : `Table ${r.board}` +
                      (r.myScore !== null && r.theirScore !== null
                        ? ` · ${r.myScore}–${r.theirScore}${result ? ` · ${result}` : ""}` +
                          (state === "awaiting" ? " · not agreed yet" : "")
                        : state === "live"
                          ? " · enter your result"
                          : " · waiting for pairing")}
                </span>
              </span>
              <ChevronLeft className="size-4 shrink-0 rotate-180 text-muted" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Arriving                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Checking in, on the page they already have open.
 *
 * Somebody who scans the wall before they have checked in used to get their table and then a
 * refusal when they sent a score — "did not match anybody checked in" — which reads as a
 * broken app to a person standing at the right board. Arriving is part of the same scan.
 *
 * A payment nobody has settled still cannot wave itself in. That is the desk's decision, and
 * this says so plainly rather than failing.
 */
function Arrive({
  eventId,
  token,
  me,
  onArrived,
}: {
  eventId: string;
  token: string;
  me: PlayerSummary;
  onArrived: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const settled = me.paymentStatus === "verified" || me.paymentStatus === "complimentary" || me.paymentStatus === "cash-at-venue";

  const arrive = async () => {
    setBusy(true);
    setError(null);
    const out = await checkInParticipant({ eventId, token, method: "venue_qr" });
    setBusy(false);
    if (out.result === "blocked" || out.result === "not_found") {
      setError(out.message);
      return;
    }
    onArrived();
  };

  return (
    <div className="mt-4 rounded-feature border-2 bg-white p-5 text-center" style={{ borderColor: GOLD }}>
      <p className="text-[16px] font-extrabold text-ink">You are not checked in yet</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
        {settled
          ? "One tap and you are on the list for pairing."
          : "Your payment has not been settled, so the desk checks you in. It takes a moment."}
      </p>

      {error ? <p className="mt-3 text-[12.5px] text-critical">{error}</p> : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void arrive()}
        className="mt-4 w-full rounded-feature py-4 text-[15px] font-bold text-white disabled:opacity-45"
        style={{ background: FOREST }}
      >
        {busy ? "Checking you in…" : "Check me in"}
      </button>
    </div>
  );
}
