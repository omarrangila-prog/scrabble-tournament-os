import { redirect } from "next/navigation";

/**
 * The short link.
 *
 * `/go/game-on` instead of `/events/game-on-8-august/register` — short enough
 * to read aloud, print on a poster, or send in a WhatsApp message without it
 * wrapping across three lines.
 *
 * It resolves on the server and redirects, so the address bar settles on the
 * canonical URL and a bookmark keeps working if the short form is ever retired.
 */
export default async function ShortLinkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/events/${encodeURIComponent(slug)}/register`);
}
