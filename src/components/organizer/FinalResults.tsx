"use client";

import * as React from "react";
import { Award, Loader2, Mail, Trophy } from "lucide-react";

import { Button } from "@/components/ui";
import { divisionName, type FinalPlayer, signed } from "@/lib/domain/finalResults";
import {
  type CeremonyReport,
  closeTournament,
  finalSummary,
} from "@/lib/supabase/finalCeremony";
import { cn } from "@/lib/utils";

/**
 * Closing the tournament, from the top of the screen the director already has open.
 *
 * The winners are shown before anything is sent, because a certificate that has gone out is
 * awkward to take back — and because the moment a room wants is somebody reading the names
 * out, not a progress bar.
 *
 * Nothing here works anything out. The ranking is the same one the wall uses, the titles are
 * arithmetic on verified games, and this only reads and sends.
 */
export function FinalResults({ eventId, by }: { eventId: string; by: string }) {
  const [open, setOpen] = React.useState(false);
  const [players, setPlayers] = React.useState<FinalPlayer[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = React.useState<CeremonyReport | null>(null);

  /* One send per press, whatever a second tap in the same tick believes. */
  const sending = React.useRef(false);

  React.useEffect(() => {
    if (!open) return;
    let live = true;
    (async () => {
      const rows = await finalSummary(eventId);
      if (live) setPlayers(rows);
    })();
    return () => {
      live = false;
    };
  }, [open, eventId]);

  const send = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setProgress({ done: 0, total: players?.length ?? 0 });

    const out = await closeTournament(eventId, by, window.location.origin, (done, total) =>
      setProgress({ done, total }),
    );

    sending.current = false;
    setBusy(false);
    setProgress(null);
    setReport(out);
  };

  if (!open) {
    return (
      <div className="mt-4">
        <Button
          variant="secondary"
          icon={<Trophy className="size-4" />}
          onClick={() => setOpen(true)}
          className="w-full sm:w-auto"
        >
          Final results
        </Button>
      </div>
    );
  }

  const byDivision = new Map<string, FinalPlayer[]>();
  for (const p of players ?? []) {
    byDivision.set(p.division, [...(byDivision.get(p.division) ?? []), p]);
  }

  return (
    <div className="mt-4 rounded-feature border border-line bg-[rgb(var(--c-surface-strong))] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[14px] font-bold text-ink">
          <Trophy className="size-4 text-primary" /> Final results
        </p>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      {players === null ? (
        <p className="mt-4 flex items-center gap-2 text-[13px] text-muted">
          <Loader2 className="size-4 animate-spin" /> Working out the standings…
        </p>
      ) : players.length === 0 ? (
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          No verified games yet, so there is nothing to close. Results appear here as boards are
          confirmed.
        </p>
      ) : (
        <>
          {[...byDivision.entries()].map(([division, rows]) => (
            <div key={division} className="mt-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
                {divisionName(division)}
              </p>
              <div className="mt-1.5 space-y-1">
                {rows.slice(0, 3).map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      "flex items-center gap-3 rounded-control px-3 py-2",
                      p.rank === 1 ? "bg-primary-050" : "bg-white",
                    )}
                  >
                    <span className="num w-6 shrink-0 text-[15px] font-extrabold text-primary">
                      {p.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink">
                      {p.name}
                    </span>
                    <span className="num shrink-0 text-[12.5px] text-muted">
                      {p.wins}–{p.losses} · {signed(p.spread)}
                    </span>
                  </div>
                ))}
                {rows.length > 3 ? (
                  <p className="px-3 pt-0.5 text-[12px] text-muted">
                    and {rows.length - 3} more
                  </p>
                ) : null}
              </div>
            </div>
          ))}

          {report ? (
            <div className="mt-5 rounded-feature bg-white p-3.5">
              <p className="text-[13px] font-bold text-ink">
                {report.emailed} sent · {report.failed} not delivered
              </p>
              {/*
                Every code is a link, because this panel is where they exist.
                Certificates issued here are written to the database — verifiable by anyone,
                on any phone — but the awards screen builds its list from this browser's own
                storage and will not show them. Rather than leave the codes as text nobody can
                do anything with, each one opens the page a participant would see.
              */}
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                {report.lines.map((l) => (
                  <p key={l.code} className="text-[12.5px] leading-relaxed">
                    <span className="num text-muted">{l.number}</span>{" "}
                    <span className="font-semibold text-ink">{l.name}</span>{" "}
                    <span className="text-muted">— {l.title}</span>
                    {l.problem ? (
                      <span className="text-critical"> · {l.problem}</span>
                    ) : (
                      <span style={{ color: "#2F5D3A" }}> · sent</span>
                    )}{" "}
                    <a
                      href={`/verify/certificate/${l.code}`}
                      target="_blank"
                      rel="noreferrer"
                      className="num underline decoration-dotted underline-offset-2 text-muted"
                    >
                      {l.code}
                    </a>
                  </p>
                ))}
              </div>

              <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
                Every certificate above is in the database and can be checked by anyone at
                /verify. They will not appear on the Certificates screen, which lists only the
                ones prepared by hand in this browser.
              </p>
            </div>
          ) : (
            <>
              <p className="mt-5 text-[12.5px] leading-relaxed text-muted">
                Issues a certificate to all {players.length} players and emails each one their own
                title and record. Titles come from the verified games — nothing is chosen here.
              </p>
              <Button
                variant="primary"
                icon={busy ? <Loader2 className="size-4 animate-spin" /> : <Award className="size-4" />}
                disabled={busy}
                onClick={() => void send()}
                className="mt-3 w-full"
              >
                {busy && progress
                  ? `Sending ${progress.done} of ${progress.total}…`
                  : `Issue and email all ${players.length} certificates`}
              </Button>
              <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted">
                <Mail className="size-3" /> One at a time, and every outcome is reported by name.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
