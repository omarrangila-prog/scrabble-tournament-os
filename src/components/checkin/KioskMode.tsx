"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  HandHelping,
  Keyboard,
  MapPin,
  Printer,
  QrCode,
  ScanLine,
  Search,
  X,
} from "lucide-react";
import { Avatar, Badge, Button, Input } from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { Player } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type Step = "welcome" | "scan" | "id" | "search" | "success";

/** Physical zone for a board, so the player knows where to walk. */
function zoneFor(board: number): { hall: string; row: number } {
  if (board <= 20) return { hall: "Main Hall", row: Math.ceil(board / 6) };
  if (board <= 44) return { hall: "Blue Hall", row: Math.ceil((board - 20) / 6) };
  return { hall: "Youth Hall", row: Math.ceil((board - 44) / 6) };
}

/**
 * Full-screen check-in kiosk.
 *
 * One decision per screen, oversized touch targets and a board number that
 * dominates the success state — a player should be able to read their table
 * from arm's length without asking a volunteer.
 */
export function KioskMode({ onExit }: { onExit: () => void }) {
  const store = useStore();
  const { players, pairings, tournament } = store;

  const [step, setStep] = React.useState<Step>("welcome");
  const [entry, setEntry] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [player, setPlayer] = React.useState<Player | null>(null);

  const pairingFor = (p: Player) =>
    pairings.find(
      (x) => x.round === tournament.currentRound && (x.playerAId === p.id || x.playerBId === p.id),
    );

  const opponentOf = (p: Player) => {
    const pair = pairingFor(p);
    if (!pair || pair.playerBId === null) return null;
    const oppId = pair.playerAId === p.id ? pair.playerBId : pair.playerAId;
    return players.find((x) => x.id === oppId) ?? null;
  };

  const complete = (target: Player, method: string) => {
    if (target.checkIn !== "checked-in") store.checkInPlayer(target.id, method);
    setPlayer(target);
    setStep("success");
  };

  const simulateScan = () => {
    setScanning(true);
    window.setTimeout(() => {
      const target =
        players.find((p) => p.checkIn === "late") ??
        players.find((p) => p.checkIn === "not-arrived") ??
        players.find((p) => p.checkIn === "absent") ??
        players[0];
      setScanning(false);
      complete(target, "QR code");
    }, 1250);
  };

  const matches = React.useMemo(() => {
    const q = entry.trim().toLowerCase();
    if (!q) return [];
    return players
      .filter(
        (p) => p.fullName.toLowerCase().includes(q) || p.playerId.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [entry, players]);

  const reset = () => {
    setStep("welcome");
    setEntry("");
    setPlayer(null);
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-canvas">
      {/* Ambient wash */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: `
            radial-gradient(54rem 38rem at 12% -6%, rgba(115,87,246,0.18), transparent 62%),
            radial-gradient(48rem 34rem at 90% 4%, rgba(85,201,232,0.16), transparent 64%),
            radial-gradient(40rem 30rem at 70% 96%, rgba(255,144,203,0.12), transparent 64%)`,
        }}
        aria-hidden
      />

      {/* Header */}
      <header className="relative flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold uppercase tracking-[0.08em] text-primary">
            {tournament.name.replace(" — Demo", "")}
          </p>
          <p className="text-[12.5px] text-muted">
            {store.venue.name} · Round {tournament.currentRound}
          </p>
        </div>
        <Button variant="secondary" onClick={onExit} icon={<X className="size-4" />}>
          Exit kiosk
        </Button>
      </header>

      <main className="relative mx-auto flex min-h-[calc(100dvh-88px)] w-full max-w-4xl flex-col justify-center px-6 pb-12 sm:px-10">
        <AnimatePresence mode="wait">
          {/* -------------------------------------------------------------- */}
          {step === "welcome" ? (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <h1 className="text-center text-[34px] font-extrabold leading-[1.1] tracking-[-0.035em] text-ink sm:text-[46px]">
                Welcome. Let&apos;s find your
                <br />
                tournament seat.
              </h1>
              <p className="mt-4 text-center text-[16px] text-muted">
                Choose how you would like to check in.
              </p>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <KioskOption
                  icon={<QrCode className="size-9" />}
                  title="Scan QR Code"
                  detail="Use the code on your badge"
                  onClick={() => setStep("scan")}
                />
                <KioskOption
                  icon={<Keyboard className="size-9" />}
                  title="Enter Player ID"
                  detail="For example PK-042"
                  onClick={() => setStep("id")}
                />
                <KioskOption
                  icon={<Search className="size-9" />}
                  title="Search My Name"
                  detail="Type any part of your name"
                  onClick={() => setStep("search")}
                />
              </div>

              <div className="mt-8 flex items-center justify-center gap-2 rounded-feature bg-[rgb(var(--c-surface))] px-5 py-4 text-center">
                <HandHelping className="size-5 shrink-0 text-primary" />
                <p className="text-[13.5px] text-muted">
                  Need a hand? A volunteer at the Help Desk can check you in.
                </p>
              </div>
            </motion.div>
          ) : null}

          {/* -------------------------------------------------------------- */}
          {step === "scan" ? (
            <motion.div
              key="scan"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <h1 className="text-[30px] font-extrabold tracking-[-0.03em] text-ink sm:text-[38px]">
                Hold your badge to the scanner
              </h1>

              <div
                className={cn(
                  "relative mx-auto mt-8 grid aspect-square w-full max-w-[380px] place-items-center overflow-hidden rounded-panel border-2 border-dashed",
                  scanning
                    ? "border-primary bg-primary-050/60"
                    : "border-line-strong bg-[rgb(var(--c-surface))]",
                )}
              >
                <div className="board-motif absolute inset-0 opacity-50" aria-hidden />
                <QrCode
                  className={cn("relative size-32", scanning ? "text-primary" : "text-faint")}
                />
                {scanning ? (
                  <motion.div
                    initial={{ top: "8%" }}
                    animate={{ top: ["8%", "88%", "8%"] }}
                    transition={{ duration: 1.25, ease: "easeInOut" }}
                    className="absolute inset-x-8 h-1 rounded-full bg-primary shadow-[0_0_18px_rgba(115,87,246,0.7)]"
                  />
                ) : null}
                {[
                  "left-5 top-5 border-l-4 border-t-4",
                  "right-5 top-5 border-r-4 border-t-4",
                  "left-5 bottom-5 border-b-4 border-l-4",
                  "right-5 bottom-5 border-b-4 border-r-4",
                ].map((c) => (
                  <span
                    key={c}
                    className={cn("absolute size-10 rounded-[8px] border-primary/60", c)}
                  />
                ))}
              </div>

              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button size="xl" variant="primary" loading={scanning} onClick={simulateScan}>
                  <ScanLine className="size-5" />
                  {scanning ? "Reading badge…" : "Scan badge"}
                </Button>
                <Button size="xl" variant="secondary" onClick={reset} icon={<ArrowLeft className="size-4" />}>
                  Back
                </Button>
              </div>
            </motion.div>
          ) : null}

          {/* -------------------------------------------------------------- */}
          {step === "id" || step === "search" ? (
            <motion.div
              key="lookup"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <h1 className="text-center text-[30px] font-extrabold tracking-[-0.03em] text-ink sm:text-[38px]">
                {step === "id" ? "Enter your Player ID" : "Search for your name"}
              </h1>

              <div className="mx-auto mt-8 max-w-xl">
                <Input
                  autoFocus
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  placeholder={step === "id" ? "PK-042" : "Start typing your name"}
                  aria-label={step === "id" ? "Player ID" : "Your name"}
                  className="h-16 text-center text-[22px] font-bold"
                />

                <div className="mt-4 space-y-2">
                  {matches.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => complete(p, step === "id" ? "player ID" : "name search")}
                      className="flex w-full items-center gap-4 rounded-feature border border-line bg-[rgb(var(--c-surface-strong))] px-5 py-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[var(--sh-card-hover)]"
                    >
                      <Avatar initials={p.initials} hue={p.avatarHue} size={52} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[18px] font-bold text-ink">
                          {p.fullName}
                        </span>
                        <span className="block text-[13.5px] capitalize text-muted">
                          {p.playerId} · {p.division.replace(/-/g, " ")}
                        </span>
                      </span>
                      {p.checkIn === "checked-in" ? (
                        <Badge tone="success" dot>
                          Already in
                        </Badge>
                      ) : (
                        <Check className="size-6 text-primary" />
                      )}
                    </button>
                  ))}
                  {entry.trim() && matches.length === 0 ? (
                    <p className="rounded-feature bg-[rgb(var(--c-surface))] px-5 py-6 text-center text-[15px] text-muted">
                      No player found. Check the spelling, or ask a volunteer for help.
                    </p>
                  ) : null}
                </div>

                <Button size="lg" variant="secondary" className="mt-6 w-full" onClick={reset} icon={<ArrowLeft className="size-4" />}>
                  Back
                </Button>
              </div>
            </motion.div>
          ) : null}

          {/* -------------------------------------------------------------- */}
          {step === "success" && player ? (
            <SuccessScreen
              key="success"
              player={player}
              board={pairingFor(player)?.board}
              opponent={opponentOf(player)}
              onDone={reset}
            />
          ) : null}
        </AnimatePresence>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function KioskOption({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="glass flex min-h-[168px] flex-col items-center justify-center gap-3 rounded-panel p-6 text-center transition-all duration-200 hover:-translate-y-1 hover:shadow-[var(--sh-float)]"
    >
      <span className="grid size-16 place-items-center rounded-feature bg-gradient-to-br from-primary-050 to-secondary-050 text-primary">
        {icon}
      </span>
      <span className="text-[18px] font-bold tracking-[-0.02em] text-ink">{title}</span>
      <span className="text-[13px] text-muted">{detail}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */

function SuccessScreen({
  player,
  board,
  opponent,
  onDone,
}: {
  player: Player;
  board?: number;
  opponent: Player | null;
  onDone: () => void;
}) {
  const store = useStore();
  const zone = board ? zoneFor(board) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35 }}
      className="text-center"
    >
      {/* Verification ring */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.05, type: "spring", stiffness: 300, damping: 24 }}
        className="mx-auto grid size-20 place-items-center rounded-full bg-gradient-to-br from-success to-cyan text-white shadow-[0_16px_40px_rgba(32,185,130,0.4)]"
      >
        <Check className="size-10" strokeWidth={2.6} />
      </motion.div>

      <h1 className="mt-5 text-[30px] font-extrabold tracking-[-0.03em] text-ink sm:text-[38px]">
        You&apos;re checked in!
      </h1>

      <div className="mx-auto mt-3 flex items-center justify-center gap-3">
        <Avatar initials={player.initials} hue={player.avatarHue} size={44} />
        <div className="text-left">
          <p className="text-[19px] font-bold text-ink">{player.fullName}</p>
          <p className="text-[13.5px] capitalize text-muted">
            {player.division.replace(/-/g, " ")} · {player.playerId}
          </p>
        </div>
      </div>

      {/* The board number dominates the screen */}
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.16, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="glass-raised relative mx-auto mt-8 max-w-xl overflow-hidden rounded-panel px-6 py-8"
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(104deg, rgba(32,185,130,0.14), rgba(85,201,232,0.12) 60%, rgba(115,87,246,0.10))",
          }}
          aria-hidden
        />
        <div className="relative">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-muted">
            Your board
          </p>
          <p className="num mt-1 text-[86px] font-extrabold leading-none tracking-[-0.05em] text-ink sm:text-[112px]">
            {board ?? "—"}
          </p>

          {zone ? (
            <p className="mt-3 flex items-center justify-center gap-2 text-[17px] font-semibold text-ink">
              <MapPin className="size-5 text-primary" />
              {zone.hall} · Row {zone.row}
            </p>
          ) : null}

          <p className="mt-2 text-[14.5px] text-muted">
            Round {store.tournament.currentRound} · starts 11:15
          </p>

          {opponent ? (
            <div className="mx-auto mt-5 inline-flex items-center gap-2.5 rounded-feature bg-[rgb(var(--c-surface-strong))] px-4 py-2.5">
              <span className="text-[12.5px] font-semibold text-muted">Opponent</span>
              <Avatar initials={opponent.initials} hue={opponent.avatarHue} size={28} />
              <span className="text-[14.5px] font-bold text-ink">{opponent.fullName}</span>
            </div>
          ) : (
            <p className="mt-5 text-[14px] text-muted">You have a bye this round.</p>
          )}
        </div>
      </motion.div>

      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button
          size="lg"
          variant="primary"
          icon={<MapPin className="size-4" />}
          onClick={() =>
            store.toast({
              title: "Directions",
              description: zone
                ? `${zone.hall}, row ${zone.row}. Follow the coloured floor markers from the foyer.`
                : "Ask a volunteer at the Help Desk.",
              tone: "info",
            })
          }
        >
          Show Me the Way
        </Button>
        <Button
          size="lg"
          variant="secondary"
          icon={<Printer className="size-4" />}
          onClick={() =>
            store.toast({
              title: "Seat slip printing",
              description: `${player.fullName} · board ${board ?? "—"}.`,
              tone: "success",
            })
          }
        >
          Print Seat Slip
        </Button>
        <Button size="lg" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </motion.div>
  );
}
