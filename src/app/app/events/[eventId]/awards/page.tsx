"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  Award,
  BadgeCheck,
  Check,
  FileCheck2,
  Info,
  Printer,
  Send,
  ShieldOff,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SearchInput,
  Stat,
  Tabs,
  Textarea,
} from "@/components/ui";
import { useEventStore } from "@/lib/store/useEventStore";
import { useCertificateStore } from "@/lib/store/useCertificateStore";
import { useStore } from "@/lib/store/useStore";
import { activeEvent } from "@/lib/domain/scope";
import {
  canIssue,
  Certificate,
  CERTIFICATE_KIND_LABEL,
  certificateSummary,
  planBulkIssue,
  verificationUrl,
} from "@/lib/engine/certificates";
import { buildCitation, PerformanceRecord, tierFor, unsupportedClaims } from "@/lib/engine/citations";
import { performanceRecordsFor } from "@/lib/engine/standings";
import { qrToDataUri } from "@/lib/qr/qrcode";
import { cn } from "@/lib/utils";

const STATUS_TONE = {
  draft: "neutral",
  issued: "success",
  revoked: "critical",
} as const;

/**
 * Certificate Studio.
 *
 * Certificates are prepared from the record, reviewed, then issued. Wording is
 * derived from verified results rather than written freely, and every
 * certificate carries the figures behind its citation so a director can check
 * a claim instead of trusting it.
 */
export default function AwardsPage() {
  const params = useParams<{ eventId: string }>();
  const store = useEventStore();
  const certs = useCertificateStore();
  const app = useStore();

  const [tab, setTab] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [preview, setPreview] = React.useState<Certificate | null>(null);
  const [revoking, setRevoking] = React.useState<Certificate | null>(null);

  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const event = activeEvent(store.events, {
    organizationId: store.activeOrganizationId,
    eventId: params.eventId,
  });

  if (!event) return null;

  const all = certs.certificatesFor(event.id);
  const summary = certificateSummary(all);

  const resultsFinal = event.state === "completed" || event.state === "final-review";
  const ctx = { resultsFinal, outstandingDisputes: 0 };
  const plan = planBulkIssue(all, ctx);

  /*
   * Performance records come from the verified game record via the standings
   * engine. Nothing here is synthesised: a player with no verified game gets no
   * record, and an event with no tournament behind it yields no certificates.
   *
   * The event must name its own tournament. Reading whichever tournament
   * happens to be loaded would let one event's certificates be written from
   * another event's games — the same scoping mistake the workspace exists to
   * prevent.
   */
  const linkedTournament =
    event.tournamentId && event.tournamentId === app.tournament.id ? app.tournament : null;

  const records = linkedTournament
    ? performanceRecordsFor(
        app.players,
        app.pairings,
        linkedTournament,
        app.divisions.map((d) => d.id),
      )
    : [];
  const hasResults = records.length > 0;

  const filtered = all
    .filter((c) => (tab === "all" ? true : c.status === tab))
    .filter((c) =>
      query.trim()
        ? `${c.recipientName} ${c.code} ${c.statement}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())
        : true,
    );

  const generate = () => {
    const result = certs.prepareFromStandings(event.id, records);
    const total = result.winners + result.participation;

    app.toast({
      title: total
        ? `${total} certificate${total === 1 ? "" : "s"} prepared`
        : "Nothing new to prepare",
      description: total
        ? `${result.winners} placement, ${result.participation} participation. All drafts until you issue them.`
        : "Everyone already has a certificate for this event.",
      tone: total ? "success" : "info",
    });
  };

  const issueEverythingReady = () => {
    const label = `Issue ${plan.issuable.length} certificate${plan.issuable.length === 1 ? "" : "s"}?`;
    const detail = plan.blocked.length
      ? `\n\n${plan.blocked.length} will be skipped and left as drafts.`
      : "";
    if (!window.confirm(`${label}${detail}\n\nIssued certificates become publicly verifiable.`))
      return;

    const result = certs.issueAll(event.id, app.currentUser?.name ?? "Sir Hani", ctx);
    app.toast({
      title: `${result.issued} certificate${result.issued === 1 ? "" : "s"} issued`,
      description: result.blocked.length
        ? `${result.blocked.length} skipped — see the drafts tab.`
        : "Every prepared certificate is now verifiable.",
      tone: "success",
    });
  };

  return (
    <div>
      <PageHeader
        title="Certificate Studio"
        subtitle="Wording comes from verified results. Nothing is invented."
        badge={
          <Badge tone={resultsFinal ? "success" : "warning"}>
            {resultsFinal ? "Results final" : "Results provisional"}
          </Badge>
        }
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              icon={<Wand2 className="size-4" />}
              disabled={!hasResults}
              onClick={generate}
            >
              Prepare from standings
            </Button>
            <Button
              variant="primary"
              icon={<Send className="size-4" />}
              disabled={plan.issuable.length === 0}
              onClick={issueEverythingReady}
            >
              Issue {plan.issuable.length || ""} ready
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Prepared" value={summary.total} sub="all certificates" icon={<FileCheck2 className="size-5" />} tone="primary" />
        <Stat label="Issued" value={summary.issued} sub="publicly verifiable" icon={<BadgeCheck className="size-5" />} tone="success" />
        <Stat label="Drafts" value={summary.draft} sub={plan.issuable.length ? `${plan.issuable.length} ready` : "none ready"} icon={<Award className="size-5" />} tone={summary.draft ? "warning" : "neutral"} />
        <Stat label="Withdrawn" value={summary.revoked} sub={summary.revoked ? "still resolve when scanned" : "none"} icon={<ShieldOff className="size-5" />} tone={summary.revoked ? "critical" : "neutral"} />
      </div>

      {!resultsFinal ? (
        <div className="mt-3 flex items-start gap-3 rounded-feature bg-warning-050 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-[#a76d16]" />
          <p className="text-[13px] leading-relaxed text-[#a76d16]">
            <strong className="font-semibold">Results are still provisional.</strong> Participation
            certificates can be issued now; placement certificates are held back until final review,
            so none asserts a placing that could still change.
          </p>
        </div>
      ) : null}

      {!hasResults ? (
        <div className="mt-3 flex items-start gap-3 rounded-feature bg-warning-050 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-[#a76d16]" />
          <p className="text-[13px] leading-relaxed text-[#a76d16]">
            <strong className="font-semibold">
              {event.tournamentId
                ? "No verified results yet."
                : "No tournament is linked to this event yet."}
            </strong>{" "}
            Certificates state what a player achieved, so there is nothing to prepare until games
            have been played and verified. Nothing is generated from an unfinished tournament.
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex items-start gap-3 rounded-feature bg-[rgb(var(--c-surface-soft))] px-4 py-3">
        <Info className="mt-0.5 size-4.5 shrink-0 text-muted" />
        <p className="text-[12.5px] leading-relaxed text-muted">
          Citations are built from wins, spread, placing and attendance — figures the tournament
          computed. What a participant wrote about their own experience is never used as evidence.
          Open any certificate to see the figures behind its wording.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "all", label: "All", count: all.length },
            { id: "draft", label: "Drafts", count: summary.draft },
            { id: "issued", label: "Issued", count: summary.issued },
            { id: "revoked", label: "Withdrawn", count: summary.revoked },
          ]}
        />
        <div className="ml-auto w-full sm:w-[280px]">
          <SearchInput value={query} onChange={setQuery} placeholder="Search name or code" />
        </div>
      </div>

      {filtered.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const check = canIssue(c, ctx);
            const record = records.find((r) => r.playerId === c.recipientId);
            const problems = record ? unsupportedClaims(c.detail ?? c.statement, record) : [];

            return (
              <div
                key={c.id}
                className={cn(
                  "rounded-feature border p-4",
                  c.status === "issued"
                    ? "border-success bg-success-050/40"
                    : c.status === "revoked"
                      ? "border-critical bg-critical-050/40"
                      : "border-line bg-[rgb(var(--c-surface-soft))]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-ink">{c.recipientName}</p>
                    <p className="text-[11.5px] text-muted">
                      {CERTIFICATE_KIND_LABEL[c.kind]}
                      {c.division ? ` · ${c.division}` : ""}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[c.status]}>
                    {c.status === "revoked"
                      ? "Withdrawn"
                      : c.status[0].toUpperCase() + c.status.slice(1)}
                  </Badge>
                </div>

                <p className="mt-2 text-[13px] font-semibold text-ink">{c.statement}</p>
                {c.detail ? (
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">{c.detail}</p>
                ) : null}

                {problems.length ? (
                  <div className="mt-2 rounded-control bg-critical-050 px-3 py-2">
                    {problems.map((p, i) => (
                      <p key={i} className="text-[11.5px] leading-relaxed text-critical">
                        {p}
                      </p>
                    ))}
                  </div>
                ) : null}

                {c.status === "draft" && !check.ready ? (
                  <p className="mt-2 text-[11.5px] leading-snug text-[#a76d16]">{check.reason}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setPreview(c)}>
                    View
                  </Button>
                  {c.status === "draft" ? (
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!check.ready}
                      onClick={() => {
                        const r = certs.issue(c.id, app.currentUser?.name ?? "Sir Hani", ctx);
                        app.toast({
                          title: r.ok ? "Certificate issued" : "Cannot issue",
                          description: r.ok ? c.recipientName : r.reason,
                          tone: r.ok ? "success" : "warning",
                        });
                      }}
                    >
                      Issue
                    </Button>
                  ) : null}
                  {c.status === "issued" ? (
                    <Button size="sm" variant="ghost" onClick={() => setRevoking(c)}>
                      Withdraw
                    </Button>
                  ) : null}
                  <code className="num ml-auto text-[11px] tracking-wide text-faint">{c.code}</code>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="mt-4">
          <EmptyState
            icon={<Sparkles className="size-5" />}
            title={all.length ? "Nothing matches" : "No certificates yet"}
            description={
              all.length
                ? "Try a different search or tab."
                : hasResults
                  ? "Prepare a full set from the standings, with wording drawn from each player's own results."
                  : "Certificates are written from verified results. Once games have been played and verified, a full set can be prepared here."
            }
            action={
              all.length ? undefined : (
                <Button
                  variant="primary"
                  icon={<Wand2 className="size-4" />}
                  disabled={!hasResults}
                  onClick={generate}
                >
                  Prepare from standings
                </Button>
              )
            }
          />
        </Card>
      )}

      <PreviewModal
        certificate={preview}
        eventName={event.name}
        origin={origin}
        record={records.find((r) => r.playerId === preview?.recipientId)}
        onClose={() => setPreview(null)}
      />

      <RevokeModal
        certificate={revoking}
        onClose={() => setRevoking(null)}
        onRevoke={(reason) => {
          if (!revoking) return;
          const r = certs.revoke(revoking.id, app.currentUser?.name ?? "Sir Hani", reason);
          app.toast({
            title: r.ok ? "Certificate withdrawn" : "Cannot withdraw",
            description: r.ok ? `${revoking.recipientName} — ${reason}` : r.reason,
            tone: r.ok ? "success" : "warning",
          });
          setRevoking(null);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PreviewModal({
  certificate,
  eventName,
  origin,
  record,
  onClose,
}: {
  certificate: Certificate | null;
  eventName: string;
  origin: string;
  record?: PerformanceRecord;
  onClose: () => void;
}) {
  if (!certificate) return null;
  const url = origin ? verificationUrl(origin, certificate.code) : "";
  const citation = record ? buildCitation(record, tierFor(record)) : null;

  return (
    <Modal
      open
      onClose={onClose}
      title="Certificate"
      subtitle={CERTIFICATE_KIND_LABEL[certificate.kind]}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            icon={<Printer className="size-4" />}
            onClick={() => window.print()}
          >
            Print
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div
          className={cn(
            "rounded-feature border-2 p-7 text-center",
            certificate.status === "revoked"
              ? "border-critical bg-critical-050"
              : "border-gold bg-gradient-to-br from-gold-050 to-[rgb(var(--c-surface-strong))]",
          )}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted">{eventName}</p>
          <p className="mt-4 text-[12.5px] uppercase tracking-[0.14em] text-muted">
            {certificate.statement}
          </p>
          <p className="text-champion mt-1.5 text-[26px] font-extrabold tracking-[-0.02em]">
            {certificate.recipientName}
          </p>
          {certificate.detail ? (
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{certificate.detail}</p>
          ) : null}

          {certificate.status === "revoked" ? (
            <p className="mt-4 rounded-control bg-white/70 px-3 py-2 text-[12px] font-semibold text-critical">
              Withdrawn — {certificate.revokedReason}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col items-center gap-2">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrToDataUri(url, { size: 120 })}
                alt={`Verification QR for certificate ${certificate.code}`}
                width={120}
                height={120}
                className="rounded-compact bg-white p-1.5"
              />
            ) : null}
            <code className="num text-[13px] font-bold tracking-[0.12em] text-ink">
              {certificate.code}
            </code>
            <p className="text-[10.5px] text-faint">Scan to verify</p>
          </div>

          {certificate.issuedBy ? (
            <p className="mt-4 text-[11px] text-muted">Issued by {certificate.issuedBy}</p>
          ) : (
            <p className="mt-4 text-[11px] text-[#a76d16]">Draft — not yet issued</p>
          )}
        </div>

        {/* The figures behind the wording, so a claim can be checked. */}
        {citation?.evidence.length ? (
          <div className="rounded-feature bg-[rgb(var(--c-surface-soft))] p-4">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
              Evidence for this wording
            </p>
            <ul className="mt-2 space-y-1">
              {citation.evidence.map((e, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-ink">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                  {e}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function RevokeModal({
  certificate,
  onClose,
  onRevoke,
}: {
  certificate: Certificate | null;
  onClose: () => void;
  onRevoke: (reason: string) => void;
}) {
  const [reason, setReason] = React.useState("");

  const [lastId, setLastId] = React.useState<string | null>(null);
  if (certificate && certificate.id !== lastId) {
    setLastId(certificate.id);
    setReason("");
  }
  if (!certificate && lastId !== null) setLastId(null);

  return (
    <Modal
      open={!!certificate}
      onClose={onClose}
      title="Withdraw certificate"
      subtitle="The certificate stays verifiable and will report that it was withdrawn."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!reason.trim()} onClick={() => onRevoke(reason)}>
            Withdraw
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <p className="text-[13px] leading-relaxed text-muted">
          {certificate?.recipientName} — {certificate?.statement}
        </p>
        <Field label="Reason" required hint="Shown to anyone who verifies this certificate.">
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Result corrected after arbiter review."
          />
        </Field>
      </div>
    </Modal>
  );
}
