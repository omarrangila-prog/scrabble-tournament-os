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

function anonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
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
