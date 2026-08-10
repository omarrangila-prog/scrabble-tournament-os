"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, Eye, EyeOff, Plus, RefreshCw } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SearchInput,
  Stat,
} from "@/components/ui";
import { RosterGate } from "@/components/organizer/RosterGate";
import { ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";
import { EVENT_STATE_LABEL, type EventState } from "@/lib/domain/events";
import { listEvents, setEventVisibility, type StoredEvent } from "@/lib/supabase/events";
import { useRoster } from "@/lib/supabase/useRoster";
import { useStore } from "@/lib/store/useStore";
import { formatDate } from "@/lib/utils";

/**
 * Every tournament, from the database.
 *
 * This read browser storage, which is why the sidebar's event picker used to announce
 * "No events yet" above a tournament with a live registration page. Drafts appear here
 * and nowhere public, so an organizer can see the event they are still setting up.
 */
export default function EventsPage() {
  const router = useRouter();
  const app = useStore();
  const roster = useRoster(ACTIVE_EVENT_ID);

  const [events, setEvents] = React.useState<StoredEvent[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  // A counter, so refreshing is a state change rather than a call from an effect.
  const [reloads, setReloads] = React.useState(0);

  React.useEffect(() => {
    let live = true;

    (async () => {
      const rows = await listEvents();
      if (!live) return;
      setEvents(rows);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [reloads]);

  const needle = query.trim().toLowerCase();
  const visible = events.filter(
    (e) => !needle || e.name.toLowerCase().includes(needle) || e.slug.includes(needle),
  );

  const published = events.filter((e) => e.visibility === "public");
  const drafts = events.filter((e) => e.visibility !== "public");

  const togglePublic = async (event: StoredEvent) => {
    const next = event.visibility === "public" ? "private" : "public";

    /*
     * Taking an event off the public site is asked about, publishing is not. One of
     * these removes a page people may already have been given a link to.
     */
    if (next === "private") {
      const confirmed = window.confirm(
        `Take "${event.name}" off the public site?\n\n` +
          `Anyone who follows a link to /events/${event.slug} will no longer find it, ` +
          `and registration stops.`,
      );
      if (!confirmed) return;
    }

    setBusy(event.id);
    const result = await setEventVisibility(event.id, next);
    setBusy(null);

    if (!result.ok) {
      app.toast({ title: "Not changed", description: result.message ?? "", tone: "critical" });
      return;
    }

    setReloads((n) => n + 1);
    app.toast({
      title: next === "public" ? `${event.name} is now public` : `${event.name} is now hidden`,
      description:
        next === "public"
          ? `Live at /events/${event.slug}.`
          : "It no longer appears on the public site.",
      tone: next === "public" ? "success" : "info",
    });
  };

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Tournaments"
        badge={<Badge tone={events.length ? "primary" : "neutral"}>{events.length}</Badge>}
        subtitle="Every event in the database, drafts included."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw className="size-4" />}
              onClick={() => setReloads((n) => n + 1)}
            >
              Refresh
            </Button>
            <Link href="/app/events/new">
              <Button variant="primary" icon={<Plus className="size-4" />}>
                Create tournament
              </Button>
            </Link>
          </>
        }
      />

      <RosterGate access={roster.access} loaded={roster.loaded && loaded}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Tournaments" value={events.length} sub="in the database" tone="primary" />
          <Stat
            label="Public"
            value={published.length}
            sub={published.length ? "visible to everyone" : "none published"}
            tone={published.length ? "success" : "neutral"}
          />
          <Stat
            label="Drafts"
            value={drafts.length}
            sub={drafts.length ? "not yet public" : "none waiting"}
            tone={drafts.length ? "warning" : "neutral"}
          />
        </div>

        <div className="my-4">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search a tournament by name or link"
            className="lg:max-w-sm"
          />
        </div>

        {events.length === 0 ? (
          <Card>
            <EmptyState
              icon={<CalendarPlus className="size-5" />}
              title="No tournaments yet"
              description="Create one and it is saved as a draft until you publish it."
              action={
                <Button variant="primary" onClick={() => router.push("/app/events/new")}>
                  Create tournament
                </Button>
              }
            />
          </Card>
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              title="Nothing matches"
              description={`${events.length} in the database, none matching that search.`}
              action={
                <Button variant="secondary" onClick={() => setQuery("")}>
                  Clear
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {visible.map((event) => {
              const isPublic = event.visibility === "public";
              const stateLabel =
                EVENT_STATE_LABEL[event.state as EventState] ?? event.state.replace(/-/g, " ");

              return (
                <Card key={event.id}>
                  <div className="flex flex-wrap items-center gap-3 p-4">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-bold text-ink">{event.name}</span>
                        <Badge tone={isPublic ? "success" : "neutral"}>
                          {isPublic ? "Public" : "Draft"}
                        </Badge>
                        <Badge tone="neutral">{stateLabel}</Badge>
                        {event.status === "archived" ? (
                          <Badge tone="warning">Archived</Badge>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                        {event.details.startDate ? formatDate(event.details.startDate) : "No date set"}
                        {event.details.venueName ? ` · ${event.details.venueName}` : ""}
                        {` · /events/${event.slug}`}
                      </span>
                    </span>

                    <span className="flex shrink-0 flex-wrap gap-1.5">
                      {isPublic ? (
                        <Link href={`/events/${event.slug}`} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost">
                            View page
                          </Button>
                        </Link>
                      ) : null}

                      <Button
                        size="sm"
                        variant="secondary"
                        icon={isPublic ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        disabled={busy === event.id || event.status === "archived"}
                        onClick={() => togglePublic(event)}
                      >
                        {busy === event.id ? "…" : isPublic ? "Unpublish" : "Publish"}
                      </Button>

                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => router.push(`/app/events/${event.id}/payments`)}
                      >
                        Open
                      </Button>
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </RosterGate>
    </div>
  );
}
