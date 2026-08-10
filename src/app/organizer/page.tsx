import { redirect } from "next/navigation";

/**
 * The organizer entrance is the sign-in.
 *
 * This was a 440-line marketing page: a bilingual hero selling the platform, a
 * "Request Demo" button, a "national championships" pitch, and a mock workspace
 * showing Overview / Registrations / Payments / Live Event — three of which no
 * longer exist. It also carried a demo-mode button that walked straight into `/app`
 * without signing in, which reads as a way in and is not one.
 *
 * There is one director and they are not a lead to be converted. Somebody opening
 * `/organizer` wants to sign in, so that is what they get.
 */
export default function OrganizerEntrance() {
  redirect("/organizer/registrations");
}
