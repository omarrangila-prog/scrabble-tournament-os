"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Dices, Info } from "lucide-react";
import { Card, EmptyState, Tabs } from "@/components/ui";
import { useEventStore } from "@/lib/store/useEventStore";
import { selectScopedRegistrations } from "@/lib/store/useEventStore";
import { activeEvent } from "@/lib/domain/scope";
import { countTracks } from "@/lib/domain/gameOn";
import { ParticipationTrack } from "@/lib/firebase/schema";
import SeedingPage from "@/app/app/seeding/page";
import StandingsPage from "@/app/app/standings/page";
import PairingsPage from "@/app/app/pairings/page";
import ScoreEntryPage from "@/app/app/score-entry/page";

/**
 * Speed Scrabble.
 *
 * Seeding, pairings, score entry and standings are one activity, so they live
 * together rather than split across separate tabs. Only participants who chose
 * Speed Scrabble reach any of it — the board-game floor has no seeding, no
 * pairings and no standings, and showing those screens as though it did would
 * misrepresent half the event.
 */
export default function SpeedScrabbleTab() {
  const params = useParams<{ eventId: string }>();
  const store = useEventStore();
  const [section, setSection] = React.useState("seeding");

  const event = activeEvent(store.events, {
    organizationId: store.activeOrganizationId,
    eventId: params.eventId,
  });

  if (!event) return null;

  const registrations = selectScopedRegistrations(store);
  const counts = countTracks(
    registrations
      .filter((r) => r.status === "approved")
      .map((r) => (r.participationTrack ?? "speed_scrabble") as ParticipationTrack),
  );

  if (counts.scrabblePool === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Dices className="size-5" />}
          title="Nobody has entered Speed Scrabble yet"
          description="Seeding, pairings and standings appear once participants choose Speed Scrabble or Both when they register."
        />
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-start gap-3 rounded-feature bg-[rgb(var(--c-surface-soft))] px-4 py-3">
        <Info className="mt-0.5 size-4.5 shrink-0 text-muted" />
        <p className="text-[12.5px] leading-relaxed text-muted">
          <strong className="font-semibold text-ink">{counts.scrabblePool}</strong> of{" "}
          {counts.total} participants entered Speed Scrabble
          {counts.both > 0 ? `, ${counts.both} of them also on the board-game floor` : ""}. Only
          these players are seeded, paired and ranked.
        </p>
      </div>

      <Tabs
        value={section}
        onChange={setSection}
        tabs={[
          { id: "seeding", label: "Seeding" },
          { id: "pairings", label: "Pairings" },
          { id: "scores", label: "Score entry" },
          { id: "standings", label: "Standings" },
        ]}
        className="mb-4"
      />

      {section === "seeding" ? <SeedingPage /> : null}
      {section === "pairings" ? <PairingsPage /> : null}
      {section === "scores" ? <ScoreEntryPage /> : null}
      {section === "standings" ? <StandingsPage /> : null}
    </div>
  );
}
