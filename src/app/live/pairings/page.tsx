"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { PairingSheet } from "@/components/public/PairingSheet";
import { useLiveEvent } from "@/lib/supabase/useLiveEvent";

/**
 * The pairing sheet for the event that is running today.
 *
 * Resolves the event rather than naming one: `?event=` when a venue is running two rooms,
 * otherwise whichever tournament is actually mid-day.
 */
function PairingsWall() {
  const { eventId, name, resolved } = useLiveEvent();
  const params = useSearchParams();
  /*
   * `?mode=clock` is the countdown alone, for a second screen; `?mode=sheet` pins the whole
   * round on one long page. The default rotates categories only when the round outgrows the
   * screen.
   */
  const asked = params.get("mode");
  const mode =
    asked === "sheet" ? "sheet"
      : asked === "clock" ? "clock"
        : asked === "winners" ? "winners"
          : "auto";

  if (!resolved) return <WallMessage>Loading…</WallMessage>;
  if (!eventId) return <WallMessage>No tournament is running right now.</WallMessage>;

  return <PairingSheet eventId={eventId} eventName={name ?? ""} mode={mode} />;
}

export default function PairingsWallPage() {
  /* `useSearchParams` needs a Suspense boundary to prerender this route. */
  return (
    <React.Suspense fallback={<WallMessage>Loading…</WallMessage>}>
      <PairingsWall />
    </React.Suspense>
  );
}

function WallMessage({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="grid min-h-dvh place-items-center"
      style={{ background: "#0E1512", color: "#F4EFE4" }}
    >
      <p className="text-[2.2vw] font-extrabold">{children}</p>
    </main>
  );
}
