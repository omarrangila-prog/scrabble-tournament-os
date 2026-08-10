"use client";

import * as React from "react";
import { ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Calendar,
  ChevronRight,
  ClipboardList,
  FileText,
  Gauge,
  Grid3x3,
  Info,
  ListOrdered,
  Mail,
  Phone,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  User,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { useRoster } from "@/lib/supabase/useRoster";
import { computeStandings } from "@/lib/engine/standings";
import {
  achievements as buildAchievements,
  careerStats,
  documents as buildDocuments,
  flagOf,
  isVerified,
  PLAYER_COUNTRY,
  playerInsights,
  rankProgression,
  ratingHistory,
  resultHeatmap,
} from "@/lib/domain/profile";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { PlayerSearch } from "@/components/profile/PlayerSearch";
import {
  AnimatedNumber,
  ProfileSkeleton,
  ProfileStat,
  ProgressRing,
} from "@/components/profile/primitives";
import { ROLE_LABEL } from "@/lib/store/permissions";
import { useIdentityStore } from "@/lib/store/useIdentityStore";
import { DigitalPlayerCard } from "@/components/identity/DigitalPlayerCard";
import { CATEGORY_LABEL } from "@/lib/domain/identity";
import { cn, downloadFile, formatDate, formatDateTime, signed, toCsv } from "@/lib/utils";


const TOOLTIP = {
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.9)",
  background: "rgba(255,255,255,0.97)",
  fontSize: 12,
  boxShadow: "0 12px 32px rgba(44,55,96,0.14)",
} as const;

const SECTIONS = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "identity", label: "Digital ID", icon: ShieldCheck },
  { id: "personal", label: "Personal", icon: User },
  { id: "career", label: "Career", icon: Trophy },
  { id: "tournament", label: "Current Tournament", icon: Grid3x3 },
  { id: "matches", label: "Match History", icon: ListOrdered },
  { id: "rankings", label: "Rankings", icon: TrendingUp },
  { id: "rating", label: "Rating History", icon: Activity },
  { id: "achievements", label: "Achievements", icon: Award },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "insights", label: "Insights", icon: Sparkles },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "contact", label: "Contact", icon: Phone },
  { id: "admin", label: "Settings", icon: Settings2 },
];

export default function PlayerProfilePage() {
  const params = useParams<{ playerId: string }>();
  const router = useRouter();
  const store = useStore();
  const { pairings, tournament, divisions, disputes, audit, role } = store;
  const identityStore = useIdentityStore();

  /*
   * The roster comes from the database, so a link from the player list resolves.
   * Reading it from browser storage meant every profile reached from a real
   * registration answered "player not found".
   */
  const roster = useRoster(ACTIVE_EVENT_ID);
  const players = roster.players;

  const [tab, setTab] = React.useState("overview");
  const [ready, setReady] = React.useState(false);

  // Brief skeleton so heavy charts mount after first paint.
  React.useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 120);
    return () => window.clearTimeout(id);
  }, []);

  const decoded = decodeURIComponent(params.playerId ?? "");
  const player = players.find(
    (p) => p.playerId.toLowerCase() === decoded.toLowerCase() || p.id === decoded,
  );

  /* ---- Derived profile data ------------------------------------------- */
  const division = divisions.find((d) => d.id === player?.division);
  const table = React.useMemo(
    () =>
      player ? computeStandings(players, pairings, tournament, { division: player.division }) : [],
    [player, players, pairings, tournament],
  );
  const row = table.find((r) => r.playerId === player?.id);

  const stats = React.useMemo(
    () => (player ? careerStats(player, pairings) : null),
    [player, pairings],
  );
  const heatmap = React.useMemo(
    () => (player ? resultHeatmap(player, pairings, tournament.totalRounds) : []),
    [player, pairings, tournament.totalRounds],
  );
  const progression = React.useMemo(
    () => (player ? rankProgression(player, players, pairings, tournament) : []),
    [player, players, pairings, tournament],
  );
  const ratings = React.useMemo(
    () => (player ? ratingHistory(player, row?.performance ?? 0) : []),
    [player, row],
  );
  const achievements = React.useMemo(
    () => (player && stats ? buildAchievements(player, stats) : []),
    [player, stats],
  );
  const docs = buildDocuments();
  const insights = React.useMemo(
    () => (player && stats ? playerInsights(player, stats, heatmap, progression) : []),
    [player, stats, heatmap, progression],
  );

  const games = React.useMemo(
    () =>
      player
        ? pairings
            .filter((p) => p.playerAId === player.id || p.playerBId === player.id)
            .sort((a, b) => b.round - a.round)
        : [],
    [player, pairings],
  );

  const identity = player ? identityStore.identities.find((i) => i.playerId === player.playerId) : undefined;
  const categoryHistory = player ? identityStore.historyOf(player.playerId) : [];

  const currentGame = games.find((g) => g.round === tournament.currentRound);
  const nameOf = (id: string | null) =>
    id ? players.find((p) => p.id === id)?.fullName ?? "—" : "Bye";

  /*
   * Still reading. Without this the page says "player not found" for the moment
   * before the roster arrives, which is the wrong answer rather than a slow one.
   */
  if (!roster.loaded) {
    return <ProfileSkeleton />;
  }

  /* ---- Not found ------------------------------------------------------- */
  if (!player) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-5">
          <PlayerSearch autoFocus />
        </div>
        <Card>
          <EmptyState
            icon={<Users className="size-5" />}
            title="Player not found"
            description={`No player matches “${decoded}”. Search above, or return to the player list.`}
            action={
              <Button variant="primary" onClick={() => router.push("/app/players")}>
                Back to players
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const quickAction = (action: "message" | "print" | "export" | "share") => {
    if (action === "share") {
      navigator.clipboard?.writeText(window.location.href);
      store.toast({ title: "Profile link copied", description: "Share this link with your team.", tone: "success" });
      return;
    }
    if (action === "print") {
      window.print();
      return;
    }
    if (action === "export") {
      const rows: (string | number)[][] = [
        ["Field", "Value"],
        ["Name", player.fullName],
        ["Player ID", player.playerId],
        ["Division", player.division],
        ["Rating", player.rating || "Unrated"],
        ["Seed", player.seed],
        ["Rank", row?.rank ?? "—"],
        ["Record", `${row?.wins ?? 0}-${row?.losses ?? 0}-${row?.draws ?? 0}`],
        ["Spread", row?.spread ?? 0],
        ["City", player.city],
        ["Club", player.club],
        [],
        ["Round", "Opponent", "Score", "Result"],
        ...games
          .filter((g) => g.scoreA !== undefined || g.playerBId === null)
          .map((g) => {
            const isA = g.playerAId === player.id;
            const mine = isA ? g.scoreA : g.scoreB;
            const theirs = isA ? g.scoreB : g.scoreA;
            return [
              g.round,
              nameOf(isA ? g.playerBId : g.playerAId),
              g.playerBId === null ? "Bye" : `${mine}-${theirs}`,
              g.playerBId === null ? "Bye" : (mine ?? 0) > (theirs ?? 0) ? "Won" : (mine ?? 0) < (theirs ?? 0) ? "Lost" : "Tie",
            ];
          }),
      ];
      downloadFile(`${player.playerId}-record.csv`, toCsv(rows), "text/csv");
      store.toast({ title: "Record exported", description: `${player.fullName}'s full record was downloaded.`, tone: "success" });
      return;
    }
    store.toast({
      title: "Message sent",
      description: `A notification was sent to ${player.fullName}.`,
      tone: "success",
    });
  };

  return (
    <div className="mx-auto max-w-[1500px]">
      {/* Breadcrumb + search */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
          <Link href="/app" className="shrink-0 hover:text-ink">Command Centre</Link>
          <ChevronRight className="size-3.5 shrink-0 text-faint" />
          <Link href="/app/players" className="shrink-0 hover:text-ink">Players</Link>
          <ChevronRight className="size-3.5 shrink-0 text-faint" />
          <span className="truncate font-medium text-ink">{player.fullName}</span>
        </nav>
        <div className="lg:ml-auto lg:w-[420px]">
          <PlayerSearch placeholder="Search another player…" />
        </div>
      </div>

      {/* Hero */}
      <ProfileHero
        player={player}
        rank={row?.rank}
        previousRank={row?.previousRank}
        divisionName={division?.name ?? player.division}
        record={{
          wins: row?.wins ?? 0,
          losses: row?.losses ?? 0,
          draws: row?.draws ?? 0,
          spread: row?.spread ?? 0,
        }}
        stats={stats!}
        onAction={quickAction}
      />

      {/* Sticky tabs */}
      <div className="sticky top-[57px] z-30 -mx-3 mt-4 bg-canvas/80 px-3 py-2 backdrop-blur-xl sm:-mx-5 sm:px-5">
        <div
          role="tablist"
          aria-label="Profile sections"
          className="flex gap-1 overflow-x-auto rounded-compact border border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface))] p-1 backdrop-blur-md scroll-slim"
        >
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={tab === s.id}
              onClick={() => setTab(s.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-control px-3 py-2 text-[13px] font-medium transition-all",
                tab === s.id
                  ? "bg-white text-ink shadow-[0_2px_10px_rgba(44,55,96,0.09)]"
                  : "text-muted hover:bg-[rgb(var(--c-surface))] hover:text-ink",
              )}
            >
              <s.icon className={cn("size-3.5", tab === s.id ? "text-primary" : "text-faint")} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="mt-4">
        {!ready ? (
          <div className="grid gap-3 lg:grid-cols-3">
            <ProfileSkeleton className="h-64 lg:col-span-2" />
            <ProfileSkeleton className="h-64" />
            <ProfileSkeleton className="h-48 lg:col-span-3" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
            >
              {/* ---------------- OVERVIEW ---------------- */}
              {tab === "overview" ? (
                <div className="grid gap-3 lg:grid-cols-12">
                  <div className="grid grid-cols-2 gap-3 lg:col-span-8 lg:grid-cols-4">
                    <ProfileStat label="Games played" value={<AnimatedNumber value={stats!.gamesPlayed} />} icon={<ClipboardList className="size-4.5" />} tone="primary" />
                    <ProfileStat label="Career wins" value={<AnimatedNumber value={stats!.wins} />} icon={<Trophy className="size-4.5" />} tone="success" delay={0.05} />
                    <ProfileStat label="Highest game" value={<AnimatedNumber value={stats!.highestGame} />} icon={<Target className="size-4.5" />} tone="warning" delay={0.1} />
                    <ProfileStat label="Peak rating" value={<AnimatedNumber value={stats!.peakRating} />} icon={<TrendingUp className="size-4.5" />} delay={0.15} />
                  </div>

                  <Card className="lg:col-span-4">
                    <CardHeader title="Win rate" subtitle="Across the full career record" />
                    <div className="flex items-center gap-5 px-5 pb-5">
                      <ProgressRing
                        value={stats!.winRate}
                        tone={stats!.winRate >= 60 ? "success" : stats!.winRate >= 45 ? "primary" : "warning"}
                        label={<AnimatedNumber value={stats!.winRate} suffix="%" />}
                        sublabel="win rate"
                      />
                      <dl className="min-w-0 flex-1 space-y-1.5 text-[12.5px]">
                        <Row label="Wins" value={String(stats!.wins)} tone="success" />
                        <Row label="Losses" value={String(stats!.losses)} tone="critical" />
                        <Row label="Draws" value={String(stats!.draws)} />
                        <Row label="Events" value={String(stats!.eventsPlayed)} />
                      </dl>
                    </div>
                  </Card>

                  {/* Rank progression */}
                  <Card className="lg:col-span-8">
                    <CardHeader
                      title="Rank progression"
                      subtitle={`Position in ${division?.name} after each round`}
                      icon={<TrendingUp className="size-4.5" />}
                    />
                    <div className="h-56 px-4 pb-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={progression} margin={{ top: 8, right: 10, bottom: 0, left: -22 }}>
                          <defs>
                            <linearGradient id="rankFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#6D5DFB" stopOpacity={0.28} />
                              <stop offset="100%" stopColor="#6D5DFB" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,22,43,0.06)" vertical={false} />
                          <XAxis dataKey="round" tickFormatter={(v) => `R${v}`} tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} />
                          <YAxis reversed allowDecimals={false} tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} />
                          <RTooltip contentStyle={TOOLTIP} formatter={(v) => [`Rank ${v}`, ""] as [string, string]} labelFormatter={(l) => `Round ${l}`} />
                          <Area type="monotone" dataKey="rank" stroke="#6D5DFB" strokeWidth={2.5} fill="url(#rankFill)" dot={{ r: 3.5, fill: "#6D5DFB" }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  {/* Current game */}
                  <Card className="lg:col-span-4">
                    <CardHeader title="Current round" subtitle={`Round ${tournament.currentRound}`} icon={<Grid3x3 className="size-4.5" />} />
                    <div className="px-5 pb-5">
                      {!currentGame ? (
                        <p className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-4 text-center text-[12.5px] text-muted">
                          Not paired in this round.
                        </p>
                      ) : currentGame.playerBId === null ? (
                        <div className="rounded-control bg-secondary-050 px-3.5 py-4 text-center">
                          <p className="text-[14px] font-semibold text-ink">Bye</p>
                          <p className="mt-1 text-[12.5px] text-muted">Scored as a win with a 50-point spread.</p>
                        </div>
                      ) : (
                        <>
                          <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4 text-center">
                            <Badge tone="primary">Board {currentGame.board}</Badge>
                            <p className="mt-2 text-[15px] font-semibold text-ink">
                              versus {nameOf(currentGame.playerAId === player.id ? currentGame.playerBId : currentGame.playerAId)}
                            </p>
                            {currentGame.scoreA !== undefined ? (
                              <p className="mt-1 text-[22px] font-semibold text-ink num">
                                {currentGame.playerAId === player.id
                                  ? `${currentGame.scoreA} – ${currentGame.scoreB}`
                                  : `${currentGame.scoreB} – ${currentGame.scoreA}`}
                              </p>
                            ) : (
                              <p className="mt-1 text-[12.5px] text-muted">Game in progress</p>
                            )}
                          </div>
                          <Button variant="secondary" size="sm" className="mt-2.5 w-full" onClick={() => router.push(`/app/pairings?board=${currentGame.board}`)}>
                            Open pairing
                          </Button>
                        </>
                      )}
                    </div>
                  </Card>

                  {/* Round heatmap */}
                  <Card className="lg:col-span-12">
                    <CardHeader title="Round-by-round form" subtitle="Result and margin in every round of this event" />
                    <div className="px-5 pb-5">
                      <div className="flex flex-wrap gap-1.5">
                        {heatmap.map((h) => (
                          <div
                            key={h.round}
                            title={`Round ${h.round}: ${h.result}${h.result === "win" || h.result === "loss" ? ` by ${Math.abs(h.spread)}` : ""}`}
                            className={cn(
                              "flex h-16 w-[calc(11.1%-6px)] min-w-[64px] flex-col items-center justify-center rounded-control text-center transition-transform hover:scale-105",
                              h.result === "win" && "bg-success-050 text-[#1b8f68]",
                              h.result === "loss" && "bg-critical-050 text-[#c93a51]",
                              h.result === "draw" && "bg-warning-050 text-[#b4741f]",
                              h.result === "bye" && "bg-secondary-050 text-[#2b7fd4]",
                              h.result === "pending" && "bg-[rgb(var(--c-line))] text-muted",
                              h.result === "none" && "border border-dashed border-line-strong text-faint",
                            )}
                          >
                            <span className="text-[10.5px] font-medium opacity-80">R{h.round}</span>
                            <span className="text-[14px] font-bold uppercase">
                              {h.result === "win" ? "W" : h.result === "loss" ? "L" : h.result === "draw" ? "D" : h.result === "bye" ? "BYE" : "—"}
                            </span>
                            {h.result === "win" || h.result === "loss" ? (
                              <span className="text-[10.5px] num">{signed(h.spread)}</span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                </div>
              ) : null}

              {/* ---------------- DIGITAL ID ---------------- */}
              {tab === "identity" ? (
                <div className="grid gap-3 lg:grid-cols-12">
                  <div className="lg:col-span-7">
                    {identity ? (
                      <DigitalPlayerCard
                        identity={identity}
                        hue={player.avatarHue}
                        initials={player.initials}
                        rating={player.rating}
                        ranking={row?.rank}
                        status={player.checkIn}
                        onDownload={() =>
                          store.toast({
                            title: "Player card downloaded",
                            description: `${player.fullName}'s digital identity card was saved.`,
                            tone: "success",
                          })
                        }
                      />
                    ) : (
                      <Card>
                        <EmptyState
                          icon={<ShieldCheck className="size-5" />}
                          title="No digital identity on file"
                          description="This player predates the identity system. Approving any registration will issue a permanent Player ID."
                        />
                      </Card>
                    )}

                    <Card className="mt-3">
                      <CardHeader
                        title="Category history"
                        subtitle="Every category decision, oldest last. Entries are never removed."
                        icon={<ListOrdered className="size-4.5" />}
                      />
                      <div className="px-5 pb-5">
                        {categoryHistory.length === 0 ? (
                          <p className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-4 text-center text-[12.5px] text-muted">
                            No category changes recorded.
                          </p>
                        ) : (
                          <ol className="relative space-y-2.5 border-l border-line-strong pl-5">
                            {categoryHistory.map((l) => (
                              <li key={l.id} className="relative">
                                <span
                                  className={cn(
                                    "absolute -left-[26px] top-1.5 size-3 rounded-full ring-4 ring-canvas",
                                    l.kind === "promotion" ? "bg-success" : l.kind === "demotion" ? "bg-warning" : "bg-primary",
                                  )}
                                />
                                <div className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-[13px] font-semibold capitalize text-ink">
                                      {l.from ? `${CATEGORY_LABEL[l.from]} → ` : ""}
                                      {CATEGORY_LABEL[l.to]}
                                    </p>
                                    <Badge tone={l.kind === "promotion" ? "success" : l.kind === "demotion" ? "warning" : "neutral"}>
                                      {l.kind}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 text-[12px] leading-relaxed text-muted">{l.reason}</p>
                                  <p className="mt-1 text-[11.5px] text-faint">
                                    {l.decidedBy} · {formatDateTime(l.at)}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </Card>
                  </div>

                  <Card className="lg:col-span-5">
                    <CardHeader title="Identity record" subtitle="Verified once, reused for every event" icon={<ShieldCheck className="size-4.5" />} />
                    <div className="px-5 pb-5">
                      {identity ? (
                        <>
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px]">
                            <Detail label="Player ID" value={identity.playerId} />
                            <Detail label="Category" value={CATEGORY_LABEL[identity.category]} />
                            <Detail label="Father's name" value={identity.fatherName} />
                            <Detail label="Date of birth" value={formatDate(identity.dateOfBirth)} />
                            <Detail label="Nationality" value={identity.nationality} />
                            <Detail label="Province" value={identity.province} />
                            <Detail label="Mobile" value={identity.mobile} />
                            <Detail label="Email" value={identity.email} />
                          </dl>
                          <p className="mt-3 rounded-control bg-[rgb(var(--c-surface-strong))] px-3 py-2 text-[12px] text-muted">
                            {identity.address}
                          </p>

                          <div className="mt-3 space-y-1.5">
                            <div className="flex items-center justify-between rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5">
                              <span className="text-[12.5px] text-muted">Photograph</span>
                              <Badge tone={identity.photo?.verified ? "success" : "warning"} dot>
                                {identity.photo ? (identity.photo.verified ? "Verified" : "Pending review") : "Not provided"}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5">
                              <span className="text-[12.5px] text-muted">Identity document</span>
                              <Badge tone={identity.identityDocument?.verified ? "success" : "warning"} dot>
                                {identity.identityDocument
                                  ? identity.identityDocument.verified
                                    ? "Verified"
                                    : "Pending review"
                                  : "Not provided"}
                              </Badge>
                            </div>
                          </div>

                          <p className="mt-3 flex items-start gap-1.5 rounded-control bg-secondary-050 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-[#2b7fd4]">
                            <Info className="mt-px size-3.5 shrink-0" />
                            This Player ID is permanent. Every tournament, result, ranking and
                            achievement in the platform links back to it.
                          </p>
                        </>
                      ) : (
                        <p className="text-[12.5px] text-muted">No identity record available.</p>
                      )}
                    </div>
                  </Card>
                </div>
              ) : null}

              {/* ---------------- PERSONAL ---------------- */}
              {tab === "personal" ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  <Card>
                    <CardHeader title="Personal information" icon={<User className="size-4.5" />} />
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 pb-5 text-[13px]">
                      <Detail label="Full name" value={player.fullName} />
                      <Detail label="Player ID" value={player.playerId} />
                      <Detail label="Country" value={`${flagOf(PLAYER_COUNTRY.code)} ${PLAYER_COUNTRY.name}`} />
                      <Detail label="City" value={player.city} />
                      <Detail label="Club or school" value={player.club} />
                      <Detail label="Division" value={division?.name ?? player.division} />
                      <Detail label="Seed" value={`#${player.seed}`} />
                      <Detail label="Registered" value={formatDate(player.registeredAt)} />
                    </dl>
                  </Card>

                  <Card>
                    <CardHeader title="Rating and status" icon={<ShieldCheck className="size-4.5" />} />
                    <div className="space-y-2 px-5 pb-5">
                      <div className="flex items-center justify-between rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-3">
                        <div>
                          <p className="text-[12px] text-muted">Current rating</p>
                          <p className="text-[22px] font-semibold text-ink num">{player.rating || "Unrated"}</p>
                        </div>
                        <Badge tone={player.ratingStatus === "rated" ? "success" : player.ratingStatus === "provisional" ? "warning" : "neutral"} dot>
                          {player.ratingStatus}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <MiniBox label="Peak rating" value={String(stats!.peakRating || "—")} />
                        <MiniBox label="Verification" value={isVerified(player) ? "Verified" : "Pending"} />
                        <MiniBox label="Payment" value={player.payment} />
                        <MiniBox label="Check-in" value={player.checkIn.replace(/-/g, " ")} />
                      </div>
                      {player.accommodation ? (
                        <div className="rounded-control bg-warning-050/70 px-3.5 py-3">
                          <p className="text-[12px] font-semibold text-[#b4741f]">Special accommodation</p>
                          <p className="mt-0.5 text-[12.5px] text-ink">{player.accommodation}</p>
                          <p className="mt-1 text-[11.5px] text-muted">
                            The pairing engine honours this when assigning boards.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </Card>
                </div>
              ) : null}

              {/* ---------------- CAREER ---------------- */}
              {tab === "career" ? (
                <div className="grid gap-3 lg:grid-cols-12">
                  <div className="grid grid-cols-2 gap-3 lg:col-span-8 lg:grid-cols-4">
                    <ProfileStat label="Events played" value={<AnimatedNumber value={stats!.eventsPlayed} />} icon={<Calendar className="size-4.5" />} tone="primary" />
                    <ProfileStat label="Titles won" value={<AnimatedNumber value={stats!.titlesWon} />} icon={<Trophy className="size-4.5" />} tone="warning" delay={0.05} />
                    <ProfileStat label="Average score" value={<AnimatedNumber value={stats!.averageScore} />} icon={<Target className="size-4.5" />} delay={0.1} />
                    <ProfileStat label="Best finish" value={stats!.bestFinish} icon={<Award className="size-4.5" />} tone="success" delay={0.15} />
                  </div>

                  <Card className="lg:col-span-4">
                    <CardHeader title="Result split" subtitle="Career wins, losses and draws" />
                    <div className="h-52 px-4 pb-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: "Wins", value: stats!.wins, fill: "#32C997" },
                              { name: "Losses", value: stats!.losses, fill: "#EF5B72" },
                              { name: "Draws", value: stats!.draws || 0.001, fill: "#F5A94A" },
                            ]}
                            dataKey="value"
                            innerRadius={44}
                            outerRadius={72}
                            paddingAngle={3}
                            stroke="none"
                          />
                          <RTooltip contentStyle={TOOLTIP} formatter={(v, n) => [`${Math.round(Number(v))}`, String(n)] as [string, string]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-4 px-4 pb-4 text-[11.5px]">
                      {[["Wins", "#32C997"], ["Losses", "#EF5B72"], ["Draws", "#F5A94A"]].map(([l, c]) => (
                        <span key={l} className="flex items-center gap-1.5 text-muted">
                          <span className="size-2 rounded-full" style={{ background: c }} />
                          {l}
                        </span>
                      ))}
                    </div>
                  </Card>

                  <Card className="lg:col-span-12">
                    <CardHeader title="Tournament history" subtitle="Previous championship appearances" icon={<Calendar className="size-4.5" />} />
                    <div className="px-5 pb-5">
                      <ol className="relative space-y-3 border-l border-line-strong pl-5">
                        {[
                          { year: 2026, event: tournament.name.replace(" — Demo", ""), place: `Currently ${row?.rank ? `#${row.rank}` : "unranked"}`, current: true },
                          ...player.tournamentHistory.map((h) => ({ ...h, current: false })),
                        ].map((h, i) => (
                          <li key={i} className="relative">
                            <span
                              className={cn(
                                "absolute -left-[26px] top-1 grid size-3 place-items-center rounded-full ring-4 ring-canvas",
                                h.current ? "bg-primary" : "bg-faint",
                              )}
                            />
                            <div className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[13.5px] font-semibold text-ink">{h.event}</p>
                                <Badge tone={h.current ? "success" : "neutral"} dot={h.current}>
                                  {h.year}
                                </Badge>
                              </div>
                              <p className="mt-0.5 text-[12.5px] text-muted">{h.place}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </Card>
                </div>
              ) : null}

              {/* ---------------- CURRENT TOURNAMENT ---------------- */}
              {tab === "tournament" ? (
                <div className="grid gap-3 lg:grid-cols-12">
                  <Card className="lg:col-span-8">
                    <CardHeader title={tournament.name.replace(" — Demo", "")} subtitle={`${store.venue.name} · Round ${tournament.currentRound} of ${tournament.totalRounds}`} icon={<Trophy className="size-4.5" />} />
                    <div className="grid grid-cols-2 gap-2.5 px-5 pb-5 sm:grid-cols-4">
                      <MiniBox label="Rank" value={row?.rank ? `#${row.rank}` : "—"} />
                      <MiniBox label="Record" value={`${row?.wins ?? 0}–${row?.losses ?? 0}`} />
                      <MiniBox label="Spread" value={signed(row?.spread ?? 0)} />
                      <MiniBox label="Performance" value={String(row?.performance || "—")} />
                    </div>
                  </Card>

                  <Card className="lg:col-span-4">
                    <CardHeader title="Attendance" subtitle="Round participation" />
                    <div className="space-y-1.5 px-5 pb-5">
                      {heatmap.slice(0, tournament.currentRound).map((h) => (
                        <div key={h.round} className="flex items-center justify-between rounded-control bg-[rgb(var(--c-surface))] px-3 py-2 text-[12.5px]">
                          <span className="text-muted">Round {h.round}</span>
                          <Badge tone={h.result === "pending" ? "warning" : h.result === "none" ? "neutral" : "success"} dot>
                            {h.result === "none" ? "Not paired" : h.result === "pending" ? "In progress" : "Played"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </Card>

                  {disputes.filter((d) => d.playerIds.includes(player.id)).length > 0 ? (
                    <Card className="lg:col-span-12">
                      <CardHeader title="Arbiter cases involving this player" icon={<AlertTriangle className="size-4.5" />} />
                      <div className="space-y-2 px-5 pb-5">
                        {disputes.filter((d) => d.playerIds.includes(player.id)).map((d) => (
                          <button key={d.id} onClick={() => router.push(`/app/arbiter?case=${d.id}`)} className="flex w-full items-center gap-3 rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5 text-left hover:bg-[rgb(var(--c-surface-strong))]">
                            <span className="text-[12.5px] font-semibold text-ink num">{d.caseNumber}</span>
                            <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{d.description}</span>
                            <Badge tone={d.status === "closed" ? "success" : "warning"} dot>{d.status}</Badge>
                          </button>
                        ))}
                      </div>
                    </Card>
                  ) : null}
                </div>
              ) : null}

              {/* ---------------- MATCH HISTORY ---------------- */}
              {tab === "matches" ? (
                <Card>
                  <CardHeader title="Match history" subtitle={`${games.length} games in this tournament`} icon={<ListOrdered className="size-4.5" />} />
                  <div className="px-3 pb-4">
                    <TableWrap>
                      <thead>
                        <tr>
                          <Th className="w-20">Round</Th>
                          <Th className="w-20">Board</Th>
                          <Th>Opponent</Th>
                          <Th className="w-24">Rating</Th>
                          <Th className="w-28">Score</Th>
                          <Th className="w-24">Spread</Th>
                          <Th className="w-28">Result</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {games.map((g) => {
                          const isA = g.playerAId === player.id;
                          const oppId = isA ? g.playerBId : g.playerAId;
                          const opp = oppId ? players.find((p) => p.id === oppId) : null;
                          const mine = isA ? g.scoreA : g.scoreB;
                          const theirs = isA ? g.scoreB : g.scoreA;
                          const decided = mine !== undefined && theirs !== undefined;
                          const won = g.playerBId === null || (decided && mine! > theirs!);
                          const tie = decided && mine === theirs;
                          return (
                            <tr key={g.id} className="hover:bg-[rgb(var(--c-surface-soft))]">
                              <Td className="num font-medium">{g.round}</Td>
                              <Td className="num">{g.playerBId === null ? "—" : g.board}</Td>
                              <Td>
                                {opp ? (
                                  <button onClick={() => router.push(`/app/players/${opp.playerId}`)} className="flex items-center gap-2 text-left hover:underline">
                                    <Avatar initials={opp.initials} hue={opp.avatarHue} size={26} />
                                    <span className="truncate text-[13px] font-medium text-ink">{opp.fullName}</span>
                                  </button>
                                ) : (
                                  <span className="text-muted">Bye</span>
                                )}
                              </Td>
                              <Td className="num text-muted">{opp?.rating || "—"}</Td>
                              <Td className="num">{decided ? `${mine} – ${theirs}` : g.playerBId === null ? "Bye" : "—"}</Td>
                              <Td className={cn("num", decided && mine! - theirs! > 0 ? "text-success" : decided && mine! - theirs! < 0 ? "text-critical" : "")}>
                                {decided ? signed(mine! - theirs!) : "—"}
                              </Td>
                              <Td>
                                {g.playerBId === null ? (
                                  <Badge tone="info">Bye</Badge>
                                ) : !decided ? (
                                  <Badge tone="neutral" dot>In progress</Badge>
                                ) : tie ? (
                                  <Badge tone="warning" dot>Tie</Badge>
                                ) : won ? (
                                  <Badge tone="success" dot>Won</Badge>
                                ) : (
                                  <Badge tone="critical" dot>Lost</Badge>
                                )}
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </TableWrap>
                  </div>
                </Card>
              ) : null}

              {/* ---------------- RANKINGS ---------------- */}
              {tab === "rankings" ? (
                <div className="grid gap-3 lg:grid-cols-12">
                  <Card className="lg:col-span-7">
                    <CardHeader title="Rank movement" subtitle="Position after each round" icon={<TrendingUp className="size-4.5" />} />
                    <div className="h-64 px-4 pb-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={progression} margin={{ top: 8, right: 10, bottom: 0, left: -22 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,22,43,0.06)" vertical={false} />
                          <XAxis dataKey="round" tickFormatter={(v) => `R${v}`} tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} />
                          <YAxis reversed allowDecimals={false} tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} />
                          <RTooltip contentStyle={TOOLTIP} formatter={(v) => [`Rank ${v}`, ""] as [string, string]} labelFormatter={(l) => `Round ${l}`} />
                          <Line type="monotone" dataKey="rank" stroke="#6D5DFB" strokeWidth={2.5} dot={{ r: 3.5, fill: "#6D5DFB" }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card className="lg:col-span-5">
                    <CardHeader title="Division standings" subtitle={`${division?.name} — nearby positions`} />
                    <div className="space-y-1 px-4 pb-4">
                      {table
                        .filter((r) => Math.abs(r.rank - (row?.rank ?? 1)) <= 3)
                        .map((r) => {
                          const p = players.find((x) => x.id === r.playerId)!;
                          const isSelf = r.playerId === player.id;
                          return (
                            <button
                              key={r.playerId}
                              onClick={() => !isSelf && router.push(`/app/players/${p.playerId}`)}
                              className={cn(
                                "flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left transition-colors",
                                isSelf ? "bg-primary-050 ring-1 ring-primary/25" : "bg-[rgb(var(--c-surface))] hover:bg-[rgb(var(--c-surface-strong))]",
                              )}
                            >
                              <span className="w-6 shrink-0 text-center text-[13px] font-semibold text-ink num">{r.rank}</span>
                              <Avatar initials={p.initials} hue={p.avatarHue} size={28} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12.5px] font-medium text-ink">{p.fullName}</span>
                                <span className="block text-[11px] text-muted num">{r.wins}–{r.losses} · {signed(r.spread)}</span>
                              </span>
                              {isSelf ? <Badge tone="primary">This player</Badge> : null}
                            </button>
                          );
                        })}
                    </div>
                  </Card>
                </div>
              ) : null}

              {/* ---------------- RATING HISTORY ---------------- */}
              {tab === "rating" ? (
                <Card>
                  <CardHeader title="Rating history" subtitle="Rating across recent rating periods" icon={<Activity className="size-4.5" />} />
                  {ratings.length === 0 ? (
                    <div className="px-5 pb-5">
                      <EmptyState title="No rating history" description="This player is unrated, so no rating periods have been recorded." />
                    </div>
                  ) : (
                    <>
                      <div className="h-72 px-4 pb-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={ratings} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
                            <defs>
                              <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#4BA8FF" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="#4BA8FF" stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,22,43,0.06)" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} />
                            <YAxis domain={["dataMin - 40", "dataMax + 40"]} tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} />
                            <RTooltip contentStyle={TOOLTIP} formatter={(v) => [`${v}`, "Rating"] as [string, string]} />
                            <Area type="monotone" dataKey="rating" stroke="#4BA8FF" strokeWidth={2.5} fill="url(#ratingFill)" dot={{ r: 3, fill: "#4BA8FF" }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5 px-5 pb-5 sm:grid-cols-4">
                        <MiniBox label="Current" value={String(player.rating)} />
                        <MiniBox label="Peak" value={String(stats!.peakRating)} />
                        <MiniBox label="Status" value={player.ratingStatus} />
                        <MiniBox label="Live performance" value={String(row?.performance || "—")} />
                      </div>
                    </>
                  )}
                </Card>
              ) : null}

              {/* ---------------- ACHIEVEMENTS ---------------- */}
              {tab === "achievements" ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {achievements.length === 0 ? (
                    <Card className="sm:col-span-2 lg:col-span-3">
                      <EmptyState icon={<Award className="size-5" />} title="No achievements yet" description="Achievements appear as the player records results in this and future events." />
                    </Card>
                  ) : (
                    achievements.map((a, i) => (
                      <motion.div
                        key={a.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.04 }}
                        className="glass rounded-card p-4 transition-transform hover:-translate-y-0.5"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              "grid size-11 shrink-0 place-items-center rounded-control",
                              a.tier === "gold" && "bg-gradient-to-br from-[#F7D97B] to-[#E0A32E] text-white",
                              a.tier === "silver" && "bg-gradient-to-br from-[#E6EAF2] to-[#B7C0D0] text-[#4a5568]",
                              a.tier === "bronze" && "bg-gradient-to-br from-[#F0C39B] to-[#C88A5B] text-white",
                              a.tier === "milestone" && "bg-primary-050 text-primary",
                            )}
                          >
                            {a.tier === "milestone" ? <Calendar className="size-5" /> : <Trophy className="size-5" />}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[14px] font-semibold leading-snug text-ink">{a.title}</p>
                            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{a.detail}</p>
                            <Badge tone="neutral" className="mt-2">{a.year}</Badge>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              ) : null}

              {/* ---------------- ANALYTICS ---------------- */}
              {tab === "analytics" ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  <Card>
                    <CardHeader title="Spread by round" subtitle="Winning and losing margins in this event" icon={<BarChart3 className="size-4.5" />} />
                    <div className="h-64 px-4 pb-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={heatmap.filter((h) => h.result !== "none")} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,22,43,0.06)" vertical={false} />
                          <XAxis dataKey="round" tickFormatter={(v) => `R${v}`} tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} />
                          <RTooltip contentStyle={TOOLTIP} formatter={(v) => [signed(Number(v)), "Spread"] as [string, string]} labelFormatter={(l) => `Round ${l}`} />
                          <Bar dataKey="spread" radius={[6, 6, 0, 0]}>
                            {heatmap.filter((h) => h.result !== "none").map((h) => (
                              <Cell key={h.round} fill={h.spread >= 0 ? "#32C997" : "#EF5B72"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card>
                    <CardHeader title="Opponent strength" subtitle="Rating of each opponent faced" />
                    <div className="h-64 px-4 pb-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={games
                            .filter((g) => g.playerBId !== null)
                            .sort((a, b) => a.round - b.round)
                            .map((g) => {
                              const oppId = g.playerAId === player.id ? g.playerBId : g.playerAId;
                              const opp = players.find((p) => p.id === oppId);
                              return { round: g.round, rating: opp?.rating || 0, name: opp?.fullName ?? "" };
                            })}
                          margin={{ top: 8, right: 10, bottom: 0, left: -18 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,22,43,0.06)" vertical={false} />
                          <XAxis dataKey="round" tickFormatter={(v) => `R${v}`} tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} />
                          <YAxis domain={["dataMin - 60", "dataMax + 60"]} tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} />
                          <RTooltip contentStyle={TOOLTIP} formatter={(v, _n, item) => [`${v}`, item?.payload?.name ?? "Opponent"] as [string, string]} labelFormatter={(l) => `Round ${l}`} />
                          <Line type="monotone" dataKey="rating" stroke="#F5A94A" strokeWidth={2.5} dot={{ r: 3.5, fill: "#F5A94A" }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card className="lg:col-span-2">
                    <CardHeader title="Performance summary" subtitle="Key figures from this tournament" />
                    <div className="grid grid-cols-2 gap-2.5 px-5 pb-5 sm:grid-cols-3 lg:grid-cols-6">
                      <MiniBox label="Games played" value={String(row?.played ?? 0)} />
                      <MiniBox label="Win rate here" value={`${row?.played ? Math.round((row.wins / row.played) * 100) : 0}%`} />
                      <MiniBox label="Average score" value={String(stats!.averageScore || "—")} />
                      <MiniBox label="Highest game" value={String(stats!.highestGame)} />
                      <MiniBox label="Buchholz" value={String(Math.round(row?.buchholz ?? 0))} />
                      <MiniBox label="Performance" value={String(row?.performance || "—")} />
                    </div>
                  </Card>
                </div>
              ) : null}

              {/* ---------------- INSIGHTS ---------------- */}
              {tab === "insights" ? (
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="space-y-2.5 lg:col-span-2">
                    {insights.map((ins, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.05 }}
                        className={cn(
                          "rounded-compact border p-4",
                          ins.tone === "success" && "border-success/25 bg-success-050/45",
                          ins.tone === "warning" && "border-warning/25 bg-warning-050/45",
                          ins.tone === "info" && "border-secondary/25 bg-secondary-050/40",
                        )}
                      >
                        <p className="text-[14px] font-semibold text-ink">{ins.title}</p>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{ins.body}</p>
                      </motion.div>
                    ))}
                  </div>

                  <Card>
                    <CardHeader title="About these observations" icon={<Sparkles className="size-4.5" />} />
                    <div className="px-5 pb-5">
                      <p className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
                        Every observation above is computed directly from this player&apos;s verified
                        results and ranking history in the current tournament.
                      </p>
                      <p className="mt-2 flex items-start gap-1.5 rounded-control bg-secondary-050 px-3.5 py-3 text-[12px] leading-relaxed text-[#2b7fd4]">
                        <Info className="mt-px size-3.5 shrink-0" />
                        Guidance only. These are summaries of recorded results, not predictions, and
                        they never affect pairings, rankings or rulings.
                      </p>
                      <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => router.push("/app/copilot")}>
                        Ask the Tournament Copilot
                      </Button>
                    </div>
                  </Card>
                </div>
              ) : null}

              {/* ---------------- DOCUMENTS ---------------- */}
              {tab === "documents" ? (
                <Card>
                  <CardHeader title="Documents" subtitle={`${docs.length} files on record`} icon={<FileText className="size-4.5" />} />
                  <div className="space-y-2 px-5 pb-5">
                    {docs.map((d) => (
                      <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-050 text-primary">
                          <FileText className="size-4.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium text-ink">{d.name}</p>
                          <p className="text-[11.5px] text-muted">
                            {formatDateTime(d.uploadedAt)} · {d.sizeKb} KB · <span className="capitalize">{d.kind}</span>
                          </p>
                        </div>
                        <Badge tone={d.verified ? "success" : "warning"} dot>
                          {d.verified ? "Verified" : "Pending review"}
                        </Badge>
                        <Button size="sm" variant="ghost" onClick={() => store.toast({ title: "Document opened", description: `${d.name} was opened for review.`, tone: "info" })}>
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}

              {/* ---------------- CONTACT ---------------- */}
              {tab === "contact" ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  <Card>
                    <CardHeader title="Emergency contact" icon={<Phone className="size-4.5" />} />
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 pb-5 text-[13px]">
                      <Detail label="Name" value={player.emergencyContact.name} />
                      <Detail label="Relationship" value={player.emergencyContact.relationship} />
                      <Detail label="Phone" value={player.emergencyContact.phone} />
                      <Detail label="City" value={player.city} />
                    </dl>
                  </Card>

                  <Card>
                    <CardHeader title="Send a message" subtitle="Delivered through the player app" icon={<Mail className="size-4.5" />} />
                    <div className="space-y-2 px-5 pb-5">
                      {["Check-in reminder", "Board changed", "Round starting", "Result verified"].map((t) => (
                        <button
                          key={t}
                          onClick={() => store.toast({ title: "Message sent", description: `“${t}” was sent to ${player.fullName}.`, tone: "success" })}
                          className="flex w-full items-center justify-between rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5 text-left text-[13px] text-ink transition-colors hover:bg-[rgb(var(--c-surface-strong))]"
                        >
                          {t}
                          <ChevronRight className="size-4 text-faint" />
                        </button>
                      ))}
                      <Button variant="secondary" size="sm" className="w-full" onClick={() => router.push("/app/communication")}>
                        Open communication centre
                      </Button>
                    </div>
                  </Card>
                </div>
              ) : null}

              {/* ---------------- ADMIN ---------------- */}
              {tab === "admin" ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  <Card>
                    <CardHeader title="Administrative actions" subtitle={`Signed in as ${ROLE_LABEL[role]}`} icon={<Settings2 className="size-4.5" />} />
                    <div className="space-y-2 px-5 pb-5">
                      {[
                        { label: "Mark as checked in", run: () => store.checkInPlayer(player.id, "profile screen") },
                        { label: "Mark absent", run: () => store.setPlayerStatus(player.id, "absent", "Marked from profile") },
                        { label: "Withdraw player", run: () => store.setPlayerStatus(player.id, "withdrawn", "Withdrawn from profile") },
                      ].map((a) => (
                        <Button
                          key={a.label}
                          variant="secondary"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => {
                            if (!store.requireCapability("checkin.manage")) return;
                            a.run();
                            store.toast({ title: a.label, description: `${player.fullName} was updated.`, tone: "success" });
                          }}
                        >
                          {a.label}
                        </Button>
                      ))}
                    </div>
                  </Card>

                  <Card>
                    <CardHeader title="Profile audit trail" subtitle="Changes recorded against this player" />
                    <div className="space-y-1.5 px-5 pb-5">
                      {audit.filter((a) => a.target.includes(player.playerId)).length === 0 ? (
                        <p className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-4 text-center text-[12.5px] text-muted">
                          No changes recorded for this player yet.
                        </p>
                      ) : (
                        audit
                          .filter((a) => a.target.includes(player.playerId))
                          .slice(0, 8)
                          .map((a) => (
                            <div key={a.id} className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5">
                              <p className="text-[12.5px] font-medium text-ink">{a.action}</p>
                              <p className="text-[11.5px] text-muted">
                                {a.user} · {formatDateTime(a.at)}
                                {a.newValue ? ` · ${a.newValue}` : ""}
                              </p>
                            </div>
                          ))
                      )}
                    </div>
                  </Card>
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] font-medium capitalize text-ink">{value}</dd>
    </div>
  );
}

function MiniBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control bg-[rgb(var(--c-surface))] px-3 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-[16px] font-semibold capitalize text-ink num">{value}</p>
    </div>
  );
}

function Row({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "critical";
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd
        className={cn(
          "font-semibold num",
          tone === "success" && "text-[#1b8f68]",
          tone === "critical" && "text-[#c93a51]",
          tone === "neutral" && "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
