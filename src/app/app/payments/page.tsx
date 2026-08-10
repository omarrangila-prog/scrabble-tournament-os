import { redirect } from "next/navigation";

import { ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";

/**
 * Payments, for the event being run.
 *
 * A server redirect to a known id, rather than reading an "active event" out of
 * browser storage. That is what produced "No event selected — choose an event" on a
 * device whose local state had never been set: the event was right there in the
 * database, and the page asked which one it was.
 */
export default function PaymentsPage() {
  redirect(`/app/events/${ACTIVE_EVENT_ID}/payments`);
}
