"use client";

import * as React from "react";
import Link from "next/link";
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  MapPin,
  MessageCircle,
  QrCode,
  Receipt,
  Share2,
  Ticket,
  Users,
  XCircle,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  EmptyState,
  Field,
  PageHeader,
  SearchInput,
  Select,
  Stat,
  TableWrap,
  Td,
  Textarea,
  Th,
  Tabs,
} from "@/components/ui";
import {
  buildShareAssets,
  GuestPaymentStatus,
  GuestRegistration,
  registrationSummary,
  selectRegistrations,
  useEventStore,
} from "@/lib/store/useEventStore";
import { useStore } from "@/lib/store/useStore";
import { CATEGORY_LABEL, PAYMENT_METHOD_LABEL, PlayerCategory } from "@/lib/domain/identity";
import { EVENT_STATE_LABEL } from "@/lib/domain/events";
import { qrToDataUri } from "@/lib/qr/qrcode";
import { formatDate, formatDateTime } from "@/lib/utils";

const PAYMENT_TONE: Record<GuestPaymentStatus, "success" | "warning" | "critical" | "neutral" | "info"> = {
  "not-submitted": "neutral",
  "receipt-uploaded": "warning",
  "under-review": "warning",
  verified: "success",
  "amount-mismatch": "critical",
  rejected: "critical",
  complimentary: "info",
  discounted: "info",
};

const PAYMENT_LABEL: Record<GuestPaymentStatus, string> = {
  "not-submitted": "Not submitted",
  "receipt-uploaded": "Receipt uploaded",
  "under-review": "Under review",
  verified: "Verified",
  "amount-mismatch": "Amount mismatch",
  rejected: "Rejected",
  complimentary: "Complimentary",
  discounted: "Discounted",
};

/**
 * Event operations: the public-facing links a director shares, and the queue
 * where registrations and payments are reviewed.
 */
export default function EventsPage() {
  const store = useEventStore();
  const app = useStore();

  const [tab, setTab] = React.useState("registrations");
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [selected, setSelected] = React.useState<GuestRegistration | null>(null);
  // Read on the client only; the server render falls back to a relative path.
  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const event = store.events[0];
  const registrations = event ? selectRegistrations(store, event.id) : [];
  const summary = registrationSummary(registrations);

  if (!event) {
    return (
      <Card>
        <EmptyState title="No events yet" description="Create a tournament to open registration." />
      </Card>
    );
  }

  const share = buildShareAssets(event, origin || "");
  const filtered = registrations.filter((r) => {
    if (statusFilter === "pending" && !(r.status === "submitted" || r.status === "under-review"))
      return false;
    if (statusFilter === "payment" && r.paymentStatus === "verified") return false;
    if (statusFilter === "approved" && r.status !== "approved") return false;
    if (statusFilter === "waitlisted" && r.status !== "waitlisted") return false;
    const q = query.trim().toLowerCase();
    return (
      !q ||
      r.fullName.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.mobile.includes(q) ||
      r.club.toLowerCase().includes(q)
    );
  });

  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text);
    app.toast({ title: `${what} copied`, description: "Ready to paste and share.", tone: "success" });
  };

  return (
    <div>
      <PageHeader
        title="Events"
        badge={<Badge tone="success" dot pulse>{EVENT_STATE_LABEL[event.state]}</Badge>}
        subtitle="Share the registration link, then review entries and verify payments."
        actions={
          <>
            <Link href={`/events/${event.slug}`} target="_blank">
              <Button variant="secondary" icon={<Eye className="size-4" />}>
                View public page
              </Button>
            </Link>
            <Link href={`/events/${event.slug}/register`} target="_blank">
              <Button variant="primary" icon={<ExternalLink className="size-4" />}>
                Open form
              </Button>
            </Link>
          </>
        }
      />

      {/* Event summary --------------------------------------------------- */}
      <Card className="mb-4">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row">
          <div className="min-w-0 flex-1">
            <h2 className="text-[20px] font-extrabold tracking-[-0.025em] text-ink">{event.name}</h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" />
                {formatDate(event.startDate)} · {event.startTime}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {event.venueName}, {event.city}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Ticket className="size-3.5" />
                {event.currency} {event.fee.toLocaleString("en-PK")}
              </span>
            </p>

            {/* Share assets */}
            <div className="mt-4 space-y-2">
              <ShareRow
                label="Registration link"
                value={share.registerUrl}
                onCopy={() => copy(share.registerUrl, "Registration link")}
              />
              <ShareRow
                label="Public event page"
                value={share.publicUrl}
                onCopy={() => copy(share.publicUrl, "Event link")}
              />
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<MessageCircle className="size-3.5" />}
                  onClick={() => copy(share.whatsappText, "WhatsApp message")}
                >
                  Copy WhatsApp message
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Share2 className="size-3.5" />}
                  onClick={() => copy(`${share.emailSubject}\n\n${share.emailBody}`, "Email invitation")}
                >
                  Copy email invitation
                </Button>
              </div>
            </div>
          </div>

          {/* Registration QR */}
          <div className="flex shrink-0 flex-col items-center gap-2">
            {origin ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrToDataUri(share.registerUrl, { size: 168 })}
                alt="Registration QR code"
                width={168}
                height={168}
                className="rounded-compact border border-line bg-white p-2"
              />
            ) : (
              <div className="size-[168px] animate-pulse rounded-compact bg-[rgb(var(--c-line))]" />
            )}
            <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-muted">
              <QrCode className="size-3.5" />
              Scan to register
            </p>
          </div>
        </div>
      </Card>

      {/* Metrics --------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Registrations"
          value={summary.total}
          sub={`of ${event.capacity} places`}
          icon={<Users className="size-5" />}
          tone="primary"
        />
        <Stat label="Approved" value={summary.approved} icon={<CheckCircle2 className="size-5" />} tone="success" />
        <Stat
          label="Awaiting review"
          value={summary.pending}
          icon={<Eye className="size-5" />}
          tone={summary.pending ? "warning" : "success"}
        />
        <Stat
          label="Payments pending"
          value={summary.paymentPending + summary.paymentMissing}
          icon={<Receipt className="size-5" />}
          tone={summary.paymentPending + summary.paymentMissing ? "warning" : "success"}
        />
        <Stat
          label="Verified revenue"
          value={`${(summary.verifiedRevenue / 1000).toFixed(0)}k`}
          sub={`${event.currency} ${summary.verifiedRevenue.toLocaleString("en-PK")}`}
          icon={<Banknote className="size-5" />}
          tone="success"
        />
        <Stat
          label="Expected revenue"
          value={`${(summary.expectedRevenue / 1000).toFixed(0)}k`}
          sub={`${summary.totalDiscount.toLocaleString("en-PK")} discounted`}
          icon={<Banknote className="size-5" />}
          tone="gold"
        />
      </div>

      {/* Queue ------------------------------------------------------------ */}
      <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <Tabs
          tabs={[
            { id: "registrations", label: "All registrations", count: registrations.length },
            { id: "review", label: "Needs review", count: summary.pending },
            { id: "payments", label: "Payment queue", count: summary.paymentPending + summary.paymentMissing },
          ]}
          value={tab}
          onChange={(t) => {
            setTab(t);
            setStatusFilter(t === "review" ? "pending" : t === "payments" ? "payment" : "all");
          }}
          className="flex-1"
        />
        <div className="flex flex-col gap-2 sm:flex-row lg:w-[440px]">
          <SearchInput value={query} onChange={setQuery} placeholder="Name, email, phone or club" className="flex-1" />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Status"
            className="sm:w-44"
          >
            <option value="all">All statuses</option>
            <option value="pending">Awaiting review</option>
            <option value="payment">Payment outstanding</option>
            <option value="approved">Approved</option>
            <option value="waitlisted">Waiting list</option>
          </Select>
        </div>
      </div>

      <Card variant="data" className="mt-3">
        <div className="px-3 pb-4 pt-3">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Users className="size-5" />}
              title="No registrations match this filter"
              description="Clear the search or choose a different status."
            />
          ) : (
            <TableWrap className="max-h-[62vh]">
              <thead>
                <tr>
                  <Th>Player</Th>
                  <Th className="w-32">Division</Th>
                  <Th className="w-28">Amount</Th>
                  <Th className="w-36">Payment</Th>
                  <Th className="w-32">Status</Th>
                  <Th className="w-32">Submitted</Th>
                  <Th className="w-24">Review</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer hover:bg-[rgb(var(--c-surface-soft))]"
                    onClick={() => setSelected(r)}
                  >
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <Avatar
                          initials={r.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                          hue={(r.fullName.charCodeAt(0) * 37) % 360}
                          size={30}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-semibold text-ink">
                            {r.fullName}
                          </span>
                          <span className="block truncate text-[11.5px] text-muted">{r.club}</span>
                        </span>
                      </span>
                    </Td>
                    <Td className="capitalize">
                      {CATEGORY_LABEL[r.confirmedDivision ?? r.preferredDivision]}
                    </Td>
                    <Td className="num">
                      {r.currency} {r.amountDue.toLocaleString("en-PK")}
                    </Td>
                    <Td>
                      <Badge tone={PAYMENT_TONE[r.paymentStatus]} dot>
                        {PAYMENT_LABEL[r.paymentStatus]}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          r.status === "approved"
                            ? "success"
                            : r.status === "rejected"
                              ? "critical"
                              : r.status === "waitlisted"
                                ? "info"
                                : "warning"
                        }
                        dot
                      >
                        {r.status.replace(/-/g, " ")}
                      </Badge>
                    </Td>
                    <Td className="text-muted">{formatDate(r.submittedAt)}</Td>
                    <Td>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(r);
                        }}
                      >
                        Open
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      </Card>

      <ReviewDrawer registration={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ShareRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-control bg-[rgb(var(--c-surface-soft))] px-3 py-2">
      <span className="w-32 shrink-0 text-[11.5px] font-semibold text-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{value}</span>
      <button
        onClick={onCopy}
        aria-label={`Copy ${label}`}
        className="shrink-0 rounded-control p-1.5 text-faint transition-colors hover:bg-[rgb(var(--c-line))] hover:text-ink"
      >
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ReviewDrawer({
  registration,
  onClose,
}: {
  registration: GuestRegistration | null;
  onClose: () => void;
}) {
  const store = useEventStore();
  const app = useStore();
  const reviewer = app.currentUser?.name ?? "Tournament Director";

  const [note, setNote] = React.useState("");
  const [division, setDivision] = React.useState<PlayerCategory>("beginner");

  const [last, setLast] = React.useState(registration);
  if (last !== registration) {
    setLast(registration);
    setNote("");
    setDivision(registration?.confirmedDivision ?? registration?.preferredDivision ?? "beginner");
  }

  if (!registration) return null;
  const r = registration;

  const decide = (decision: "approved" | "rejected" | "waitlisted") => {
    store.reviewRegistration(r.id, decision, reviewer, note || undefined, division);
    app.toast({
      title: `Registration ${decision}`,
      description: `${r.fullName} — ${CATEGORY_LABEL[division]} division.`,
      tone: decision === "approved" ? "success" : decision === "rejected" ? "warning" : "info",
    });
    onClose();
  };

  const setPayment = (status: GuestPaymentStatus) => {
    store.verifyPayment(r.id, status, reviewer, note || undefined);
    app.toast({
      title: `Payment ${PAYMENT_LABEL[status].toLowerCase()}`,
      description: `${r.fullName} · ${r.currency} ${r.amountDue.toLocaleString("en-PK")}.`,
      tone: status === "verified" ? "success" : "warning",
    });
  };

  return (
    <Drawer
      open={!!registration}
      onClose={onClose}
      title={r.fullName}
      subtitle={`${r.email} · ${r.mobile}`}
      width="lg"
      footer={
        <div className="flex flex-wrap gap-2">
          <Button variant="success" onClick={() => decide("approved")} icon={<CheckCircle2 className="size-4" />}>
            Approve
          </Button>
          <Button variant="secondary" onClick={() => decide("waitlisted")}>
            Waiting list
          </Button>
          <Button variant="danger" onClick={() => decide("rejected")} icon={<XCircle className="size-4" />}>
            Reject
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Payment */}
        <Card variant="flat">
          <CardHeader title="Payment" icon={<Receipt className="size-4.5" />} />
          <div className="space-y-2 px-4 pb-4">
            <Detail label="Method" value={PAYMENT_METHOD_LABEL[r.paymentMethod]} />
            <Detail
              label="Amount due"
              value={`${r.currency} ${r.amountDue.toLocaleString("en-PK")}`}
            />
            {r.discountCode ? (
              <Detail
                label="Discount"
                value={`${r.discountCode} — ${r.currency} ${r.discountAmount.toLocaleString("en-PK")}`}
              />
            ) : null}
            {r.paymentReference ? <Detail label="Reference" value={r.paymentReference} /> : null}

            {r.receiptFileName ? (
              <div className="rounded-control bg-[rgb(var(--c-surface-strong))] p-3">
                <p className="text-[12px] font-semibold text-muted">Receipt</p>
                <div className="board-motif mt-2 grid h-28 place-items-center rounded-control border border-line">
                  <p className="text-[12px] text-muted">{r.receiptFileName}</p>
                </div>
              </div>
            ) : (
              <p className="rounded-control bg-warning-050 px-3.5 py-2.5 text-[12.5px] text-[#a76d16]">
                No receipt has been uploaded for this registration.
              </p>
            )}

            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button size="sm" variant="success" onClick={() => setPayment("verified")}>
                Verify payment
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setPayment("amount-mismatch")}>
                Amount mismatch
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPayment("rejected")}>
                Reject
              </Button>
            </div>
            <p className="text-[11.5px] leading-relaxed text-faint">
              A receipt image is evidence of a transfer, not proof it cleared. Verify against the
              account statement before approving.
            </p>
          </div>
        </Card>

        {/* Player detail */}
        <Card variant="flat">
          <CardHeader title="Player details" />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 pb-4 text-[13px]">
            <Detail label="City" value={r.city} stacked />
            <Detail label="Club or school" value={r.club} stacked />
            <Detail label="Date of birth" value={r.dateOfBirth} stacked />
            <Detail label="Experience" value={r.experience} stacked />
            <Detail label="Self-reported rating" value={r.selfRating ? String(r.selfRating) : "None"} stacked />
            <Detail label="Preferred division" value={CATEGORY_LABEL[r.preferredDivision]} stacked />
            {r.guardianName ? <Detail label="Guardian" value={r.guardianName} stacked /> : null}
            {r.guardianPhone ? <Detail label="Guardian phone" value={r.guardianPhone} stacked /> : null}
          </dl>
          {r.previousEvents ? (
            <p className="px-4 pb-4 text-[12.5px] leading-relaxed text-muted">
              Previous events: {r.previousEvents}
            </p>
          ) : null}
        </Card>

        {/* Decision */}
        <Card variant="flat">
          <CardHeader title="Decision" />
          <div className="space-y-3 px-4 pb-4">
            <Field label="Confirmed division" hint="The organizer's decision overrides the player's preference.">
              <Select value={division} onChange={(e) => setDivision(e.target.value as PlayerCategory)}>
                {(["beginner", "recreational", "advanced", "masters"] as PlayerCategory[]).map((d) => (
                  <option key={d} value={d}>
                    {CATEGORY_LABEL[d]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Review note" hint="Recorded on the registration timeline.">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        </Card>

        {/* Timeline */}
        <Card variant="flat">
          <CardHeader title="History" />
          <ul className="space-y-2 px-4 pb-4">
            {r.timeline.map((t, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] text-ink">{t.entry}</span>
                  <span className="block text-[11.5px] text-muted">
                    {t.by} · {formatDateTime(t.at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Drawer>
  );
}

function Detail({
  label,
  value,
  stacked,
}: {
  label: string;
  value: string;
  stacked?: boolean;
}) {
  if (stacked)
    return (
      <div>
        <dt className="text-[11.5px] text-muted">{label}</dt>
        <dd className="mt-0.5 text-[13px] font-medium text-ink">{value}</dd>
      </div>
    );
  return (
    <div className="flex items-center justify-between rounded-control bg-[rgb(var(--c-surface-strong))] px-3 py-2">
      <span className="text-[12.5px] text-muted">{label}</span>
      <span className="text-[13px] font-semibold text-ink">{value}</span>
    </div>
  );
}
