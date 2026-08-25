"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useCurrentEvent } from "@/lib/supabase/useCurrentEvent";

/**
 * Payments, for the event currently selected.
 *
 * This used to be a server redirect to a hardcoded event id. "Which event" is a
 * per-browser choice — the nav picker, stored client-side — so a server component has
 * no way to answer that question at all; this reads it the same way every other flat
 * screen does and redirects once it knows.
 */
export default function PaymentsPage() {
  const router = useRouter();
  const currentEvent = useCurrentEvent();

  React.useEffect(() => {
    if (currentEvent.loaded) router.replace(`/app/events/${currentEvent.eventId}/payments`);
  }, [currentEvent.loaded, currentEvent.eventId, router]);

  return null;
}
