import { redirect } from "next/navigation";

/**
 * The workspace root has no content of its own — Overview is the landing tab.
 * Redirecting keeps `/app/events/{id}` a valid link to paste or bookmark.
 */
export default async function EventWorkspaceIndex({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  // Overview was removed with the rest of the browser-storage screens.
  redirect(`/app/events/${eventId}/payments`);
}
