"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";

import { Button, Field, Input } from "@/components/ui";
import { CodeInput } from "@/components/checkin/CodeInput";
import { CHECK_IN_CODE_LENGTH } from "@/lib/domain/checkIn";
import { selectEventBySlug, useEventStore } from "@/lib/store/useEventStore";
import { boardForCode, submitResult, type Board } from "@/lib/supabase/submitResult";

/**
 * A player entering their own board's result.
 *
 * This is what the QR on the screen points at between rounds. One player from each board
 * scans it, and the whole interaction is: six digits, two numbers, done.
 *
 * Nothing asks for a name, an opponent or a table number. The code identifies the person and
 * the system already knows their board, so those three fields could only ever introduce a
 * mistake — a mistyped table number would file a result against somebody else's game.
 *
 * The board is shown back before any score is typed. That is the confirmation step: a player
 * who sees the wrong opponent knows immediately, rather than finding out from the standings.
 */

const CREAM = "#F5F0E4";
const FOREST = "#2F5D3A";
const GOLD = "#C89B3C";
const BROWN = "#3E2F23";

export default function SubmitScorePage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(params.slug ?? "");

  const store = useEventStore();
  const event = selectEventBySlug(store, slug);

  const [code, setCode] = React.useState("");
  const [board, setBoard] = React.useState<Board | null>(null);
  const [mine, setMine] = React.useState("");
  const [theirs, setTheirs] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  if (!event) {
    return (
      <Shell>
        <Panel>
          <p className="text-[15px] font-semibold" style={{ color: BROWN }}>
            Event not found
          </p>
          <p className="mt-1 text-[13px]" style={{ color: `${BROWN}A6` }}>
            Check the link, or ask a volunteer.
          </p>
        </Panel>
      </Shell>
    );
  }

  const lookUp = async (value: string) => {
    setBusy(true);
    setError(null);
    const found = await boardForCode(event.id, value);
    setBusy(false);

    if (!found) {
      /*
       * One message for every reason it failed. Saying "that code does not exist" as against
       * "that person has not checked in" would turn this page into a way of finding out who
       * has arrived.
       */
      setError("We could not find a board for that code. Check the digits, or ask at the desk.");
      return;
    }
    setBoard(found);
  };

  const send = async () => {
    const my = Number(mine);
    const their = Number(theirs);

    if (mine.trim() === "" || theirs.trim() === "" || Number.isNaN(my) || Number.isNaN(their)) {
      setError("Enter both scores.");
      return;
    }

    setBusy(true);
    setError(null);
    const result = await submitResult(event.id, code, my, their);
    setBusy(false);

    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setDone(true);
  };

  /* ---- Recorded ---------------------------------------------------------- */
  if (done && board) {
    const won = Number(mine) > Number(theirs);
    const drawn = Number(mine) === Number(theirs);

    return (
      <Shell>
        <Panel>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>
            Board {board.board} recorded
          </p>
          <p className="num mt-3 text-[38px] font-extrabold leading-none" style={{ color: BROWN }}>
            {mine} – {theirs}
          </p>
          <p className="mt-2 text-[14px] font-semibold" style={{ color: FOREST }}>
            {drawn ? "A draw." : won ? "You won." : `${board.opponent} won.`}
          </p>
          <p className="mt-4 text-[13px] leading-relaxed" style={{ color: `${BROWN}A6` }}>
            The standings have been updated. If this is wrong, tell the desk — they can correct
            it.
          </p>
        </Panel>
      </Shell>
    );
  }

  /* ---- The board, and the two numbers ------------------------------------ */
  if (board) {
    return (
      <Shell>
        <Panel>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>
            Round {board.round} · Board {board.board}
          </p>

          {/*
            Shown back before anything is typed. A player looking at the wrong opponent knows
            at once that they have somebody else's code or the wrong board.
          */}
          <p className="mt-3 text-[19px] font-extrabold leading-tight" style={{ color: BROWN }}>
            {board.you}
            <span style={{ color: `${BROWN}80` }}> v </span>
            {board.opponent ?? "a bye"}
          </p>

          {board.alreadyRecorded ? (
            <p className="mt-4 text-[13.5px] leading-relaxed" style={{ color: `${BROWN}A6` }}>
              This board already has a score. If it is wrong, the desk can correct it.
            </p>
          ) : board.opponent === null ? (
            <p className="mt-4 text-[13.5px] leading-relaxed" style={{ color: `${BROWN}A6` }}>
              You have a bye this round, so there is no score to enter.
            </p>
          ) : (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3 text-left">
                <Field label="Your score" required>
                  <Input
                    value={mine}
                    onChange={(e) => setMine(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    inputMode="numeric"
                    className="num text-center text-[20px] font-bold"
                    placeholder="0"
                    aria-label={`Score for ${board.you}`}
                  />
                </Field>
                <Field label={`${firstName(board.opponent)}'s score`} required>
                  <Input
                    value={theirs}
                    onChange={(e) => setTheirs(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    inputMode="numeric"
                    className="num text-center text-[20px] font-bold"
                    placeholder="0"
                    aria-label={`Score for ${board.opponent}`}
                  />
                </Field>
              </div>

              {error ? (
                <p className="mt-3 text-[12.5px] font-semibold text-critical">{error}</p>
              ) : null}

              <Button
                size="lg"
                className="mt-5 w-full border-0"
                style={{ background: FOREST, color: "white" }}
                disabled={busy}
                onClick={() => void send()}
              >
                {busy ? "Saving…" : "Submit result"}
              </Button>

              <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: `${BROWN}80` }}>
                This counts straight away. Check both numbers before you send.
              </p>
            </>
          )}

          <button
            onClick={() => {
              setBoard(null);
              setCode("");
              setMine("");
              setTheirs("");
              setError(null);
            }}
            className="mt-4 text-[13px] font-semibold underline underline-offset-4"
            style={{ color: `${BROWN}99` }}
          >
            Not you? Start again
          </button>
        </Panel>
      </Shell>
    );
  }

  /* ---- The code ---------------------------------------------------------- */
  return (
    <Shell>
      <Panel>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>
          {event.name}
        </p>
        <p className="mt-2 text-[24px] font-extrabold leading-tight" style={{ color: BROWN }}>
          Enter your result
        </p>
        <p className="mt-1 text-[13.5px]" style={{ color: `${BROWN}A6` }}>
          One player per board. Enter your {CHECK_IN_CODE_LENGTH}-digit check-in code and we
          will find your game.
        </p>

        <div className="mt-5">
          <CodeInput
            value={code}
            onChange={setCode}
            onComplete={lookUp}
            invalid={Boolean(error)}
          />
        </div>

        {error ? (
          <p className="mt-3 text-[12.5px] font-semibold text-critical">{error}</p>
        ) : null}

        <Button
          size="lg"
          className="mt-5 w-full border-0"
          style={{ background: FOREST, color: "white" }}
          disabled={code.length !== CHECK_IN_CODE_LENGTH || busy}
          onClick={() => void lookUp(code)}
        >
          {busy ? "Finding your board…" : "Find my board"}
        </Button>
      </Panel>
    </Shell>
  );
}

/** Just the first name, so a narrow label does not wrap to three lines. */
function firstName(full: string | null): string {
  if (!full) return "Their";
  return full.trim().split(/\s+/)[0] ?? full;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    /* Flex centring, and a max width that fits the smallest phone anybody brings. */
    <main
      className="flex min-h-dvh items-center justify-center px-5 py-8"
      style={{ background: CREAM }}
    >
      <div className="w-full min-w-0 max-w-[420px]">{children}</div>
    </main>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[28px] border bg-white/85 p-6 text-center sm:p-7"
      style={{ borderColor: `${BROWN}1F` }}
    >
      {children}
    </motion.div>
  );
}
