"use client";

import { Info, Sparkles } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { useStore } from "@/lib/store/useStore";

export default function CopilotPage() {
  const store = useStore();
  const { tournament, players, pairings, disputes } = store;
  const round = tournament.currentRound;
  const roundPairings = pairings.filter((p) => p.round === round && p.playerBId);

  const facts = [
    ["Round", `${round} of ${tournament.totalRounds}`],
    ["Boards live", String(roundPairings.filter((p) => p.status === "live").length)],
    ["Pending verification", String(roundPairings.filter((p) => p.status === "awaiting-verification").length)],
    ["Verified", String(roundPairings.filter((p) => p.status === "verified").length)],
    ["Checked in", `${players.filter((p) => p.checkIn === "checked-in").length} of ${players.length}`],
    ["Open arbiter cases", String(disputes.filter((d) => d.status !== "closed").length)],
  ];

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Tournament Copilot"
        badge={<Badge tone="primary">Guidance</Badge>}
        subtitle="Ask questions about this tournament. Every answer is computed from live tournament data and links to the screen where you can act."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CopilotPanel />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="What the Copilot can see"
              subtitle="Live figures behind every answer"
              icon={<Sparkles className="size-4.5" />}
            />
            <dl className="space-y-1.5 px-5 pb-5">
              {facts.map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5"
                >
                  <dt className="text-[12.5px] text-muted">{k}</dt>
                  <dd className="text-[13.5px] font-semibold text-ink num">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="How it is used" subtitle="Scope and limits" />
            <div className="space-y-2 px-5 pb-5">
              <p className="rounded-control bg-success-050/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink">
                The Copilot reports what the data shows: which boards are outstanding, whether a
                round can be generated, why a pairing was made, and how a player reached their
                current ranking.
              </p>
              <p className="flex items-start gap-1.5 rounded-control bg-secondary-050 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#2b7fd4]">
                <Info className="mt-px size-3.5 shrink-0" />
                Guidance only. It never publishes a round, changes a score, or issues a penalty.
                Those actions always require a person with the right role.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
