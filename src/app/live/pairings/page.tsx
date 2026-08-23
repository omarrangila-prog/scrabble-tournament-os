"use client";

import { PairingSheet } from "@/components/public/PairingSheet";
import { ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";

/** The pairing sheet for the event that is running today. */
export default function PairingsWallPage() {
  return <PairingSheet eventId={ACTIVE_EVENT_ID} />;
}
