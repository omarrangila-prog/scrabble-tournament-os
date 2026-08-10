import { redirect } from "next/navigation";

import { ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";

/**
 * Awards and certificates, for the event being run.
 *
 * Same reason as Payments: this read the active event from browser storage and asked
 * the organizer to "choose an event" when that state was absent, which is every device
 * that had not used the app before.
 */
export default function CertificatesPage() {
  redirect(`/app/events/${ACTIVE_EVENT_ID}/awards`);
}
