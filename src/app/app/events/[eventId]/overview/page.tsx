"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BadgeCheck,
  Check,
  Dices,
  Swords,
  Copy,
  Info,
  QrCode,
  Users,
} from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  Modal,
  Progress,
  Stat,
} from "@/components/ui";
import {
  registrationSummary,
  selectScopedForm,
  selectScopedRegistrations,
  useEventStore,
} from "@/lib/store/useEventStore";
import { useStore } from "@/lib/store/useStore";
import { useLiveStore } from "@/lib/store/useLiveStore";
import { activeEvent } from "@/lib/domain/scope";
import { countTracks } from "@/lib/domain/gameOn";
import { ParticipationTrack } from "@/lib/firebase/schema";
import {
  eventAlerts,
  PhaseAction,
  phaseGuidance,
  setupChecklist,
} from "@/lib/domain/eventPhase";
import { buildShareAssets, EVENT_STATE_LABEL } from "@/lib/domain/events";
import { feeTotals, money } from "@/lib/engine/finance";
import { qrToDataUri } from "@/lib/qr/qrcode";
import { cn } from "@/lib/utils";

/**
 * Event Command Centre.
 *
 * Answers three questions without the organizer having to look for them: where
 * the event is, what needs attention, and what to do next. Only actions that
 * belong to the current phase appear.
 */
export default function OverviewPage() {
  const params = useParams<{ eventId: string }>();
  const store = useEventStore();
  const app = useStore();
  const live = useLiveStore();
  const router = useRouter();

  const [shareOpen, setShareOpen] = React.useState(false);

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

  const registrations = selectScopedRegistrations(store);
  const form = selectScopedForm(store);
  const summary = registrationSummary(registrations);
  const fees = feeTotals(registrations);

  const guidance = phaseGuidance(event.state);
  const round = live.currentRound(event.id);
  const progress = live.progressFor(event.id, round);

  const alerts = eventAlerts({
    paymentsAwaiting: summary.paymentPending,
    scoreConflicts: progress.conflicts,
    unverifiedBoards: progress.outstanding,
    unassignedPlayers: registrations.filter(
      (r) => r.status === "approved" && !r.confirmedDivision,
    ).length,
    capacityUsed: event.capacity
      ? Math.round((summary.approved / event.capacity) * 100)
      : 0,
  });

  /*
   * Both operational totals are reported, not just the exclusive splits.
   * Everyone who chose "both" belongs on the floor and in the Scrabble pool, so
   * showing only the exclusive counts would have a director lay out the wrong
   * number of tables.
   */
  const tracks = countTracks(
    registrations
      .filter((r) => r.status !== "rejected")
      .map((r) => (r.participationTrack ?? "speed_scrabble") as ParticipationTrack),
  );

  const membershipClaims = registrations.filter((r) => r.answers?.membershipNumber).length;
  // A claimed membership is not a verified one until someone has checked it.
  const membershipPending = registrations.filter(
    (r) => r.answers?.membershipNumber && r.status !== "approved",
  ).length;

  const published = event.state !== "draft";
  const checklist = setupChecklist({
    hasForm: !!form,
    hasShareLink: published,
    registrationOpen: event.state === "registration-open",
    registrationCount: summary.total,
    paymentsReviewed: summary.paymentVerified,
    paymentsAwaiting: summary.paymentPending,
  });

  const share = buildShareAssets(event, origin || "");

  /** Runs whatever an offered action means. */
  const perform = (action: PhaseAction) => {
    if (action.kind === "navigate" && action.tab) {
      router.push(`/app/events/${event.id}/${action.tab}`);
      return;
    }

    if (action.kind === "transition" && action.to) {
      if (
        action.confirm &&
        !window.confirm(
          `${action.label}?\n\nThe event moves to "${EVENT_STATE_LABEL[action.to]}". Participant screens update immediately.`,
        )
      )
        return;

      store.setEventState(event.id, action.to);
      app.toast({
        title: EVENT_STATE_LABEL[action.to],
        description: "Participant screens and the venue display have been updated.",
        tone: "success",
      });
      return;
    }

    if (action.id === "share") setShareOpen(true);
  };

  const nothingYet = summary.total === 0;

  return (
    <div className="space-y-4">
      {/* What to do next -------------------------------------------------- */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-ink">{guidance.status}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{guidance.next}</p>

            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={() => perform(guidance.primary)}>
                {guidance.primary.label}
                <ArrowRight className="size-4" />
              </Button>
              {guidance.secondary.map((action) => (
                <Button key={action.id} variant="secondary" onClick={() => perform(action)}>
                  {action.label}
                </Button>
              ))}
            </div>

            {guidance.primary.hint ? (
              <p className="mt-2 text-[12px] text-faint">{guidance.primary.hint}</p>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Attention -------------------------------------------------------- */}
      {alerts.length ? (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <button
              key={alert.id}
              onClick={() => router.push(`/app/events/${event.id}/${alert.tab}`)}
              className={cn(
                "flex w-full items-center gap-3 rounded-feature px-4 py-3 text-left transition-colors",
                alert.severity === "critical"
                  ? "bg-critical-050 hover:bg-critical-100"
                  : alert.severity === "warning"
                    ? "bg-warning-050 hover:bg-warning-100"
                    : "bg-[rgb(var(--c-surface-soft))] hover:bg-[rgb(var(--c-surface-strong))]",
              )}
            >
              {alert.severity === "info" ? (
                <Info className="size-4.5 shrink-0 text-muted" />
              ) : (
                <AlertTriangle
                  className={cn(
                    "size-4.5 shrink-0",
                    alert.severity === "critical" ? "text-critical" : "text-[#a76d16]",
                  )}
                />
              )}
              <span
                className={cn(
                  "flex-1 text-[13px] font-medium",
                  alert.severity === "critical"
                    ? "text-critical"
                    : alert.severity === "warning"
                      ? "text-[#a76d16]"
                      : "text-ink",
                )}
              >
                {alert.message}
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted" />
            </button>
          ))}
        </div>
      ) : null}

      {/* Metrics ---------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Registrations"
          value={summary.total}
          sub={`${summary.approved} approved`}
          icon={<Users className="size-5" />}
          tone="primary"
          onClick={() => router.push(`/app/events/${event.id}/registrations`)}
        />
        <Stat
          label="Board game floor"
          value={tracks.boardGameFloor}
          sub={tracks.both ? `${tracks.both} also playing Scrabble` : "social attendees"}
          icon={<Dices className="size-5" />}
          tone="info"
        />
        <Stat
          label="Speed Scrabble"
          value={tracks.scrabblePool}
          sub={tracks.both ? `${tracks.both} also on the floor` : "competitors"}
          icon={<Swords className="size-5" />}
          tone="info"
          onClick={() => router.push(`/app/events/${event.id}/scrabble`)}
        />
        <Stat
          label="AFK members"
          value={membershipClaims}
          sub={
            membershipPending
              ? `${membershipPending} to verify`
              : membershipClaims
                ? "all verified"
                : "none claimed"
          }
          icon={<BadgeCheck className="size-5" />}
          tone={membershipPending ? "warning" : "success"}
          onClick={() => router.push(`/app/events/${event.id}/payments`)}
        />
        <Stat
          label="Payments verified"
          value={summary.paymentVerified}
          sub={summary.paymentPending ? `${summary.paymentPending} to review` : "none waiting"}
          icon={<Check className="size-5" />}
          tone={summary.paymentPending ? "warning" : "success"}
          onClick={() => router.push(`/app/events/${event.id}/payments`)}
        />
        <Stat
          label="Revenue received"
          value={money(fees.collected, event.currency)}
          sub="verified payments only"
          icon={<Banknote className="size-5" />}
          tone="success"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        {/* Guided empty state / setup --------------------------------------- */}
        <Card className="xl:col-span-7">
          <CardHeader
            title={nothingYet ? `${event.name} is ready` : "Event setup"}
            subtitle={
              nothingYet
                ? "Everything is in place. Share your link to start receiving entries."
                : "Where this event stands"
            }
          />
          <ul className="space-y-1.5 px-5 pb-5">
            {checklist.map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                    item.done ? "bg-success text-white" : "bg-[rgb(var(--c-line))] text-muted",
                  )}
                >
                  {item.done ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-[13.5px] font-medium",
                      item.done ? "text-ink" : "text-muted",
                    )}
                  >
                    {item.label}
                  </span>
                  {!item.done && item.hint ? (
                    <span className="block text-[11.5px] text-faint">{item.hint}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>

          {nothingYet && published ? (
            <div className="px-5 pb-5">
              <Button
                variant="primary"
                className="w-full"
                icon={<QrCode className="size-4" />}
                onClick={() => setShareOpen(true)}
              >
                Share registration
              </Button>
            </div>
          ) : null}
        </Card>

        {/* Progress --------------------------------------------------------- */}
        <Card className="xl:col-span-5">
          <CardHeader title="Capacity" subtitle={`${event.capacity} places`} />
          <div className="space-y-3.5 px-5 pb-5">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[12.5px] font-semibold text-muted">Places filled</span>
                <span className="num text-[13px] font-bold text-ink">
                  {summary.approved}/{event.capacity}
                </span>
              </div>
              <Progress
                value={event.capacity ? (summary.approved / event.capacity) * 100 : 0}
                tone="primary"
                label="Places filled"
              />
            </div>

            <dl className="grid grid-cols-2 gap-2">
              {[
                ["Pending review", summary.pending],
                ["Waitlisted", summary.waitlisted],
                ["Payments waiting", summary.paymentPending],
                ["Complimentary", summary.complimentary],
              ].map(([label, value]) => (
                <div
                  key={label as string}
                  className="rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-2.5"
                >
                  <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">
                    {label as string}
                  </dt>
                  <dd className="num mt-0.5 text-[15px] font-bold text-ink">{value as number}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>
      </div>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={share.registerUrl}
        eventName={event.name}
        onCopy={() => {
          navigator.clipboard?.writeText(share.registerUrl);
          app.toast({ title: "Registration link copied", tone: "success" });
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ShareModal({
  open,
  onClose,
  url,
  eventName,
  onCopy,
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  eventName: string;
  onCopy: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share registration"
      subtitle={`Anyone with this link can register for ${eventName}.`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={<Copy className="size-4" />} onClick={onCopy}>
            Copy link
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrToDataUri(url, { size: 200 })}
            alt={`Registration QR code for ${eventName}`}
            width={200}
            height={200}
            className="rounded-compact border border-line bg-white p-2"
          />
        ) : null}
        <code className="w-full break-all rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-2.5 text-center text-[12px] text-ink">
          {url}
        </code>
      </div>
    </Modal>
  );
}
