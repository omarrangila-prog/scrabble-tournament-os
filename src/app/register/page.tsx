"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  Trophy,
  Users,
  LayoutGrid,
} from "lucide-react";
import { Badge, Button, Card, Progress } from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { useIdentityStore } from "@/lib/store/useIdentityStore";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/domain/identity";
import { cn, formatDate } from "@/lib/utils";

/** Registration windows differ per event; derived so cards stay honest. */
function registrationState(deadline: string): {
  label: string;
  tone: "success" | "warning" | "critical";
  open: boolean;
} {
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: "Registration closed", tone: "critical", open: false };
  if (days <= 7) return { label: `Closing soon · ${days}d left`, tone: "warning", open: true };
  return { label: "Registration open", tone: "success", open: true };
}

const BANNERS = [
  "linear-gradient(115deg,#6D5DFB 0%,#4BA8FF 100%)",
  "linear-gradient(115deg,#32C997 0%,#4BA8FF 100%)",
  "linear-gradient(115deg,#F5A94A 0%,#EF5B72 100%)",
  "linear-gradient(115deg,#4BA8FF 0%,#6D5DFB 100%)",
];

export default function TournamentDiscoveryPage() {
  const store = useStore();
  const { tournaments, players, venue } = store;
  const registrations = useIdentityStore((s) => s.registrations);

  return (
    <div className="min-h-dvh">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface))] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary text-white">
            <LayoutGrid className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">
              Tournament OS
            </p>
            <p className="truncate text-[11.5px] text-muted">Player registration</p>
          </div>
          <Link href="/live">
            <Button size="sm" variant="secondary">Live results</Button>
          </Link>
          <Link href="/">
            <Button size="sm" variant="ghost">Organizer sign in</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
        {/* Hero */}
        <div className="mb-8 max-w-2xl">
          <Badge tone="primary" dot>Open for registration</Badge>
          <h1 className="mt-3 text-[30px] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[38px]">
            Register once. Play for life.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Create your permanent Player ID once and it stays with you for every tournament,
            every result and every ranking from that point on. No second account, no repeated
            forms.
          </p>

          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {[
              "A permanent Player ID issued on approval",
              "Your full career history in one profile",
              "QR check-in at the venue in seconds",
              "Category tracked and reviewed automatically",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 text-[13.5px] text-ink">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <h2 className="mb-4 text-[19px] font-semibold tracking-[-0.02em] text-ink">
          Upcoming tournaments
        </h2>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tournaments.map((t, i) => {
            const registered =
              t.id === store.tournament.id
                ? players.length
                : registrations.filter((r) => r.tournamentId === t.id && r.status === "approved").length;
            const deadline = t.id === store.tournament.id ? "2026-08-20" : "2026-09-05";
            const state = registrationState(deadline);
            const fill = Math.round((registered / Math.max(1, t.capacity)) * 100);

            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.06 }}
              >
                <Card className="flex h-full flex-col overflow-hidden">
                  {/* Banner */}
                  <div className="relative h-32 overflow-hidden">
                    <div className="absolute inset-0" style={{ background: BANNERS[i % BANNERS.length] }} />
                    <div className="board-motif absolute inset-0 opacity-25" aria-hidden />
                    <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-2">
                      <Trophy className="size-7 text-white/90" />
                      <Badge tone={state.tone} dot className="!bg-[rgb(var(--c-surface-strong))]">
                        {state.label}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-[16px] font-semibold leading-snug tracking-[-0.015em] text-ink">
                      {t.name.replace(" — Demo", "")}
                    </h3>
                    <p className="mt-1 text-[12.5px] text-muted">{t.organizer}</p>

                    <dl className="mt-3 space-y-1.5 text-[12.5px]">
                      <Line icon={<MapPin className="size-3.5" />} value={`${venue.name}, ${t.city}`} />
                      <Line
                        icon={<CalendarDays className="size-3.5" />}
                        value={`${formatDate(t.startDate)} – ${formatDate(t.endDate)}`}
                      />
                      <Line
                        icon={<Clock className="size-3.5" />}
                        value={`Registration closes ${formatDate(deadline)}`}
                      />
                    </dl>

                    {/* Categories */}
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
                        Categories
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {CATEGORY_ORDER.map((c) => (
                          <span
                            key={c}
                            className="rounded-full bg-primary-050 px-2 py-0.5 text-[11px] text-primary-600"
                          >
                            {CATEGORY_LABEL[c]}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Capacity */}
                    <div className="mt-3">
                      <div className="flex items-baseline justify-between text-[12px]">
                        <span className="flex items-center gap-1.5 text-muted">
                          <Users className="size-3.5" />
                          {registered} of {t.capacity} registered
                        </span>
                        <span className="font-semibold text-ink num">{fill}%</span>
                      </div>
                      <Progress
                        value={fill}
                        className="mt-1.5"
                        tone={fill >= 90 ? "warning" : "primary"}
                        label="Capacity"
                      />
                    </div>

                    {/* Fee and prize */}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-control bg-[rgb(var(--c-surface))] px-3 py-2">
                        <p className="text-[10.5px] text-muted">Entry fee</p>
                        <p className="text-[14px] font-semibold text-ink num">
                          PKR {t.registrationFee.toLocaleString("en-PK")}
                        </p>
                      </div>
                      <div className="rounded-control bg-[rgb(var(--c-surface))] px-3 py-2">
                        <p className="text-[10.5px] text-muted">Prize pool</p>
                        <p className="text-[14px] font-semibold text-ink num">
                          PKR {(t.registrationFee * 40).toLocaleString("en-PK")}
                        </p>
                      </div>
                    </div>

                    {/* Sponsors */}
                    {t.sponsors.length > 0 ? (
                      <div className="mt-3">
                        <p className="text-[10.5px] uppercase tracking-[0.06em] text-faint">
                          Sponsors
                        </p>
                        <p className="mt-0.5 truncate text-[11.5px] text-muted">
                          {t.sponsors.join(" · ")}
                        </p>
                      </div>
                    ) : null}

                    <div className="mt-4 pt-1">
                      <Link href={`/register/${t.id}`} className={cn(!state.open && "pointer-events-none")}>
                        <Button
                          variant={state.open ? "primary" : "secondary"}
                          className="w-full"
                          disabled={!state.open}
                          icon={<ArrowRight className="size-4" />}
                        >
                          {state.open ? "Register Now" : "Registration closed"}
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </main>

      <footer className="border-t border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface-soft))] px-4 py-6 text-center sm:px-6">
        <p className="text-[12.5px] text-muted">
          Scrabble Tournament OS · Scrabble Tournament OS
        </p>
      </footer>
    </div>
  );
}

function Line({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2 text-muted">
      <span className="shrink-0 text-faint">{icon}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}
