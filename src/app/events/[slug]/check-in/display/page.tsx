"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { arrivalCounts } from "@/lib/domain/checkIn";
import {
  selectEventBySlug,
  selectRegistrations,
  useEventStore,
} from "@/lib/store/useEventStore";
import { qrToDataUri } from "@/lib/qr/qrcode";

const CREAM = "#F5F0E4";
const FOREST = "#2F5D3A";
const GOLD = "#C89B3C";
const BROWN = "#3E2F23";

/**
 * The venue display: one screen, one QR, read from across a room.
 *
 * Everyone scans the same code, so there is nothing to hand out and no queue at
 * a laptop. The QR is generated from the real check-in URL rather than being a
 * picture of one — a decorative QR that scans to nothing would be discovered by
 * the first person to try it, with a room watching.
 *
 * Names are not listed. A wall showing who has arrived tells the room who is
 * here and who is not, so a name appears only for a few seconds as a greeting to
 * the person who just checked in, then goes.
 */
export default function CheckInDisplayPage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(params.slug ?? "");

  const store = useEventStore();
  const event = selectEventBySlug(store, slug);
  const registrations = event ? selectRegistrations(store, event.id) : [];

  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const counts = arrivalCounts(registrations);

  /*
   * The most recent arrival, greeted briefly.
   *
   * Derived from the records rather than pushed by the check-in page, so the
   * greeting works no matter which route somebody used — personal link, venue
   * code or the desk.
   */
  const latest = registrations
    .filter((r) => r.checkedInAt)
    .sort((a, b) => (a.checkedInAt! < b.checkedInAt! ? 1 : -1))[0];

  const [greeting, setGreeting] = React.useState<string | null>(null);
  const lastSeen = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!latest?.checkedInAt) return;
    if (lastSeen.current === latest.id) return;

    // Skip the greeting on first paint: everybody already checked in is old news.
    const first = lastSeen.current === null;
    lastSeen.current = latest.id;
    if (first) return;

    setGreeting(latest.fullName.split(/\s+/)[0]);
    const timer = window.setTimeout(() => setGreeting(null), 3000);
    return () => window.clearTimeout(timer);
  }, [latest?.id, latest?.checkedInAt, latest?.fullName]);

  if (!event) return null;

  const checkInUrl = origin ? `${origin}/events/${event.slug}/check-in` : "";

  return (
    <main
      className="grid min-h-dvh place-items-center overflow-hidden px-8 py-10"
      style={{ background: CREAM }}
    >
      <div className="w-full max-w-[1100px] text-center">
        <p
          className="text-[13px] font-bold uppercase tracking-[0.28em] sm:text-[16px]"
          style={{ color: `${BROWN}99` }}
        >
          {event.name}
        </p>

        <h1
          className="mt-3 text-[52px] font-extrabold leading-[0.95] tracking-[-0.03em] sm:text-[84px]"
          style={{ color: BROWN }}
        >
          Welcome
        </h1>

        <p
          className="mt-3 text-[20px] font-bold sm:text-[28px]"
          style={{ color: FOREST }}
        >
          Scan to check in
        </p>

        {/* The real URL, not a picture of one. */}
        <div className="mt-8 flex justify-center">
          {checkInUrl ? (
            <div
              className="rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(62,47,35,0.16)] sm:p-8"
              aria-label="Check-in QR code"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrToDataUri(checkInUrl, { size: 640, dark: BROWN, light: "#FFFFFF" })}
                alt={`Scan to check in at ${event.name}`}
                className="size-[240px] sm:size-[320px]"
              />
            </div>
          ) : (
            <div className="size-[240px] sm:size-[320px]" />
          )}
        </div>

        <p className="mt-5 text-[13px] sm:text-[15px]" style={{ color: `${BROWN}80` }}>
          Or enter your six-digit code at this address
        </p>
        <p className="num mt-1 text-[13px] font-semibold sm:text-[16px]" style={{ color: BROWN }}>
          {checkInUrl.replace(/^https?:\/\//, "")}
        </p>

        {/* Arrivals. Zero reads as zero rather than being hidden. */}
        <div className="mt-10 flex flex-col items-center">
          <p
            className="num text-[56px] font-extrabold leading-none sm:text-[92px]"
            style={{ color: FOREST }}
          >
            {counts.checkedIn}
            <span style={{ color: `${BROWN}4D` }}> / {counts.expected}</span>
          </p>
          <p
            className="mt-2 text-[13px] font-bold uppercase tracking-[0.2em] sm:text-[16px]"
            style={{ color: `${BROWN}99` }}
          >
            Players checked in
          </p>
        </div>

        {/* A greeting, then gone. Never a standing list of who is here. */}
        <div className="mt-8 h-[52px]">
          <AnimatePresence mode="wait">
            {greeting ? (
              <motion.p
                key={greeting}
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="inline-flex items-center gap-3 rounded-full px-6 py-3 text-[18px] font-extrabold sm:text-[24px]"
                style={{ background: `${GOLD}2E`, color: BROWN }}
              >
                Welcome, {greeting}!
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
