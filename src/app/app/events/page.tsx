"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, CheckCircle2, MapPin, Plus, Users } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SearchInput,
  Stat,
} from "@/components/ui";
import {
  registrationSummary,
  selectOrgEvents,
  useEventStore,
} from "@/lib/store/useEventStore";
import { EVENT_STATE_LABEL } from "@/lib/domain/events";
import { phaseGuidance } from "@/lib/domain/eventPhase";
import { cn, formatDate } from "@/lib/utils";

/**
 * Every tournament in the organization.
 *
 * A directory rather than a workspace: choosing an event here selects it and
 * opens its workspace, which is where all the work happens. Each row says what
 * that event needs next, so the list doubles as a to-do across events.
 */
export default function EventsPage() {
  const store = useEventStore();
  const router = useRouter();

  const [query, setQuery] = React.useState("");

  const events = selectOrgEvents(store);

  const open = (eventId: string) => {
    store.setActiveEvent(eventId);
    router.push(`/app/events/${eventId}/overview`);
  };

  const filtered = events.filter((e) =>
    query.trim()
      ? `${e.name} ${e.city} ${e.venueName}`.toLowerCase().includes(query.trim().toLowerCase())
      : true,
  );

  const inProgress = events.filter(
    (e) => e.state !== "draft" && e.state !== "completed" && e.state !== "archived",
  ).length;
  const finished = events.filter(
    (e) => e.state === "completed" || e.state === "archived",
  ).length;

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle="Select a tournament to open its workspace."
        actions={
          <Link href="/app/events/new">
            <Button variant="primary" icon={<Plus className="size-4" />}>
              Create tournament
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="Tournaments"
          value={events.length}
          sub="in this organization"
          icon={<CalendarDays className="size-5" />}
          tone="primary"
        />
        <Stat
          label="In progress"
          value={inProgress}
          sub="not yet completed"
          icon={<Users className="size-5" />}
          tone="success"
        />
        <Stat
          label="Completed"
          value={finished}
          sub="finished events"
          icon={<CheckCircle2 className="size-5" />}
          tone="info"
        />
      </div>

      <div className="mt-4 max-w-[340px]">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search by name, city or venue"
        />
      </div>

      <div className="mt-4 space-y-2.5">
        {filtered.length ? (
          filtered.map((event) => {
            const registrations = store.registrations.filter((r) => r.eventId === event.id);
            const summary = registrationSummary(registrations);
            const guidance = phaseGuidance(event.state);
            const isActive = event.id === store.activeEventId;

            return (
              <button
                key={event.id}
                onClick={() => open(event.id)}
                className={cn(
                  "block w-full rounded-feature border p-5 text-left transition-colors",
                  isActive
                    ? "border-primary bg-primary-050/40"
                    : "border-line bg-[rgb(var(--c-surface-strong))] hover:bg-[rgb(var(--c-surface-soft))]",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[16px] font-bold text-ink">{event.name}</span>
                      <Badge tone={isActive ? "primary" : "neutral"}>
                        {EVENT_STATE_LABEL[event.state]}
                      </Badge>
                      {isActive ? <Badge tone="success">Active</Badge> : null}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" />
                        {formatDate(event.startDate)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="size-3.5" />
                        {event.venueName}, {event.city}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="size-3.5" />
                        <span className="num">{summary.approved}</span> of{" "}
                        <span className="num">{event.capacity}</span>
                      </span>
                    </div>

                    <p className="mt-2 text-[12.5px] text-muted">
                      <span className="font-semibold text-ink">Next:</span> {guidance.next}
                    </p>
                  </div>

                  <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-primary">
                    Open
                    <ArrowRight className="size-4" />
                  </span>
                </div>
              </button>
            );
          })
        ) : (
          <Card>
            <EmptyState
              icon={<CalendarDays className="size-5" />}
              title={events.length ? "Nothing matches" : "No tournaments yet"}
              description={
                events.length
                  ? "Try a different search."
                  : "Create your first tournament to open registration."
              }
              action={
                events.length ? undefined : (
                  <Link href="/app/events/new">
                    <Button variant="primary" icon={<Plus className="size-4" />}>
                      Create tournament
                    </Button>
                  </Link>
                )
              }
            />
          </Card>
        )}
      </div>
    </div>
  );
}
