"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { CalendarDays, ExternalLink, MapPin, Users } from "lucide-react";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import {
  selectScopedRegistrations,
  useEventStore,
} from "@/lib/store/useEventStore";
import { EVENT_STATE_LABEL } from "@/lib/domain/events";
import { WORKSPACE_TABS } from "@/lib/domain/eventPhase";
import { activeEvent, scopeStatus } from "@/lib/domain/scope";
import { cn, formatDate } from "@/lib/utils";

/**
 * The event workspace.
 *
 * One place to manage a tournament from creation to archive. The URL carries
 * the event id, so a link is always unambiguous about which event it opens,
 * and the store's active selection is kept in step with it — an organizer who
 * arrives by link should not then find the sidebar pointing somewhere else.
 */
export default function EventWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ eventId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const store = useEventStore();

  const eventId = params.eventId;

  /*
   * The URL is the authority here. Following it in an effect rather than
   * during render keeps the store update out of the render pass, and running
   * it on every id change means deep links select the right event too.
   */
  React.useEffect(() => {
    if (eventId && store.activeEventId !== eventId) store.setActiveEvent(eventId);
  }, [eventId, store]);

  const status = scopeStatus(store.events, { organizationId: store.activeOrganizationId, eventId }, store.hydrated);
  const event = activeEvent(store.events, {
    organizationId: store.activeOrganizationId,
    eventId,
  });
  const registrations = selectScopedRegistrations(store);

  if (status === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[132px] w-full rounded-feature" />
        <Skeleton className="h-11 w-full rounded-control" />
        <Skeleton className="h-[320px] w-full rounded-feature" />
      </div>
    );
  }

  if (status === "not-found" || !event) {
    return (
      <Card>
        <EmptyState
          title="Event not found"
          description="This event may have been deleted, or it belongs to another organization."
          action={
            <Button variant="primary" onClick={() => router.push("/app/events")}>
              Back to events
            </Button>
          }
        />
      </Card>
    );
  }

  const activeTab = pathname.split("/").pop() ?? "overview";
  const approved = registrations.filter((r) => r.status === "approved").length;

  return (
    <div>
      {/* Event identity — always visible, so the workspace never feels ambiguous. */}
      <div className="glass-raised rounded-feature p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">
                {event.name}
              </h1>
              <Badge tone="primary">{EVENT_STATE_LABEL[event.state]}</Badge>
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
                <span className="num">{approved}</span> of{" "}
                <span className="num">{event.capacity}</span> places filled
              </span>
            </div>
          </div>

          <Link href={`/events/${event.slug}`} target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm" icon={<ExternalLink className="size-3.5" />}>
              Public page
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <nav
        aria-label="Event sections"
        className="mt-4 flex gap-1 overflow-x-auto border-b border-line scroll-slim"
      >
        {WORKSPACE_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={`/app/events/${eventId}/${tab.id}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13px] font-semibold transition-colors",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4">{children}</div>
    </div>
  );
}
