"use client";

/**
 * Supabase connection.
 *
 * The publishable key is designed to ship in a browser bundle — it identifies
 * the project and nothing more. What actually protects the data is row-level
 * security in the database, which is why the migration alongside this file
 * enables RLS on every table and denies by default.
 *
 * Configuration is checked rather than assumed: an app with no credentials
 * falls back to browser storage and stays fully usable, so a missing
 * environment variable is never a blank screen.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

function url(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
}

/**
 * The browser key, under either of the names Supabase has used for it.
 *
 * Supabase renamed the anon key to the publishable key, and a project set up after
 * that change hands you `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. This only read the
 * old name, so a deployment configured with the new one had no key at all — every
 * call fell back to browser storage and the sign-in screen said "Sign-in is not
 * available right now", which is true but says nothing about why.
 *
 * Both names are accepted because both are correct depending on when the project
 * was created, and there is no version of this worth making somebody debug.
 */
function anonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    undefined
  );
}

/**
 * What is missing, for a screen that has to explain itself.
 *
 * Naming the variable turns "it does not work" into something fixable without
 * reading the source.
 */
export function missingConfig(): string | null {
  if (!url()) return "NEXT_PUBLIC_SUPABASE_URL";
  if (!anonKey()) return "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
  return null;
}

/** Whether a usable project is configured. Both values are required. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url() && anonKey());
}

/** The project reference, for display. Never a secret. */
export function projectRef(): string | null {
  const u = url();
  if (!u) return null;
  return u.replace(/^https?:\/\//, "").split(".")[0] ?? null;
}

let cached: SupabaseClient | null = null;

/**
 * The client, or null when unconfigured.
 *
 * Returns null rather than throwing. Callers are expected to fall back to
 * local storage, and an exception here would take down a page that has a
 * perfectly good offline path.
 */
export function supabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (cached) return cached;

  cached = createClient(url()!, anonKey()!, {
    auth: {
      // Organizer sessions persist; participants never sign in at all.
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return cached;
}

/** Testing seam. */
export function resetSupabase(): void {
  cached = null;
}
