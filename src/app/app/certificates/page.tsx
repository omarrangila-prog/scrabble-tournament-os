"use client";

import * as React from "react";
import {
  AlertTriangle,
  Award,
  BadgeCheck,
  Download,
  FileCheck2,
  Plus,
  Search,
  Send,
  ShieldOff,
  Trash2,
  Users,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Stat,
  TableWrap,
  Tabs,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { selectRegistrations, useEventStore } from "@/lib/store/useEventStore";
import { useCertificateStore } from "@/lib/store/useCertificateStore";
import { usePromotionStore } from "@/lib/store/usePromotionStore";
import { useStore } from "@/lib/store/useStore";
import {
  canIssue,
  Certificate,
  CertificateKind,
  CERTIFICATE_KIND_LABEL,
  certificateSummary,
  planBulkIssue,
  verificationUrl,
} from "@/lib/engine/certificates";
import { isAwarded } from "@/lib/engine/promotions";
import { qrToDataUri } from "@/lib/qr/qrcode";
import { cn } from "@/lib/utils";

const STATUS_TONE = {
  draft: "neutral",
  issued: "success",
  revoked: "critical",
} as const;

/**
 * Certificates — prepare, issue, verify and withdraw.
 *
 * Issuing is gated on the results actually being final, because paper cannot
 * be recalled. Withdrawal is recorded rather than deleted, so a certificate
 * someone is holding still resolves.
 */
export default function CertificatesPage() {
  const events = useEventStore();
  const certs = useCertificateStore();
  const promos = usePromotionStore();
  const app = useStore();

  const event = events.events[0];

  const [tab, setTab] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [prepareOpen, setPrepareOpen] = React.useState(false);
  const [revoking, setRevoking] = React.useState<Certificate | null>(null);
  const [preview, setPreview] = React.useState<Certificate | null>(null);

  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  if (!event) {
    return (
      <Card>
        <EmptyState title="No event" description="Create an event before issuing certificates." />
      </Card>
    );
  }

  const registrations = selectRegistrations(events, event.id);
  const all = certs.certificatesFor(event.id);
  const summary = certificateSummary(all);

  // Results are final only once the event says so.
  const resultsFinal = event.state === "completed" || event.state === "final-review";
  const ctx = { resultsFinal, outstandingDisputes: 0 };
  const plan = planBulkIssue(all, ctx);

  const filtered = all
    .filter((c) => (tab === "all" ? true : c.status === tab))
    .filter((c) =>
      query.trim()
        ? `${c.recipientName} ${c.code} ${c.statement}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())
        : true,
    );

  const awardedRewards = promos.rewardsFor(event.id).filter(isAwarded);

  return (
    <div>
      <PageHeader
        title="Certificates"
        subtitle={`${event.name} · ${summary.issued} issued`}
        badge={
          <Badge tone={resultsFinal ? "success" : "warning"}>
            {resultsFinal ? "Results final" : "Results provisional"}
          </Badge>
        }
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setPrepareOpen(true)}>
              Prepare one
            </Button>
            <Button
              variant="primary"
              icon={<Send className="size-4" />}
              disabled={plan.issuable.length === 0}
              onClick={() => {
                const label = `Issue ${plan.issuable.length} certificate${plan.issuable.length === 1 ? "" : "s"}?`;
                const detail = plan.blocked.length
                  ? `\n\n${plan.blocked.length} will be skipped and left as drafts.`
                  : "";
                if (!window.confirm(`${label}${detail}\n\nIssued certificates become publicly verifiable.`)) return;

                const result = certs.issueAll(event.id, app.currentUser?.name ?? "Sir Hani", ctx);
                app.toast({
                  title: `${result.issued} certificate${result.issued === 1 ? "" : "s"} issued`,
                  description: result.blocked.length
                    ? `${result.blocked.length} skipped — see the drafts tab.`
                    : "Every prepared certificate is now verifiable.",
                  tone: "success",
                });
              }}
            >
              Issue {plan.issuable.length || ""} ready
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Prepared" value={summary.total} sub="all certificates" icon={<FileCheck2 className="size-5" />} tone="primary" />
        <Stat label="Issued" value={summary.issued} sub="publicly verifiable" icon={<BadgeCheck className="size-5" />} tone="success" />
        <Stat label="Drafts" value={summary.draft} sub={plan.issuable.length ? `${plan.issuable.length} ready to issue` : "none ready"} icon={<Award className="size-5" />} tone={summary.draft ? "warning" : "neutral"} />
        <Stat label="Withdrawn" value={summary.revoked} sub={summary.revoked ? "still resolve when scanned" : "none"} icon={<ShieldOff className="size-5" />} tone={summary.revoked ? "critical" : "neutral"} />
      </div>

      {!resultsFinal ? (
        <div className="mt-3 flex items-start gap-3 rounded-feature bg-warning-050 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-[#a76d16]" />
          <p className="text-[13px] leading-relaxed text-[#a76d16]">
            <strong className="font-semibold">Results are still provisional.</strong> Participation
            certificates can be issued now; placement certificates are held back until the event
            reaches final review, so no certificate asserts a placing that could still change.
          </p>
        </div>
      ) : null}

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
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search name, code or achievement"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader title="Certificates" subtitle={`${filtered.length} shown`} />
          {filtered.length ? (
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Recipient</Th>
                    <Th>Achievement</Th>
                    <Th>Code</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const check = canIssue(c, ctx);
                    return (
                      <tr key={c.id}>
                        <Td>
                          <span className="block font-semibold text-ink">{c.recipientName}</span>
                          <span className="block text-[11.5px] text-muted">
                            {CERTIFICATE_KIND_LABEL[c.kind]}
                            {c.division ? ` · ${c.division}` : ""}
                          </span>
                        </Td>
                        <Td>
                          <span className="block text-[13px] text-ink">{c.statement}</span>
                          {c.detail ? (
                            <span className="block text-[11.5px] text-muted">{c.detail}</span>
                          ) : null}
                        </Td>
                        <Td>
                          <code className="num text-[12px] font-bold tracking-wide text-primary">
                            {c.code}
                          </code>
                        </Td>
                        <Td>
                          <Badge tone={STATUS_TONE[c.status]}>
                            {c.status === "revoked"
                              ? "Withdrawn"
                              : c.status[0].toUpperCase() + c.status.slice(1)}
                          </Badge>
                          {c.status === "draft" && !check.ready ? (
                            <span className="mt-1 block max-w-[220px] text-[11px] leading-snug text-[#a76d16]">
                              {check.reason}
                            </span>
                          ) : null}
                          {c.status === "revoked" && c.revokedReason ? (
                            <span className="mt-1 block max-w-[220px] text-[11px] leading-snug text-muted">
                              {c.revokedReason}
                            </span>
                          ) : null}
                        </Td>
                        <Td>
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="secondary" onClick={() => setPreview(c)}>
                              View
                            </Button>
                            {c.status === "draft" ? (
                              <Button
                                size="sm"
                                variant="primary"
                                disabled={!check.ready}
                                onClick={() => {
                                  const r = certs.issue(
                                    c.id,
                                    app.currentUser?.name ?? "Sir Hani",
                                    ctx,
                                  );
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
                            {c.status === "draft" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Trash2 className="size-3.5" />}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Delete the draft certificate for ${c.recipientName}? This cannot be undone.`,
                                    )
                                  )
                                    certs.remove(c.id);
                                }}
                              />
                            ) : null}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <EmptyState
              title={all.length ? "Nothing matches" : "No certificates yet"}
              description={
                all.length
                  ? "Try a different search or tab."
                  : "Prepare participation certificates, or add one individually."
              }
            />
          )}
        </Card>

        <div className="space-y-4 xl:col-span-4">
          <Card>
            <CardHeader title="Bulk prepare" subtitle="Participation certificates" icon={<Users className="size-4.5" />} />
            <div className="space-y-3 px-5 pb-5">
              <p className="text-[12.5px] leading-relaxed text-muted">
                Prepares a participation certificate for every approved entry that does not already
                have one. Nothing is issued — each stays a draft until you issue it.
              </p>
              <Button
                variant="secondary"
                className="w-full"
                icon={<Plus className="size-4" />}
                onClick={() => {
                  const people = registrations
                    .filter((r) => r.status === "approved")
                    .map((r) => ({
                      id: r.id,
                      name: r.fullName,
                      division: (r.confirmedDivision ?? r.preferredDivision).replace(/-/g, " "),
                    }));
                  const made = certs.prepareParticipation(event.id, people);
                  app.toast({
                    title: made
                      ? `${made} certificate${made === 1 ? "" : "s"} prepared`
                      : "Nothing to prepare",
                    description: made
                      ? "They are drafts until you issue them."
                      : "Every approved entry already has a participation certificate.",
                    tone: made ? "success" : "info",
                  });
                }}
              >
                Prepare for approved entries
              </Button>
            </div>
          </Card>

          {awardedRewards.length ? (
            <Card>
              <CardHeader title="Decided awards" subtitle="Ready to become certificates" icon={<Award className="size-4.5" />} />
              <div className="space-y-2 px-5 pb-5">
                {awardedRewards.map((r) => {
                  const already = all.some(
                    (c) => c.kind === "award" && c.recipientId === r.recipientId && c.statement === r.title,
                  );
                  return (
                    <div
                      key={r.id}
                      className="rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-2.5"
                    >
                      <p className="text-[13px] font-semibold text-ink">{r.recipientName}</p>
                      <p className="text-[11.5px] text-muted">{r.title}</p>
                      <Button
                        size="sm"
                        variant={already ? "ghost" : "secondary"}
                        className="mt-2"
                        disabled={already}
                        onClick={() => {
                          certs.prepare({
                            eventId: event.id,
                            kind: "award",
                            recipientId: r.recipientId!,
                            recipientName: r.recipientName!,
                            statement: r.title,
                            detail: r.citation,
                          });
                          app.toast({
                            title: "Certificate prepared",
                            description: `${r.recipientName} — ${r.title}`,
                            tone: "success",
                          });
                        }}
                      >
                        {already ? "Already prepared" : "Prepare certificate"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Verification" subtitle="How anyone checks a certificate" icon={<Search className="size-4.5" />} />
            <p className="px-5 pb-5 text-[12.5px] leading-relaxed text-muted">
              Every certificate carries a code and a QR pointing at{" "}
              <code className="num text-[11.5px] text-primary">/verify</code>. The code is random
              and encodes nothing about the recipient. A withdrawn certificate still resolves — and
              says it was withdrawn, with the reason.
            </p>
          </Card>
        </div>
      </div>

      <PrepareModal
        open={prepareOpen}
        candidates={registrations.map((r) => ({
          id: r.id,
          name: r.fullName,
          division: (r.confirmedDivision ?? r.preferredDivision).replace(/-/g, " "),
        }))}
        onClose={() => setPrepareOpen(false)}
        onSave={(draft) => {
          certs.prepare({ ...draft, eventId: event.id });
          app.toast({
            title: "Certificate prepared",
            description: `${draft.recipientName} — ${draft.statement}`,
            tone: "success",
          });
          setPrepareOpen(false);
        }}
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

      <PreviewModal
        certificate={preview}
        eventName={event.name}
        origin={origin}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PrepareModal({
  open,
  candidates,
  onClose,
  onSave,
}: {
  open: boolean;
  candidates: { id: string; name: string; division?: string }[];
  onClose: () => void;
  onSave: (
    draft: Omit<Certificate, "id" | "code" | "status" | "issuedAt" | "issuedBy" | "eventId">,
  ) => void;
}) {
  const [recipientId, setRecipientId] = React.useState("");
  const [kind, setKind] = React.useState<CertificateKind>("participation");
  const [statement, setStatement] = React.useState("");
  const [detail, setDetail] = React.useState("");

  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setRecipientId("");
      setKind("participation");
      setStatement("");
      setDetail("");
    }
  }

  const recipient = candidates.find((c) => c.id === recipientId);
  const valid = !!recipient && statement.trim().length > 3;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Prepare a certificate"
      subtitle="Prepared certificates are drafts. Issuing them is a separate step."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() =>
              recipient &&
              onSave({
                kind,
                recipientId: recipient.id,
                recipientName: recipient.name,
                division: recipient.division,
                statement: statement.trim(),
                detail: detail.trim() || undefined,
              })
            }
          >
            Prepare
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Field label="Recipient" required>
          <Select value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
            <option value="">Select a player…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as CertificateKind)}>
            {(Object.keys(CERTIFICATE_KIND_LABEL) as CertificateKind[]).map((k) => (
              <option key={k} value={k}>
                {CERTIFICATE_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Achievement" required hint="Printed as the main line, e.g. 1st place, Masters division.">
          <Input value={statement} onChange={(e) => setStatement(e.target.value)} />
        </Field>

        <Field label="Detail" hint="Optional supporting line, e.g. 8 wins from 9, spread +1,204.">
          <Textarea rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} />
        </Field>

        {kind !== "participation" ? (
          <p className="rounded-control bg-warning-050 px-3.5 py-3 text-[12px] leading-relaxed text-[#a76d16]">
            This certificate asserts a placing. It can only be issued once results are final and no
            disputes remain outstanding.
          </p>
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

function PreviewModal({
  certificate,
  eventName,
  origin,
  onClose,
}: {
  certificate: Certificate | null;
  eventName: string;
  origin: string;
  onClose: () => void;
}) {
  if (!certificate) return null;
  const url = origin ? verificationUrl(origin, certificate.code) : "";

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
          <Button variant="primary" icon={<Download className="size-4" />} onClick={() => window.print()}>
            Print
          </Button>
        </div>
      }
    >
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
          {CERTIFICATE_KIND_LABEL[certificate.kind]}
        </p>
        <p className="text-champion mt-1.5 text-[26px] font-extrabold tracking-[-0.02em]">
          {certificate.recipientName}
        </p>
        <p className="mt-2 text-[14px] font-semibold text-ink">{certificate.statement}</p>
        {certificate.detail ? (
          <p className="mt-1 text-[12.5px] text-muted">{certificate.detail}</p>
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
          <p className="text-[10.5px] text-faint">Verify at {origin || "…"}/verify</p>
        </div>

        {certificate.issuedBy ? (
          <p className="mt-4 text-[11px] text-muted">Issued by {certificate.issuedBy}</p>
        ) : (
          <p className="mt-4 text-[11px] text-[#a76d16]">Draft — not yet issued</p>
        )}
      </div>
    </Modal>
  );
}
