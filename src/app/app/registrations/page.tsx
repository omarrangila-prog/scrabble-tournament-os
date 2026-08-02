"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  CheckCircle2,
  CreditCard,
  IdCard,
  Inbox,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  PageHeader,
  SearchInput,
  Tabs,
  Textarea,
} from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { selectEventsPlayed, useIdentityStore } from "@/lib/store/useIdentityStore";
import {
  CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  REGISTRATION_STATUS_LABEL,
  Registration,
  RegistrationStatus,
  ageOn,
  categoryEligibility,
  fullNameOf,
} from "@/lib/domain/identity";
import { DigitalPlayerCard } from "@/components/identity/DigitalPlayerCard";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

const STATUS_TONE: Record<RegistrationStatus, "success" | "warning" | "critical" | "neutral" | "info"> = {
  draft: "neutral",
  submitted: "info",
  "payment-pending": "warning",
  "payment-review": "warning",
  approved: "success",
  rejected: "critical",
  waitlisted: "info",
  cancelled: "neutral",
};

export default function RegistrationsPage() {
  const store = useStore();
  const identity = useIdentityStore();
  const { players } = store;

  const [tab, setTab] = React.useState("pending");
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Registration | null>(null);
  const [issued, setIssued] = React.useState<string | null>(null);

  const pending = identity.registrations.filter((r) =>
    ["submitted", "payment-pending", "payment-review"].includes(r.status),
  );
  const decided = identity.registrations.filter((r) =>
    ["approved", "rejected", "cancelled"].includes(r.status),
  );
  const waitlisted = identity.registrations.filter((r) => r.status === "waitlisted");

  const list = (tab === "pending" ? pending : tab === "waitlisted" ? waitlisted : tab === "decided" ? decided : identity.registrations)
    .filter((r) => {
      const q = query.trim().toLowerCase();
      return (
        !q ||
        fullNameOf(r.applicant).toLowerCase().includes(q) ||
        (r.playerId ?? "").toLowerCase().includes(q) ||
        r.payment.reference.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const approve = (reg: Registration, note?: string) => {
    if (!store.requireCapability("players.edit")) return;
    const result = identity.approveRegistration(reg.id, store.currentUser?.name ?? "Demo user", note);
    if (!result) return;

    store.logAudit({
      user: store.currentUser?.name ?? "Demo user",
      role: store.role,
      action: reg.isNewPlayer ? "Player identity issued" : "Registration approved",
      target: result.playerId,
      newValue: `${fullNameOf(result)} · ${CATEGORY_LABEL[result.category]}`,
      reason: note,
      device: "Desktop · Chrome",
    });

    store.toast({
      title: reg.isNewPlayer ? "Player ID issued" : "Registration approved",
      description: reg.isNewPlayer
        ? `${fullNameOf(result)} received the permanent Player ID ${result.playerId}.`
        : `${fullNameOf(result)} is confirmed for this tournament.`,
      tone: "success",
    });

    if (reg.isNewPlayer) setIssued(result.playerId);
    setSelected(null);
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Registrations"
        badge={<Badge tone={pending.length ? "warning" : "success"} dot>{pending.length} awaiting review</Badge>}
        subtitle="Verify payment and identity, then approve. Approving a new player issues their permanent Player ID."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Awaiting review" value={pending.length} tone="warning" />
        <Tile label="Approved" value={decided.filter((r) => r.status === "approved").length} tone="success" />
        <Tile label="Waitlisted" value={waitlisted.length} tone="info" />
        <Tile label="Identities on file" value={identity.identities.length} tone="primary" />
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Tabs
          tabs={[
            { id: "pending", label: "Awaiting review", count: pending.length },
            { id: "waitlisted", label: "Waitlisted", count: waitlisted.length },
            { id: "decided", label: "Decided", count: decided.length },
            { id: "all", label: "All", count: identity.registrations.length },
          ]}
          value={tab}
          onChange={setTab}
        />
        <SearchInput value={query} onChange={setQuery} placeholder="Name, Player ID or reference" className="sm:ml-auto sm:max-w-xs" />
      </div>

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox className="size-5" />}
            title="Nothing in this view"
            description="Registrations submitted through the public site appear here for review."
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((r) => {
            const p = r.playerId ? players.find((x) => x.playerId === r.playerId) : undefined;
            const name = fullNameOf(r.applicant);
            const check = categoryEligibility(r.category, {
              eventsPlayed: selectEventsPlayed(identity, r.playerId),
            });
            return (
              <motion.button
                key={r.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setSelected(r)}
                className="glass block w-full rounded-compact p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(44,55,96,0.13)]"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <Avatar initials={p?.initials ?? `${r.applicant.firstName[0]}${r.applicant.lastName[0]}`} hue={p?.avatarHue ?? 220} size={40} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14.5px] font-semibold text-ink">{name}</p>
                      {r.isNewPlayer ? (
                        <Badge tone="primary" dot>New player</Badge>
                      ) : (
                        <Badge tone="neutral">{r.playerId}</Badge>
                      )}
                      <Badge tone={STATUS_TONE[r.status]} dot>
                        {REGISTRATION_STATUS_LABEL[r.status]}
                      </Badge>
                      {!check.eligible ? <Badge tone="warning">Category check</Badge> : null}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-muted">
                      <span>{CATEGORY_LABEL[r.category]}</span>
                      <span aria-hidden>·</span>
                      <span>{r.applicant.city}</span>
                      <span aria-hidden>·</span>
                      <span>Age {ageOn(r.applicant.dateOfBirth)}</span>
                      <span aria-hidden>·</span>
                      <span>{PAYMENT_METHOD_LABEL[r.payment.method]} · {r.payment.reference}</span>
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {r.applicant.photo ? <Camera className="size-4 text-success" aria-label="Photo uploaded" /> : <Camera className="size-4 text-faint" />}
                    {r.applicant.identityDocument ? <IdCard className="size-4 text-success" aria-label="ID uploaded" /> : <IdCard className="size-4 text-faint" />}
                    {r.payment.proofFileName ? <CreditCard className="size-4 text-success" aria-label="Receipt uploaded" /> : <CreditCard className="size-4 text-faint" />}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      <ReviewDrawer
        registration={selected}
        onClose={() => setSelected(null)}
        onApprove={approve}
      />

      {/* Identity issued confirmation */}
      <AnimatePresence>
        {issued ? (
          <div className="fixed inset-0 z-[86] grid place-items-center p-4">
            <div className="absolute inset-0 bg-[rgb(17_22_43/0.34)] backdrop-blur-[3px]" onClick={() => setIssued(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="relative w-full max-w-lg"
            >
              <div className="mb-3 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-[15px] bg-success text-white">
                  <ShieldCheck className="size-6" />
                </span>
                <h2 className="mt-3 text-[19px] font-semibold tracking-[-0.02em] text-white drop-shadow">
                  Permanent Player ID issued
                </h2>
              </div>
              {(() => {
                const id = identity.identities.find((i) => i.playerId === issued);
                if (!id) return null;
                return (
                  <DigitalPlayerCard
                    identity={id}
                    hue={220}
                    initials={`${id.firstName[0]}${id.lastName[0]}`}
                    compact
                  />
                );
              })()}
              <div className="mt-3 flex justify-center">
                <Button variant="secondary" onClick={() => setIssued(null)}>Close</Button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone: "warning" | "success" | "info" | "primary" }) {
  return (
    <div className="glass rounded-compact px-4 py-3">
      <p className="text-[12px] text-muted">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[22px] font-semibold num",
          tone === "success" && "text-[#1b8f68]",
          tone === "warning" && "text-[#b4741f]",
          tone === "info" && "text-[#2b7fd4]",
          tone === "primary" && "text-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ReviewDrawer({
  registration,
  onClose,
  onApprove,
}: {
  registration: Registration | null;
  onClose: () => void;
  onApprove: (r: Registration, note?: string) => void;
}) {
  const store = useStore();
  const identity = useIdentityStore();
  const [note, setNote] = React.useState("");

  const [last, setLast] = React.useState(registration);
  if (last !== registration) {
    setLast(registration);
    setNote("");
  }

  if (!registration) return null;

  const r = registration;
  const name = fullNameOf(r.applicant);
  const age = ageOn(r.applicant.dateOfBirth);
  const check = categoryEligibility(r.category, {
    eventsPlayed: selectEventsPlayed(identity, r.playerId),
  });
  const openForDecision = ["submitted", "payment-pending", "payment-review", "waitlisted"].includes(r.status);

  return (
    <Drawer
      open={!!registration}
      onClose={onClose}
      title={name}
      subtitle={`${r.isNewPlayer ? "New player application" : `Existing player · ${r.playerId}`} · ${REGISTRATION_STATUS_LABEL[r.status]}`}
      width="lg"
      footer={
        openForDecision ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                identity.waitlistRegistration(r.id, store.currentUser?.name ?? "Demo user", note || undefined);
                store.toast({ title: "Moved to waiting list", description: `${name} was waitlisted.`, tone: "info" });
                onClose();
              }}
            >
              Waitlist
            </Button>
            <Button
              variant="danger"
              disabled={!note.trim()}
              onClick={() => {
                identity.rejectRegistration(r.id, store.currentUser?.name ?? "Demo user", note);
                store.toast({ title: "Registration rejected", description: `${name} was notified with your reason.`, tone: "warning" });
                onClose();
              }}
            >
              Reject
            </Button>
            <Button
              variant="primary"
              className="sm:ml-auto"
              icon={<CheckCircle2 className="size-4" />}
              onClick={() => onApprove(r, note || undefined)}
            >
              {r.isNewPlayer ? "Approve and issue Player ID" : "Approve registration"}
            </Button>
          </div>
        ) : (
          <p className="text-[12.5px] text-muted">
            This registration has been decided. The full history is retained below.
          </p>
        )
      }
    >
      <div className="space-y-4">
        {/* Verification checklist */}
        <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
          <p className="text-[13px] font-semibold text-ink">Verification checklist</p>
          <div className="mt-2.5 space-y-1.5">
            <CheckRow ok={!!r.applicant.photo} label="Passport-style photograph uploaded" detail={r.applicant.photo?.fileName} />
            <CheckRow ok={!!r.applicant.identityDocument} label="Identity document provided" detail={r.applicant.identityDocument?.fileName ?? "Optional — not provided"} />
            <CheckRow ok={!!r.payment.proofFileName} label="Payment proof uploaded" detail={r.payment.proofFileName} />
            <CheckRow ok={check.eligible} label="Category eligibility" detail={check.eligible ? `${CATEGORY_LABEL[r.category]} · age ${age}` : check.reason} />
          </div>

          {!check.eligible ? (
            <p className="mt-2.5 rounded-control bg-warning-050/70 px-3 py-2.5 text-[12px] leading-relaxed text-[#b4741f]">
              Approving will record an administrator exception against the Beginner age rule.
            </p>
          ) : null}
        </div>

        {/* Applicant details */}
        <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
          <p className="text-[13px] font-semibold text-ink">Applicant details</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
            <D label="Full name" value={name} />
            <D label="Father's name" value={r.applicant.fatherName} />
            <D label="Date of birth" value={`${formatDate(r.applicant.dateOfBirth)} (${age})`} />
            <D label="Gender" value={r.applicant.gender.replace(/-/g, " ")} />
            <D label="Nationality" value={r.applicant.nationality} />
            <D label="City" value={`${r.applicant.city}, ${r.applicant.province}`} />
            <D label="Club" value={r.applicant.club} />
            <D label="Category" value={CATEGORY_LABEL[r.category]} />
            <D label="Mobile" value={r.applicant.mobile} />
            <D label="Email" value={r.applicant.email} />
            <D label="Emergency contact" value={r.applicant.emergencyContactName} />
            <D label="Emergency number" value={r.applicant.emergencyContactNumber} />
          </dl>
          <p className="mt-2 rounded-control bg-[rgb(var(--c-surface-strong))] px-3 py-2 text-[12px] text-muted">
            {r.applicant.address}
          </p>
        </div>

        {/* Payment */}
        <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
          <p className="text-[13px] font-semibold text-ink">Payment</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
            <D label="Method" value={PAYMENT_METHOD_LABEL[r.payment.method]} />
            <D label="Amount" value={`${r.payment.currency} ${r.payment.amount.toLocaleString("en-PK")}`} />
            <D label="Reference" value={r.payment.reference} />
            <D label="Received" value={r.payment.receivedAt ? formatDateTime(r.payment.receivedAt) : "Not received"} />
          </dl>
          <div className="board-motif mt-3 grid h-28 place-items-center rounded-control border border-line-strong bg-[rgb(var(--c-surface-soft))]">
            <p className="text-[12px] text-muted">
              {r.payment.proofFileName ?? "No receipt uploaded"}
            </p>
          </div>
        </div>

        {/* Decision note */}
        {openForDecision ? (
          <Field
            label="Decision note"
            hint="Required when rejecting. Recorded in the registration history and the audit log."
          >
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Payment verified against bank statement." />
          </Field>
        ) : r.decisionNote ? (
          <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
            <p className="text-[13px] font-semibold text-ink">Decision</p>
            <p className="mt-1 text-[12.5px] text-muted">{r.decisionNote}</p>
          </div>
        ) : null}

        {/* Timeline */}
        <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
          <p className="text-[13px] font-semibold text-ink">History</p>
          <ul className="mt-2 space-y-2">
            {r.timeline.map((t, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] text-ink">{t.entry}</span>
                  <span className="block text-[11.5px] text-muted">{t.by} · {formatDateTime(t.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Drawer>
  );
}

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-control bg-[rgb(var(--c-surface-strong))] px-3 py-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-warning" />
      )}
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-ink">{label}</span>
        {detail ? <span className="block text-[11.5px] text-muted">{detail}</span> : null}
      </span>
    </div>
  );
}

function D({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 truncate capitalize text-ink">{value}</dd>
    </div>
  );
}
