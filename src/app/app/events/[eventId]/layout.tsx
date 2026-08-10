"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { CalendarDays, ExternalLink, MapPin, Users } from "lucide-react";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import {
  useEventStore,
} from "@/lib/store/useEventStore";
import { EVENT_STATE_LABEL } from "@/lib/domain/events";
import { WORKSPACE_TABS } from "@/lib/domain/eventPhase";
import { activeEvent, scopeStatus } from "@/lib/domain/scope";
import { useRoster } from "@/lib/supabase/useRoster";
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
  /*
   * Registrations from the database, not from browser storage.
   *
   * This header read the local store and announced "0 of 0 places filled" above a
   * tournament with real entrants in Postgres — a wrong figure repeated on every tab of
   * the workspace, which is the worst place for one to hide.
   */
  const roster = useRoster(eventId);

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
  const registered = roster.registrations.length;

  return (
    <div>
      {/*
        * One line, not a panel.
        *
        * This was a full identity card repeating the event name, state, date, venue and
        * a capacity figure — above tabs, inside a shell that already names the event in
        * the sidebar. Four tabs each opened with the same fourteen lines, so every
        * screen looked like the last one and the page's own heading was buried below
        * the fold. The facts are still here; they take a sentence.
        */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
        <Badge tone="primary">{EVENT_STATE_LABEL[event.state]}</Badge>
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-3.5" />
          {formatDate(event.startDate)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-3.5" />
          {event.venueName}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-3.5" />
          <span className="num">{registered}</span>
          {event.capacity > 0 ? (
            <>
              {" of "}
              <span className="num">{event.capacity}</span> places filled
            </>
          ) : (
            <> registered</>
          )}
        </span>

        <Link
          href={`/events/${event.slug}`}
          target="_blank"
          rel="noreferrer"
          className="tap-target ml-auto inline-flex items-center gap-1.5 font-semibold text-primary-600 hover:underline"
        >
          <ExternalLink className="tap-target size-3.5" />
          Public page
        </Link>
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
