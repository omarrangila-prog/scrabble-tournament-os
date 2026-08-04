/**
 * Firebase configuration.
 *
 * The app runs without Firebase. That is deliberate rather than a shortcut:
 * credentials belong to whoever owns the project, so the code cannot assume
 * they exist and must not break when they do not.
 *
 * `isFirebaseConfigured()` is the single switch. Every repository checks it and
 * falls back to local storage when it returns false, so the app is fully usable
 * today and becomes a Firestore client the moment real values are supplied — no
 * code change, only environment variables.
 *
 * To connect a real project, create `.env.local` with:
 *
 *   NEXT_PUBLIC_FIREBASE_API_KEY=…
 *   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=…
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID=…
 *   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=…
 *   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=…
 *   NEXT_PUBLIC_FIREBASE_APP_ID=…
 */

import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Firestore, getFirestore } from "firebase/firestore";

export interface FirebaseSettings {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  /** Optional. Present only when Google Analytics is enabled on the project. */
  measurementId?: string;
}

function readSettings(): Partial<FirebaseSettings> {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
}

/**
 * Whether a usable project is configured.
 *
 * Requires the three fields Firestore cannot work without. A partially filled
 * environment reads as unconfigured rather than half-initialising and failing
 * later at a random call site.
 */
export function isFirebaseConfigured(): boolean {
  const s = readSettings();
  return Boolean(s.apiKey?.trim() && s.projectId?.trim() && s.appId?.trim());
}

/** The configured project id, for display. Never a secret. */
export function projectId(): string | null {
  return readSettings().projectId?.trim() || null;
}

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;

/**
 * The Firebase app, or null when unconfigured.
 *
 * Returns null rather than throwing: callers are expected to fall back, and an
 * exception here would take down a page that has a perfectly good local path.
 */
export function firebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (cachedApp) return cachedApp;

  const s = readSettings() as FirebaseSettings;
  cachedApp = getApps().length ? getApp() : initializeApp(s);
  return cachedApp;
}

export function firestore(): Firestore | null {
  if (cachedDb) return cachedDb;
  const app = firebaseApp();
  if (!app) return null;
  cachedDb = getFirestore(app);
  return cachedDb;
}

/**
 * Starts Google Analytics, when the project has it and the browser supports it.
 *
 * Deliberately fire-and-forget and never awaited by anything that matters:
 * analytics failing must not affect a participant mid-registration, and it is
 * not available during server rendering at all.
 */
export async function startAnalytics(): Promise<void> {
  if (typeof window === "undefined") return;

  const app = firebaseApp();
  const settings = readSettings();
  if (!app || !settings.measurementId) return;

  try {
    const { getAnalytics, isSupported } = await import("firebase/analytics");
    if (await isSupported()) getAnalytics(app);
  } catch {
    // Blocked by an extension, an unsupported browser, or no network. None of
    // those are reasons to interrupt the person filling in the form.
  }
}

/** Where data is actually being read from, for the organizer to see. */
export type Backend = "firestore" | "local";

export function activeBackend(): Backend {
  return isFirebaseConfigured() ? "firestore" : "local";
}
