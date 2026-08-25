"use client";

import { useParams } from "next/navigation";

import LiveEventPage from "@/app/app/live-event/page";

/**
 * Live for the active event.
 *
 * Renders the existing screen inside the workspace rather than navigating away
 * from it. Every screen already reads the active event from the scope, so the
 * organizer stays in the tournament they are working in — leaving the workspace
 * to do ordinary event work is the fragmentation this structure exists to end.
 *
 * Check-in, pairings, round control and the venue display.
 */
export default function LiveEventPageTab() {
  const params = useParams<{ eventId: string }>();
  return <LiveEventPage eventId={params.eventId} />;
}
