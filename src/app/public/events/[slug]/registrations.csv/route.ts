import { registrationsCsv, registrationsFileName } from "@/lib/domain/publicRegistrations";
import { readPublicRegistrations } from "@/lib/supabase/serverPublic";

/**
 * The public registration list, as a CSV, generated from the database on every request.
 *
 * Never a stored file. A file written once and left would go stale the moment somebody
 * registered, and the whole point of one permanent link is that it is always the current list.
 * `force-dynamic` stops the framework prerendering it, and the headers stop a CDN or a browser
 * keeping a copy: a link opened twice a minute apart must show the person who arrived between.
 *
 * What it contains is decided in the database — see `public_registrations`, migration 0089 — so
 * this route cannot be talked into returning a column the organiser has not made public.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const feed = await readPublicRegistrations(decodeURIComponent(slug));

  if (!feed) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  /*
   * A byte-order mark in front of the text. Without one Excel opens a UTF-8 file as Windows-1252
   * and turns every non-ASCII letter in a name into noise; Google Sheets and a browser ignore it.
   */
  const body = "﻿" + registrationsCsv(feed);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `inline; filename="${registrationsFileName(feed.eventName)}"`,
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex",
      /* Read from Google Sheets' IMPORTDATA and from a page on another site alike. */
      "Access-Control-Allow-Origin": "*",
    },
  });
}
