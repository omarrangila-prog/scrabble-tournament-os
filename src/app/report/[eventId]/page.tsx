"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useEventStore } from "@/lib/store/useEventStore";
import { useFinanceStore } from "@/lib/store/useFinanceStore";
import { useStore } from "@/lib/store/useStore";
import { useEventById } from "@/lib/supabase/useCurrentEvent";
import { useRoster } from "@/lib/supabase/useRoster";
import { useGames } from "@/lib/supabase/useGames";
import { useCertificates } from "@/lib/supabase/useCertificates";
import { fullRoundProgress } from "@/lib/domain/games";
import { divisionFor, reportStatusFor } from "@/lib/domain/roster";
import { field } from "@/lib/supabase/organizer";
import { InterestAnswer, ParticipationTrack } from "@/lib/firebase/schema";
import { expenseTotals, feeTotals, financePosition } from "@/lib/engine/finance";
import { buildDocument, Metric, ReportSection } from "@/lib/engine/reporting";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

/**
 * The report, as a document.
 *
 * Deliberately outside the application shell: no sidebar, no navigation, no
 * buttons, no filters. Everything a reader sees here is content, so what is on
 * screen is exactly what prints and exactly what a sponsor receives.
 *
 * Controls belong to the Reports screen inside the app, which links here.
 */
export default function ReportDocumentPage() {
  const params = useParams<{ eventId: string }>();
  const store = useEventStore();
  const finance = useFinanceStore();
  const app = useStore();

  /*
   * The report reads the database, like every other screen.
   *
   * It read browser storage for everyone who registered, who arrived, which round was
   * reached and how many boards were played — none of which that storage has held since
   * the event moved to Postgres. A finished tournament would have printed a document
   * saying nobody registered, nobody arrived and no games were played, over the organizer's
   * name, for a sponsor.
   */
  const roster = useRoster(params.eventId);
  const games = useGames(params.eventId, app.tournament.id);
  const issued = useCertificates(params.eventId);
  const { event: storedEvent, loaded: eventLoaded } = useEventById(params.eventId);

  /*
   * The generation timestamp is fixed on first render. A report that quietly
   * restamps itself every time it is opened is not a record of anything.
   */
  const [generatedAt] = React.useState(() => new Date().toISOString());

  if (!eventLoaded) return null;

  if (!storedEvent) {
    return (
      <main className="mx-auto max-w-[820px] px-6 py-20 text-center">
        <p className="text-[15px] font-semibold text-ink">Report unavailable</p>
        <p className="mt-1 text-[13px] text-muted">This event could not be found.</p>
      </main>
    );
  }
  const event = storedEvent;

  const expenses = finance.expensesFor(event.id);
  const income = finance.incomeFor(event.id);
  /*
   * Certificates as the database holds them, which is what a code on a printed certificate
   * resolves against. The studio's local list is this browser's working copy.
   */
  const storedCertificates = [...issued.byCode.values()];
  const certSummary = {
    total: storedCertificates.length,
    issued: storedCertificates.filter((c) => c.status === "issued").length,
    revoked: storedCertificates.filter((c) => c.status === "revoked").length,
  };

  /*
   * Money, counted from the registrations in the database. This read browser storage, so
   * every financial figure in the report — collected, outstanding, discounts — was zero
   * however much had actually been paid.
   */
  const fees = feeTotals(
    roster.registrations.map((r) => ({
      amountDue: r.amountDue,
      discountAmount: Number(field(r, "discountAmount") ?? 0) || 0,
      paymentStatus: r.paymentStatus,
      status: r.registrationStatus,
    })),
  );
  const costs = expenseTotals(expenses);
  const position = financePosition(fees, costs, income);

  const round = games.round;
  const progress = fullRoundProgress(games.games, round);

  /*
   * Scores actually recorded, rather than the zeros this reported for every event.
   * Only verified games count — an unconfirmed score is not a result yet.
   */
  const playedScores = games.games
    .filter((g) => g.status === "verified" && g.scoreA !== null && g.scoreB !== null)
    .flatMap((g) => [g.scoreA as number, g.scoreB as number]);

  const spreads = games.games
    .filter((g) => g.status === "verified" && g.scoreA !== null && g.scoreB !== null)
    .map((g) => Math.abs((g.scoreA as number) - (g.scoreB as number)));

  const averageOf = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;

  // Returning participants are those whose email appears on an earlier event.
  const emailsElsewhere = new Set(
    store.registrations
      .filter((r) => r.eventId !== event.id)
      .map((r) => r.email.trim().toLowerCase()),
  );

  const document = buildDocument({
    eventName: event.name,
    // The federation running the event, not a per-event field — this app has exactly one.
    organizer: "Blufy's Federation",
    startDate: event.details.startDate ? formatDate(event.details.startDate) : "",
    venue: event.details.venueName ?? "",
    city: event.details.city ?? "",
    currency: event.details.currency ?? "PKR",
    capacity: event.details.capacity ?? 0,
    rounds: event.details.rounds ?? app.tournament.totalRounds,

    registrations: roster.registrations.map((r) => ({
      /* The database says 'submitted'; the report is written in terms of confirmed entries. */
      status: reportStatusFor(r.registrationStatus),
      paymentStatus: r.paymentStatus,
      division: divisionFor(r.playingLevel).replace(/-/g, " "),
      city: field(r, "city") ?? "",
      club: field(r, "club") ?? field(r, "institution") ?? "",
      isReturning: emailsElsewhere.has(r.email.trim().toLowerCase()),
      track: (field(r, "participationTrack") ?? undefined) as ParticipationTrack | undefined,
      claimedMembership: Boolean(field(r, "membershipNumber")),
      /* Verified payment is what stands behind a membership rate having been given. */
      membershipVerified:
        Boolean(field(r, "membershipNumber")) && r.paymentStatus === "verified",
      futureInterest: field(r, "jammingSessionInterest") as InterestAnswer | undefined,
    })),

    attendance: { checkedIn: roster.counts.checkedIn },

    play: {
      boardsTotal: progress.totalBoards,
      boardsVerified: progress.verified,
      conflicts: progress.conflicts,
      averageScore: averageOf(playedScores),
      highestScore: playedScores.length ? Math.max(...playedScores) : 0,
      averageSpread: averageOf(spreads),
      /* A round counts as completed once every one of its boards is verified. */
      roundsCompleted: progress.complete ? round : Math.max(0, round - 1),
    },

    fees,
    expenses: costs,
    position,

    certificates: {
      prepared: certSummary.total,
      issued: certSummary.issued,
      withdrawn: certSummary.revoked,
    },
    notifications: { sent: 0, failed: 0 },

    generatedAt,
    generatedBy: app.currentUser?.name ?? "Sir Hani",
  });

  return (
    <main className="mx-auto max-w-[820px] bg-white px-8 py-10 text-[#12172A] print:px-0 print:py-0">
      {/* Cover ------------------------------------------------------------ */}
      <header className="border-b-2 border-[#12172A] pb-5">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#5A6178]">
          {document.organizer}
        </p>
        <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-[-0.02em]">
          {document.eventName}
        </h1>
        <p className="mt-1 text-[14px] text-[#5A6178]">{document.title}</p>
        <p className="mt-3 text-[12.5px] text-[#5A6178]">{document.subtitle}</p>
      </header>

      {document.sections.map((section, index) => (
        <ReportPageSection key={section.page} section={section} index={index} />
      ))}

      <footer className="mt-10 border-t border-[#D9DDE7] pt-4 text-[11px] text-[#5A6178]">
        <p>
          Generated {formatDateTime(document.generatedAt)} by {document.generatedBy}.
        </p>
        <p className="mt-0.5">
          Revenue figures count verified payments only. Play figures exclude boards without a
          verified result.
        </p>
      </footer>
    </main>
  );
}

/* -------------------------------------------------------------------------- */

function ReportPageSection({ section, index }: { section: ReportSection; index: number }) {
  return (
    <section className={cn("mt-8", index > 0 && "break-before-page")}>
      <div className="flex items-baseline gap-3 border-b border-[#D9DDE7] pb-2">
        <span className="text-[11px] font-bold text-[#7357F6]">
          {String(index + 1).padStart(2, "0")}
        </span>
        <h2 className="text-[17px] font-extrabold tracking-[-0.01em]">{section.title}</h2>
      </div>

      {section.summary ? (
        <p className="mt-3 text-[13.5px] leading-relaxed">{section.summary}</p>
      ) : null}

      {section.metrics.length ? (
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {section.metrics.map((metric) => (
            <MetricBlock key={metric.label} metric={metric} />
          ))}
        </div>
      ) : null}

      {section.tables.map((table) =>
        table.rows.length ? (
          <div key={table.title} className="mt-5">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#5A6178]">
              {table.title}
            </h3>
            <table className="mt-2 w-full border-collapse text-[12.5px]">
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.label} className="border-b border-[#EEF0F5]">
                    <td className="py-1.5 pr-3 capitalize">{row.label}</td>
                    <td className="w-[70px] py-1.5 text-right font-semibold tabular-nums">
                      {row.count.toLocaleString("en-PK")}
                    </td>
                    <td className="w-[110px] py-1.5 pl-3">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#EEF0F5]">
                          <span
                            className="block h-full rounded-full bg-[#7357F6]"
                            style={{ width: `${Math.min(100, row.share)}%` }}
                          />
                        </span>
                        <span className="w-[34px] text-right tabular-nums text-[#5A6178]">
                          {row.share}%
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null,
      )}

      {section.observations.length ? (
        <div className="mt-5 border-l-2 border-[#7357F6] pl-4">
          {section.observations.map((observation, i) => (
            <p key={i} className="text-[12.5px] leading-relaxed text-[#3C4356]">
              {observation}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MetricBlock({ metric }: { metric: Metric }) {
  return (
    <div>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#5A6178]">
        {metric.label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-[19px] font-extrabold tabular-nums",
          metric.tone === "negative"
            ? "text-[#C0392B]"
            : metric.tone === "warning"
              ? "text-[#A76D16]"
              : metric.tone === "positive"
                ? "text-[#12855C]"
                : "text-[#12172A]",
        )}
      >
        {metric.value}
      </p>
      {metric.sub ? <p className="text-[11.5px] text-[#5A6178]">{metric.sub}</p> : null}
      {metric.caveat ? (
        <p className="mt-0.5 text-[10.5px] italic leading-snug text-[#8A90A3]">{metric.caveat}</p>
      ) : null}
    </div>
  );
}
