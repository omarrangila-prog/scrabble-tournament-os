"use client";

import * as React from "react";
import { ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  Award,
  BadgeCheck,
  Check,
  FileCheck2,
  Info,
  Mail,
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
import { useRoster } from "@/lib/supabase/useRoster";
import { useGames } from "@/lib/supabase/useGames";
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
import { unverifiableCertificates } from "@/lib/domain/certificateSync";
import { personalNote } from "@/lib/engine/personalNote";
import { issueCertificate, revokeCertificate, saveCertificate } from "@/lib/supabase/certificates";
import { useCertificates } from "@/lib/supabase/useCertificates";
import { CertificateSheet } from "@/components/certificates/CertificateSheet";
import { cn, formatDate } from "@/lib/utils";
import { emailCertificate } from "@/lib/email/client";
import { useDeliverability, whatsappLink } from "@/lib/email/deliverability";

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

  /*
   * Awards are earned in games, and the games are in the database. This page read
   * `app.players` and `app.pairings` from browser storage, so the Certificate
   * Studio could never find a performance to certify — which is the one thing it
   * exists to do.
   */
  const roster = useRoster(ACTIVE_EVENT_ID);
  const issuedInDatabase = useCertificates(ACTIVE_EVENT_ID);
  const delivery = useDeliverability();
  const games = useGames(ACTIVE_EVENT_ID, app.tournament.id);

  const [tab, setTab] = React.useState("all");
  const [emailingAll, setEmailingAll] = React.useState(false);
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

  /**
   * Issues a certificate to the database as well as to this browser.
   *
   * The store's own guards run first — they are what refuse a claim the results cannot
   * support — and only then is it written where anyone can verify it. Certificates used to
   * live in browser storage alone, so the QR printed on them resolved to "no certificate
   * matches that code" on every device except the one that issued it.
   *
   * If the write fails the local issue is rolled back, so the studio never shows a
   * certificate as issued when the code it prints would not verify.
   */
  const issueOne = async (c: Certificate, opts?: { quiet?: boolean }): Promise<boolean> => {
    const by = app.currentUser?.name ?? roster.signedInAs ?? "Director";
    const local = certs.issue(c.id, by, ctx);

    if (!local.ok) {
      if (!opts?.quiet)
        app.toast({ title: "Cannot issue", description: local.reason, tone: "warning" });
      return false;
    }

    const record = records.find((r) => r.playerId === c.recipientId);
    const saved = await saveCertificate({
      eventId: event.id,
      code: c.code,
      kind: c.kind,
      recipientId: c.recipientId,
      recipientName: c.recipientName,
      division: c.division,
      statement: c.statement,
      detail: c.detail,
      personalNote: record ? personalNote(record, records)?.text : undefined,
    });

    const issued = saved.ok ? await issueCertificate(c.code, by) : { ok: false, message: saved.message };

    if (!issued.ok) {
      certs.revoke(c.id, by, "Not saved to the database");
      if (!opts?.quiet)
        app.toast({
          title: "Not issued",
          description:
            issued.message ?? "The certificate was not saved, so its code would not verify.",
          tone: "critical",
        });
      return false;
    }

    if (opts?.quiet) return true;

    issuedInDatabase.reload();
    app.toast({
      title: `Certificate issued to ${c.recipientName}`,
      description: `Code ${c.code} now verifies at /verify.`,
      tone: "success",
    });
    return true;
  };
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
        roster.players,
        games.pairings,
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

    void issueEveryReady();
  };

  /**
   * Withdraws a certificate here and in the database.
   *
   * The database write is what matters: until it lands, anybody scanning the withdrawn
   * certificate is still told it stands. So a failure is reported as exactly that, rather
   * than as a withdrawal that only this laptop knows about.
   */
  const withdrawOne = async (c: Certificate, reason: string) => {
    const by = app.currentUser?.name ?? roster.signedInAs ?? "Director";
    const local = certs.revoke(c.id, by, reason);

    if (!local.ok) {
      app.toast({ title: "Cannot withdraw", description: local.reason, tone: "warning" });
      return;
    }

    const remote = await revokeCertificate(c.code, by, reason);
    issuedInDatabase.reload();

    app.toast({
      title: remote.ok ? "Certificate withdrawn" : "Withdrawn here only",
      description: remote.ok
        ? `${c.recipientName} — ${reason}. Anyone checking the code now sees it as void.`
        : `${remote.message ?? "The database was not reached."} The code still verifies as valid until this succeeds.`,
      tone: remote.ok ? "success" : "critical",
    });
  };

  /**
   * Issues every ready certificate, one at a time.
   *
   * Sequential rather than parallel: each one is a separate claim, and a partial failure
   * has to be reportable as "these are verifiable, these are not" rather than as one
   * ambiguous error over a batch.
   */
  /**
   * Certificates this browser shows as issued that the database has never seen.
   *
   * These are the dangerous ones: the studio says issued, the paper carries a QR, and the
   * code resolves to nothing for the person holding it. They exist because certificates
   * used to be issued to browser storage alone. Listing them is the only way anybody would
   * find out before a participant did.
   */
  const unverifiable = issuedInDatabase.loaded
    ? unverifiableCertificates(all, issuedInDatabase.issuedCodes)
    : [];

  /**
   * Emails every issued certificate, and reports what actually happened.
   *
   * One at a time, counting outcomes separately, because the useful answer is "31 sent,
   * 4 had no address, 2 were refused" — not a single tick that hides which of forty
   * people never heard anything.
   */
  const emailAllIssued = async () => {
    const issued = all.filter((c) => c.status === "issued");
    const withAddress = issued
      .map((c) => ({
        certificate: c,
        email: roster.registrations.find((r) => r.id === c.recipientId)?.email ?? "",
      }))
      .filter((x) => !!x.email);

    const missing = issued.length - withAddress.length;

    if (withAddress.length === 0) {
      app.toast({
        title: "Nothing to email",
        description: issued.length
          ? `None of the ${issued.length} issued certificates has an email address on file. Use WhatsApp from each certificate instead.`
          : "No certificates have been issued yet.",
        tone: "warning",
      });
      return;
    }

    if (
      !window.confirm(
        `Email ${withAddress.length} certificate${withAddress.length === 1 ? "" : "s"}?` +
          (missing ? `\n\n${missing} have no email address and will be skipped.` : "") +
          (delivery.status && !delivery.status.canReachAnyone
            ? "\n\nNo sending domain is verified, so these will probably only reach the account owner."
            : ""),
      )
    ) {
      return;
    }

    setEmailingAll(true);
    let sent = 0;
    const refused: string[] = [];

    for (const { certificate: c, email } of withAddress) {
      const record = records.find((r) => r.playerId === c.recipientId);
      const outcome = await emailCertificate({
        to: email,
        recipientName: c.recipientName,
        statement: c.statement,
        detail: c.detail,
        personalNote: record ? personalNote(record, records)?.text : undefined,
        code: c.code,
        eventName: event.name,
        eventDate: formatDate(event.startDate),
        verifyUrl: origin ? verificationUrl(origin, c.code) : "",
      });

      if (outcome.ok) sent += 1;
      else refused.push(c.recipientName);
    }
    setEmailingAll(false);

    app.toast({
      title: `${sent} of ${withAddress.length} emailed`,
      description: [
        missing ? `${missing} had no address.` : "",
        refused.length ? `Refused for ${refused.slice(0, 3).join(", ")}${refused.length > 3 ? "…" : ""}.` : "",
        sent && !refused.length && !missing ? "Every issued certificate has been sent." : "",
      ]
        .filter(Boolean)
        .join(" "),
      tone: refused.length ? "warning" : "success",
    });
  };

  /** Re-issues them, so the code each one prints resolves. */
  const publishUnverifiable = async () => {
    let fixed = 0;
    for (const c of unverifiable) {
      const by = c.issuedBy ?? app.currentUser?.name ?? roster.signedInAs ?? "Director";
      const record = records.find((r) => r.playerId === c.recipientId);
      const saved = await saveCertificate({
        eventId: event.id,
        code: c.code,
        kind: c.kind,
        recipientId: c.recipientId,
        recipientName: c.recipientName,
        division: c.division,
        statement: c.statement,
        detail: c.detail,
        personalNote: record ? personalNote(record, records)?.text : undefined,
      });
      if (saved.ok && (await issueCertificate(c.code, by)).ok) fixed += 1;
    }

    issuedInDatabase.reload();
    app.toast({
      title: fixed ? `${fixed} certificate${fixed === 1 ? "" : "s"} now verify` : "Nothing published",
      description: fixed
        ? "Their codes resolve for anyone who scans them."
        : "The database was not reached. The codes still do not resolve.",
      tone: fixed ? "success" : "critical",
    });
  };

  const issueEveryReady = async () => {
    const by = app.currentUser?.name ?? roster.signedInAs ?? "Director";
    let issued = 0;
    const failed: string[] = [];

    for (const c of plan.issuable) {
      const ok = await issueOne(c, { quiet: true });
      if (ok) issued += 1;
      else failed.push(c.recipientName);
    }

    issuedInDatabase.reload();

    app.toast({
      title: `${issued} certificate${issued === 1 ? "" : "s"} issued`,
      description: failed.length
        ? `${failed.length} could not be saved and stayed as drafts: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}`
        : `Issued by ${by}. Every one of them now verifies at /verify.`,
      tone: failed.length ? "warning" : "success",
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
            {/*
              * Sending them all, which is what "share these with everyone" means. Offered
              * only once something is issued — a draft has nothing to send.
              */}
            {summary.issued > 0 ? (
              <Button
                variant="secondary"
                icon={<Mail className="size-4" />}
                disabled={emailingAll}
                onClick={() => void emailAllIssued()}
              >
                {emailingAll ? "Sending…" : `Email ${summary.issued} issued`}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Prepared" value={summary.total} sub="all certificates" icon={<FileCheck2 className="size-5" />} tone="primary" />
        <Stat
          label="Issued"
          value={summary.issued}
          /* Counted from the database, because that is what a scanned code reads. */
          sub={
            !issuedInDatabase.loaded
              ? "checking verification"
              : unverifiable.length
                ? `${summary.issued - unverifiable.length} verifiable`
                : "publicly verifiable"
          }
          icon={<BadgeCheck className="size-5" />}
          tone="success"
        />
        <Stat label="Drafts" value={summary.draft} sub={plan.issuable.length ? `${plan.issuable.length} ready` : "none ready"} icon={<Award className="size-5" />} tone={summary.draft ? "warning" : "neutral"} />
        <Stat label="Withdrawn" value={summary.revoked} sub={summary.revoked ? "still resolve when scanned" : "none"} icon={<ShieldOff className="size-5" />} tone={summary.revoked ? "critical" : "neutral"} />
      </div>

      {/*
        * What will happen if these are emailed, said before anybody presses send.
        *
        * The provider accepts every request and then delivers only to the account owner
        * until a domain is verified. Without this the director learns that after telling
        * a room full of people to watch their inbox.
        */}
      {delivery.loaded && delivery.status ? (
        !delivery.status.configured ? (
          <div className="mt-3 flex items-start gap-3 rounded-feature bg-warning-050 px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-[#a76d16]" />
            <p className="text-[13px] leading-relaxed text-[#a76d16]">
              <strong className="font-semibold">Email is not set up.</strong> Certificates can
              still be printed, and sent on WhatsApp from each one. To email them, add
              RESEND_API_KEY and EMAIL_FROM to the hosting project and redeploy.
            </p>
          </div>
        ) : !delivery.status.canReachAnyone ? (
          <div className="mt-3 flex items-start gap-3 rounded-feature bg-warning-050 px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-[#a76d16]" />
            <p className="text-[13px] leading-relaxed text-[#a76d16]">
              <strong className="font-semibold">No sending domain is verified yet.</strong>{" "}
              Email will reach the address that owns the Resend account and nobody else, so
              participants would get nothing. Verify a domain at resend.com/domains, or send
              each certificate on WhatsApp — that works now.
            </p>
          </div>
        ) : null
      ) : null}

      {unverifiable.length > 0 ? (
        <div className="mt-3 flex flex-col gap-3 rounded-feature bg-critical-050 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-critical-600" />
            <p className="min-w-0 text-[13px] leading-relaxed text-critical-700">
              <strong className="font-semibold">
                {unverifiable.length} issued certificate{unverifiable.length === 1 ? "" : "s"} cannot
                be verified.
              </strong>{" "}
              {unverifiable.length === 1 ? "It was" : "They were"} issued in this browser before the
              record reached the database, so scanning the printed code returns nothing.
            </p>
          </div>
          <Button
            variant="secondary"
            className="shrink-0"
            onClick={() => void publishUnverifiable()}
          >
            Publish {unverifiable.length}
          </Button>
        </div>
      ) : null}

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
                      onClick={() => void issueOne(c)}
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
        eventDate={event.startDate}
        /*
         * The whole field, because a superlative can only be checked against it. Passing
         * one record alone would leave the note able to say "the highest game" without
         * knowing whether it was.
         */
        records={records}
        /*
         * The winner's address, from the registration they entered with. Looked up
         * here rather than typed, so a certificate cannot be emailed to the wrong
         * person by a slip at the keyboard.
         */
        recipientEmail={
          roster.registrations.find((r) => r.id === preview?.recipientId)?.email ?? ""
        }
        recipientMobile={
          roster.registrations.find((r) => r.id === preview?.recipientId)?.mobile ?? ""
        }
        origin={origin}
        record={records.find((r) => r.playerId === preview?.recipientId)}
        onClose={() => setPreview(null)}
      />

      <RevokeModal
        certificate={revoking}
        onClose={() => setRevoking(null)}
        onRevoke={(reason) => {
          if (!revoking) return;
          void withdrawOne(revoking, reason);
          setRevoking(null);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The placement, worded for a sentence rather than a table.
 *
 * The stored statement is a label — "1st place, Recreational division" — which reads
 * badly mid-sentence: "for 1st place, recreational division at Blufy's". This turns it
 * into "finishing 1st in the recreational category", which is what the line needs.
 * "Category" rather than "division" because that is the word the public site and the
 * registration form use with participants.
 */
function placementPhrase(statement: string): string {
  const match = /^(\d+)(?:st|nd|rd|th)\s+place,\s*(.+?)\s*(?:division)?$/i.exec(statement.trim());
  if (!match) return statement.toLowerCase();

  const [, place, group] = match;
  const suffix = place === "1" ? "st" : place === "2" ? "nd" : place === "3" ? "rd" : "th";
  return `finishing ${place}${suffix} in the ${group.toLowerCase()} category`;
}

/**
 * The date in the template's own wording — "23rd August, 2026".
 *
 * The source file spells it out with an ordinal, so a date formatted any other way
 * would read as a different document. Built here rather than with `formatDate`, which
 * produces "23 Aug 2026" for the interface.
 */
function printableDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;

  const day = date.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";

  const month = date.toLocaleDateString("en-GB", { month: "long" });
  return `${day}${suffix} ${month}, ${date.getFullYear()}`;
}

function PreviewModal({
  certificate,
  eventName,
  eventDate,
  recipientEmail,
  recipientMobile,
  records,
  origin,
  record,
  onClose,
}: {
  certificate: Certificate | null;
  eventName: string;
  /** The day it was won. A certificate without one is undated evidence. */
  eventDate: string;
  /** Empty when the entrant gave no address, which the button says rather than hides. */
  recipientEmail: string;
  /** Their mobile, for the WhatsApp route. Empty when none was given. */
  recipientMobile: string;
  /** Every performance in the event, so a personal note can be checked against the field. */
  records: PerformanceRecord[];
  origin: string;
  record?: PerformanceRecord;
  onClose: () => void;
}) {
  const app = useStore();
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  if (!certificate) return null;
  const url = origin ? verificationUrl(origin, certificate.code) : "";
  /*
   * Generated once the origin is known, so the code in it points at this deployment
   * rather than at nothing.
   */
  const qr = url ? qrToDataUri(url, { size: 320 }) : undefined;

  /*
   * The line about this person specifically. Everyone gets one, and it is always drawn
   * from their own results — a certificate that says nothing about the holder is a form
   * letter, and one that praises them without cause is worse.
   */
  const note = record ? personalNote(record, records) : undefined;
  const citation = record ? buildCitation(record, tierFor(record)) : null;

  /*
   * The WhatsApp message. Same facts as the email — what they were awarded, the line
   * about them, and the link anybody can check it with.
   */
  const whatsapp = whatsappLink(
    recipientMobile,
    [
      `${certificate.recipientName} — ${certificate.statement} at ${eventName}.`,
      note?.text ? `Awarded to the player ${note.text}.` : "",
      url ? `Verify it here: ${url}` : "",
      `Certificate code: ${certificate.code}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );

  /**
   * Emails the certificate to the person who earned it.
   *
   * Reports only what the provider confirmed. A "sent" that was never delivered is
   * worse than a visible failure, because nobody goes looking for it.
   */
  const email = async () => {
    setSending(true);
    const outcome = await emailCertificate({
      to: recipientEmail,
      recipientName: certificate.recipientName,
      statement: certificate.statement,
      detail: certificate.detail,
      personalNote: note?.text,
      code: certificate.code,
      eventName,
      eventDate: formatDate(eventDate),
      verifyUrl: url,
    });
    setSending(false);

    if (!outcome.ok) {
      app.toast({
        title: outcome.configured ? "Not sent" : "Email is not set up",
        description: outcome.message,
        tone: outcome.configured ? "critical" : "warning",
      });
      return;
    }

    setSent(true);
    app.toast({
      title: `Certificate emailed to ${certificate.recipientName}`,
      description: recipientEmail,
      tone: "success",
    });
  };

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
          {/*
            * Disabled with a reason rather than hidden. An entrant who gave no address
            * cannot be emailed, and the director should be able to see why instead of
            * looking for a button that is not there.
            */}
          <Button
            variant="secondary"
            icon={<Mail className="size-4" />}
            disabled={sending || sent || !recipientEmail}
            title={recipientEmail || "This entrant gave no email address"}
            onClick={email}
          >
            {sent ? "Emailed" : sending ? "Sending…" : "Email it"}
          </Button>
          {/*
            * WhatsApp, which needs no verified domain and is how this event's entrants are
            * actually reached. Present only when a number was given, so there is no button
            * that opens a chat with nobody.
            */}
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noreferrer">
              <Button variant="secondary" icon={<Send className="size-4" />}>
                Send on WhatsApp
              </Button>
            </a>
          ) : null}
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
        {/*
          * The organizer's own certificate, rebuilt from their Canva file.
          *
          * This was a gold-bordered panel of the app's own invention. It bore no
          * relation to the design they had made and had been handing out, so what a
          * winner received looked nothing like what the organizer thought they were
          * sending.
          */}
        <CertificateSheet
          recipientName={certificate.recipientName}
          dateLabel={printableDate(eventDate)}
          code={certificate.code}
          verifyUrl={url}
          qrDataUri={qr}
          /*
           * A placement only when the certificate asserts one. Participation
           * certificates keep the template's original wording; a winner's states what
           * they won, which is the whole point of having it in writing.
           */
          placement={
            certificate.kind === "participation" ? undefined : placementPhrase(certificate.statement)
          }
          personalNote={note?.text}
          draftNotice={
            certificate.status === "revoked"
              ? `Withdrawn — ${certificate.revokedReason ?? "no longer valid"}`
              : certificate.issuedBy
                ? undefined
                : "Draft — not yet issued"
          }
        />

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
