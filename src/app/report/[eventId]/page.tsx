"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { selectScopedRegistrations, useEventStore } from "@/lib/store/useEventStore";
import { useFinanceStore } from "@/lib/store/useFinanceStore";
import { useCertificateStore } from "@/lib/store/useCertificateStore";
import { useLiveStore } from "@/lib/store/useLiveStore";
import { useStore } from "@/lib/store/useStore";
import { activeEvent } from "@/lib/domain/scope";
import { expenseTotals, feeTotals, financePosition } from "@/lib/engine/finance";
import { buildDocument, Metric, ReportSection } from "@/lib/engine/reporting";
import { certificateSummary } from "@/lib/engine/certificates";
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
  const certs = useCertificateStore();
  const live = useLiveStore();
  const app = useStore();

  /*
   * The generation timestamp is fixed on first render. A report that quietly
   * restamps itself every time it is opened is not a record of anything.
   */
  const [generatedAt] = React.useState(() => new Date().toISOString());

  const event = activeEvent(store.events, {
    organizationId: store.activeOrganizationId,
    eventId: params.eventId,
  });

  if (!event) {
    return (
      <main className="mx-auto max-w-[820px] px-6 py-20 text-center">
        <p className="text-[15px] font-semibold text-ink">Report unavailable</p>
        <p className="mt-1 text-[13px] text-muted">This event could not be found.</p>
      </main>
    );
  }

  const registrations = selectScopedRegistrations(store);
  const expenses = finance.expensesFor(event.id);
  const income = finance.incomeFor(event.id);
  const certificates = certs.certificatesFor(event.id);
  const certSummary = certificateSummary(certificates);

  const fees = feeTotals(registrations);
  const costs = expenseTotals(expenses);
  const position = financePosition(fees, costs, income);

  const round = live.currentRound(event.id);
  const progress = live.progressFor(event.id, round);

  // Returning participants are those whose email appears on an earlier event.
  const emailsElsewhere = new Set(
    store.registrations
      .filter((r) => r.eventId !== event.id)
      .map((r) => r.email.trim().toLowerCase()),
  );

  const document = buildDocument({
    eventName: event.name,
    organizer: event.organizer,
    startDate: formatDate(event.startDate),
    venue: event.venueName,
    city: event.city,
    currency: event.currency,
    capacity: event.capacity,
    rounds: event.rounds,

    registrations: registrations.map((r) => ({
      status: r.status,
      paymentStatus: r.paymentStatus,
      division: (r.confirmedDivision ?? r.preferredDivision).replace(/-/g, " "),
      city: r.city,
      club: r.club,
      isReturning: emailsElsewhere.has(r.email.trim().toLowerCase()),
    })),

    attendance: { checkedIn: live.checkedInCount(event.id) },

    play: {
      boardsTotal: progress.totalBoards,
      boardsVerified: progress.verified,
      conflicts: progress.conflicts,
      averageScore: 0,
      highestScore: 0,
      averageSpread: 0,
      roundsCompleted: Math.max(0, round - 1),
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
