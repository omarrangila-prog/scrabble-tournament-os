"use client";

import SeedingPage from "@/app/app/seeding/page";

/**
 * Players for the active event.
 *
 * Renders the existing screen inside the workspace rather than navigating away
 * from it. Every screen already reads the active event from the scope, so the
 * organizer stays in the tournament they are working in — leaving the workspace
 * to do ordinary event work is the fragmentation this structure exists to end.
 *
 * Divisions, seeding and player history for this event.
 */
export default function SeedingPageTab() {
  return <SeedingPage />;
}
