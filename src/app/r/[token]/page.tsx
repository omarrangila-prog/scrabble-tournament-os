"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock, MapPin, Ticket } from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { useEventStore } from "@/lib/store/useEventStore";
import { CATEGORY_LABEL } from "@/lib/domain/identity";
import { formatDate } from "@/lib/utils";

/**
 * A participant's personal event page, reached from their secure link or QR.
 *
 * Resolves an opaque token to a registration — the internal record id is never
 * present in the URL. No login, no password: possession of the link is the
 * credential, and it can be revoked by an organizer.
 */
export default function ParticipantPage() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(params.token ?? "");

  const store = useEventStore();
  const resolved = store.resolveToken(token);
  const registration = resolved?.subjectId
    ? store.registrations.find((r) => r.id === resolved.subjectId)
    : undefined;
  const event = registration
    ? store.events.find((e) => e.id === registration.eventId)
    : undefined;

  if (!resolved || !registration || !event) {
    return (
      <div className="mx-auto max-w-lg px-5 py-20">
        <Card>
          <EmptyState
            icon={<Clock className="size-5" />}
            title="This link is no longer valid"
            description="It may have expired or been withdrawn. Ask the organizer to send a new one."
          />
        </Card>
      </div>
    );
  }

  const approved = registration.status === "approved";
  const paid = registration.paymentStatus === "verified" || registration.paymentStatus === "complimentary";

  return (
    <div className="mx-auto max-w-lg px-5 py-10 sm:py-14">
      <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-primary">
        {event.name}
      </p>
      <h1 className="mt-2 text-[28px] font-extrabold tracking-[-0.03em] text-ink">
        {registration.fullName}
      </h1>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge tone={approved ? "success" : "warning"} dot>
          {approved ? "Registration confirmed" : "Under review"}
        </Badge>
        <Badge tone={paid ? "success" : "warning"} dot>
          {paid ? "Payment verified" : "Payment pending"}
        </Badge>
      </div>

      <Card className="mt-5">
        <CardHeader title="Your entry" />
        <div className="space-y-2 px-5 pb-5">
          <Row label="Division" value={CATEGORY_LABEL[registration.confirmedDivision ?? registration.preferredDivision]} />
          <Row label="Amount" value={`${registration.currency} ${registration.amountDue.toLocaleString("en-PK")}`} />
          {registration.discountCode ? (
            <Row label="Discount applied" value={registration.discountCode} />
          ) : null}
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Event details" />
        <div className="space-y-2.5 px-5 pb-5 text-[13.5px] text-ink">
          <p className="flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" />
            {formatDate(event.startDate)} · doors {event.startTime}
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" />
            {event.venueName}, {event.address}, {event.city}
          </p>
          <p className="flex items-center gap-2">
            <Ticket className="size-4 text-primary" />
            {event.rounds} rounds · {event.roundMinutes} minutes per player
          </p>
        </div>
      </Card>

      {approved ? (
        <p className="mt-5 flex items-start gap-2 rounded-control bg-success-050 px-4 py-3 text-[13px] leading-relaxed text-[#12855c]">
          <CheckCircle2 className="mt-px size-4 shrink-0" />
          Keep this page. On the day, open it at the venue to check in and to submit your results.
        </p>
      ) : (
        <p className="mt-5 rounded-control bg-warning-050 px-4 py-3 text-[13px] leading-relaxed text-[#a76d16]">
          The organizer is reviewing your entry. This page updates automatically once it is
          confirmed — no need to register again.
        </p>
      )}

      <div className="mt-6 text-center">
        <Link href={`/events/${event.slug}`}>
          <Button variant="ghost">About this tournament</Button>
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-2.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-[13.5px] font-semibold text-ink">{value}</span>
    </div>
  );
}
