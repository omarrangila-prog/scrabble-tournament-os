"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  CloudUpload,
  Gavel,
  Globe,
  LayoutGrid,
  Lock,
  Moon,
  Radio,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Sun,
  Trophy,
  Users,
} from "lucide-react";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { useGuidedDemo } from "@/lib/store/guidedDemo";
import { ROLE_SUMMARY } from "@/lib/store/permissions";
import { useTheme } from "@/lib/design/theme";
import { ChampionshipScene } from "@/components/art/ScrabbleArt";
import { Role } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS: { role: Role; label: string }[] = [
  { role: "director", label: "Tournament Director" },
  { role: "scorekeeper", label: "Scorekeeper" },
  { role: "checkin", label: "Check-in Officer" },
  { role: "arbiter", label: "Arbiter" },
  { role: "display", label: "Public Display Operator" },
];

const ROLE_EMAIL: Record<Role, string> = {
  director: "director@tournamentos.demo",
  scorekeeper: "scorekeeper@tournamentos.demo",
  checkin: "checkin@tournamentos.demo",
  arbiter: "arbiter@tournamentos.demo",
  display: "display@tournamentos.demo",
  volunteer: "volunteer@tournamentos.demo",
};

/** Floating capability cards that frame the hero artwork. */
const LEFT_CARDS = [
  { icon: Users, title: "Fair Pairing", detail: "Swiss pairings with conflict detection" },
  { icon: Trophy, title: "Live Rankings", detail: "Standings recalculated on verification" },
  { icon: ShieldCheck, title: "Verified Results", detail: "Two-sided player confirmation" },
  { icon: ScanLine, title: "QR Check-in", detail: "Seamless player registration" },
];

const RIGHT_CARDS = [
  { icon: LayoutGrid, title: "Tournament Director", detail: "Manage the event end to end" },
  { icon: Sparkles, title: "Tournament Copilot", detail: "Answers from live tournament data" },
  { icon: Radio, title: "Live Broadcast", detail: "Venue screens and public results" },
  { icon: Gavel, title: "Arbiter Support", detail: "Cases, evidence and rulings" },
];

/** Demo-safe capability claims — no fabricated player or country counts. */
const CAPABILITIES = [
  "Multi-Division Support",
  "Real-Time Standings",
  "Secure Result Verification",
  "Offline Tournament Control",
  "Public Live Broadcast",
];

export default function LandingPage() {
  const router = useRouter();
  const signIn = useStore((s) => s.signIn);
  const startDemo = useGuidedDemo((s) => s.start);
  const { theme, toggle } = useTheme();

  const [role, setRole] = React.useState<Role>("director");
  const [email, setEmail] = React.useState(ROLE_EMAIL.director);
  const [password, setPassword] = React.useState("demo1234");
  const [remember, setRemember] = React.useState(true);
  const [busy, setBusy] = React.useState<"signin" | "demo" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const changeRole = (next: Role) => {
    setRole(next);
    setEmail(ROLE_EMAIL[next]);
  };

  const enter = (mode: "signin" | "demo") => {
    if (!email.trim() || password.length < 4) {
      setError("Enter the demo email and password shown below.");
      return;
    }
    setError(null);
    setBusy(mode);
    signIn(role);
    if (mode === "demo") startDemo();
    window.setTimeout(() => router.push(mode === "demo" ? "/app" : "/app/tournaments"), 380);
  };

  return (
    <div className="min-h-dvh">
      {/* ---------------------------------------------------------------- */}
      {/* Top navigation                                                    */}
      {/* ---------------------------------------------------------------- */}
      <header className="sticky top-0 z-40 border-b border-line bg-[rgb(var(--c-surface))] backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1680px] items-center gap-4 px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-control bg-gradient-to-br from-primary to-secondary text-white shadow-[0_8px_22px_rgba(115,87,246,0.34)]">
              <LayoutGrid className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-extrabold tracking-[-0.02em] text-ink">
                Bluffy Alphabattle
              </p>
              <p className="hidden text-[11.5px] text-muted sm:block">
                Official Tournament Platform
              </p>
            </div>
          </div>

          <nav className="ml-8 hidden items-center gap-1 lg:flex" aria-label="Product">
            {["Platform", "Features", "Tournament Experience", "Support"].map((item) => (
              <a
                key={item}
                href="#platform"
                className="rounded-[10px] px-3 py-2 text-[13.5px] font-semibold text-muted transition-colors hover:bg-[rgb(var(--c-surface-soft))] hover:text-ink"
              >
                {item}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Select
              aria-label="Language"
              defaultValue="en"
              className="hidden h-10 w-[104px] sm:block"
            >
              <option value="en">English</option>
              <option value="ur">اردو</option>
            </Select>

            <button
              onClick={toggle}
              aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              className="grid size-10 place-items-center rounded-control border border-line bg-[rgb(var(--c-surface))] text-muted transition-colors hover:text-ink"
            >
              {theme === "light" ? <Moon className="size-4.5" /> : <Sun className="size-4.5" />}
            </button>

            <Button variant="primary" size="sm" onClick={() => enter("demo")}>
              Request Demo
            </Button>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                              */}
      {/* ---------------------------------------------------------------- */}
      <main
        id="platform"
        className="mx-auto grid max-w-[1680px] grid-cols-1 gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-12 lg:py-16"
      >
        {/* LEFT — story and artwork */}
        <section className="min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <Badge tone="primary" dot pulse>
              Built for national championships
            </Badge>

            <h1 className="mt-4 text-[38px] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink sm:text-[52px] lg:text-[62px]">
              Run every round
              <br />
              with <span className="text-champion">confidence</span>.
            </h1>

            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted sm:text-[17px]">
              Registration, seating, pairings, scoring and live results—beautifully connected.
              From the first check-in to the final champion, every player, board and decision
              stays organized.
            </p>

          </motion.div>

          {/* Artwork with floating capability cards */}
          <div className="relative mt-10 lg:mt-14">
            <div className="grid grid-cols-1 items-center gap-6 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              {/* Left cards */}
              <div className="order-2 grid grid-cols-2 gap-2.5 xl:order-1 xl:grid-cols-1">
                {LEFT_CARDS.map((c, i) => (
                  <FeatureCard key={c.title} {...c} delay={i * 0.08} />
                ))}
              </div>

              {/* Scene */}
              <div className="order-1 flex justify-center xl:order-2">
                <ChampionshipScene className="w-full max-w-[420px]" />
              </div>

              {/* Right cards */}
              <div className="order-3 grid grid-cols-2 gap-2.5 xl:grid-cols-1">
                {RIGHT_CARDS.map((c, i) => (
                  <FeatureCard key={c.title} {...c} delay={0.32 + i * 0.08} />
                ))}
              </div>
            </div>

            {/* Live operational readouts */}
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MiniMetric label="Round completion" value="82%" tone="primary" progress={82} />
              <MiniMetric label="Active boards" value="61" tone="success" progress={95} />
              <MiniMetric label="Pairing health" value="98%" tone="info" progress={98} />
            </div>

            {/* Capability band — demo-safe claims, no fabricated statistics. */}
            <div className="glass mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-feature p-4 sm:grid-cols-3 lg:grid-cols-5">
              {CAPABILITIES.map((c) => (
                <div key={c} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0 text-success" />
                  <span className="text-[12.5px] font-semibold leading-tight text-ink">{c}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* RIGHT — login panel */}
        <section className="min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="glass-raised sticky top-[96px] rounded-panel p-6 sm:p-8"
          >
            <h2 className="text-center text-[26px] font-extrabold tracking-[-0.025em] text-ink">
              Welcome Back
            </h2>
            <p className="mt-1 text-center text-[14px] text-muted">
              Sign in to manage your Scrabble tournament.
            </p>

            <div className="mt-6 space-y-4">
              <Field label="Email address" required>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                />
              </Field>

              <Field label="Password" required error={error ?? undefined}>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  invalid={!!error}
                />
              </Field>

              <Field label="Role">
                <Select value={role} onChange={(e) => changeRole(e.target.value as Role)}>
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.role} value={o.role}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <p className="rounded-control bg-primary-050 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-primary-600">
                {ROLE_SUMMARY[role]}
              </p>

              <div className="flex items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="size-4 rounded-[5px] accent-[#7357F6]"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() =>
                    useStore.getState().toast({
                      title: "Password reset",
                      description:
                        "In production this emails a secure reset link. Demo accounts use demo1234.",
                      tone: "info",
                    })
                  }
                  className="text-[13px] font-semibold text-primary-600 hover:underline"
                >
                  Forgot password
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-2.5">
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                loading={busy === "signin"}
                onClick={() => enter("signin")}
              >
                Sign In
                <ArrowRight className="size-4" />
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                loading={busy === "demo"}
                onClick={() => enter("demo")}
                icon={<Sparkles className="size-4" />}
              >
                Enter Guided Demo
              </Button>
            </div>

            <div className="mt-6 rounded-compact border border-line bg-[rgb(var(--c-surface-soft))] p-4">
              <p className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.05em] text-muted">
                <Lock className="size-3.5" />
                Demo credentials
              </p>
              <dl className="mt-2 space-y-1 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Email</dt>
                  <dd className="font-semibold text-ink">director@tournamentos.demo</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Password</dt>
                  <dd className="font-semibold text-ink">demo1234</dd>
                </div>
              </dl>
            </div>

            <p className="mt-5 text-center text-[13px] text-muted">
              Don&apos;t have organizer access?{" "}
              <span className="font-semibold text-ink">Contact your Tournament Director</span>
            </p>

            {/* Security strip */}
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4">
              {[
                { icon: ShieldCheck, label: "Role-Based Access" },
                { icon: CloudUpload, label: "Secure Cloud Backup" },
                { icon: Lock, label: "Encrypted Data" },
              ].map((s) => (
                <div key={s.label} className="flex flex-col items-center gap-1.5 text-center">
                  <s.icon className="size-4 text-success" />
                  <span className="text-[10.5px] font-semibold leading-tight text-muted">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-4 text-center text-[12px] text-faint">
              <Link href="/live" className="underline underline-offset-2 hover:text-muted">
                View the public championship site
              </Link>
            </p>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-line px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-[1680px] flex-col items-center gap-2 text-center">
          <p className="text-[12.5px] text-muted">
            Bluffy Alphabattle · Championship management for federations, clubs and schools
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-[12px] text-faint">
            <span className="inline-flex items-center gap-1.5">
              <Globe className="size-3.5" />
              Public live results
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarCheck className="size-3.5" />
              Multi-day events
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5" />
              Full audit trail
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function FeatureCard({
  icon: Icon,
  title,
  detail,
  delay = 0,
}: {
  icon: React.ElementType;
  title: string;
  detail: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className="glass rounded-compact p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--sh-card-hover)]"
    >
      <span className="grid size-8 place-items-center rounded-[10px] bg-gradient-to-br from-primary-050 to-secondary-050 text-primary">
        <Icon className="size-4" />
      </span>
      <p className="mt-2 text-[13px] font-bold leading-tight text-ink">{title}</p>
      <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{detail}</p>
    </motion.div>
  );
}

function MiniMetric({
  label,
  value,
  tone,
  progress,
}: {
  label: string;
  value: string;
  tone: "primary" | "success" | "info";
  progress: number;
}) {
  return (
    <div className="glass rounded-compact p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[12.5px] font-semibold text-muted">{label}</p>
        <p className="num text-[19px] font-extrabold tracking-[-0.02em] text-ink">{value}</p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--c-line))]">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "primary" && "bg-gradient-to-r from-primary to-secondary",
            tone === "success" && "bg-gradient-to-r from-success to-cyan",
            tone === "info" && "bg-gradient-to-r from-secondary to-cyan",
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
