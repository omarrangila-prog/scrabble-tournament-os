import { redirect } from "next/navigation";

/**
 * The participant list moved into the dashboard.
 *
 * It lived here with its own layout, its own sign-in and no sidebar, which meant the
 * organizer signed in and arrived somewhere that looked like a separate product with
 * no route back to the rest of it. Kept as a redirect because the old address has
 * been shared.
 */
export default function OrganizerRegistrationsRedirect() {
  redirect("/app/registrations");
}
