import {
  BarChart3,
  Bell,
  CalendarClock,
  CalendarDays,
  CircleHelp,
  FileText,
  Gauge,
  IdCard,
  Radio,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown as a small count when non-zero. */
  badgeKey?: "pending" | "disputes" | "live" | "registrations";
}

/**
 * Primary navigation.
 *
 * Deliberately short. Anything belonging to a single tournament — check-in,
 * seeding, pairings, score entry, standings, certificates — lives inside that
 * event's workspace rather than at the top level, so the sidebar answers
 * "which area of the product" instead of "which of twenty-two screens".
 *
 * The workspace tabs are defined separately in `domain/eventPhase`.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Command Centre", icon: Gauge },
  { href: "/app/events", label: "Events", icon: CalendarDays },
  { href: "/app/live-event", label: "Live Event", icon: Radio, badgeKey: "live" },
  { href: "/app/registrations", label: "Registrations", icon: IdCard, badgeKey: "registrations" },
  { href: "/app/players", label: "Players", icon: Users },
  { href: "/app/finance", label: "Payments", icon: Wallet },
  { href: "/app/certificates", label: "Awards", icon: Trophy },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
];

/** Secondary navigation, pinned above the profile footer. */
export const EXTRA_NAV: NavItem[] = [
  { href: "/app/reports", label: "Reports", icon: FileText },
  { href: "/app/communication", label: "Communication", icon: Bell },
  { href: "/app/copilot", label: "Tournament Copilot", icon: Sparkles },
  { href: "/app/settings", label: "Settings", icon: ShieldCheck },
  { href: "/app/scope", label: "Implementation Scope", icon: CalendarClock },
  { href: "/app/settings#help", label: "Help & Support", icon: CircleHelp },
];

/**
 * Every organizer route, whether or not it appears in the sidebar.
 *
 * The sidebar is deliberately short, but the pages it no longer lists are
 * still reachable — from a workspace tab, a link, or the command palette. This
 * directory keeps them findable and gives the breadcrumb a correct label
 * instead of falling back to "Command Centre".
 */
export const ALL_ROUTES: { href: string; label: string }[] = [
  ...NAV_ITEMS.map((i) => ({ href: i.href, label: i.label })),
  ...EXTRA_NAV.map((i) => ({ href: i.href.split("#")[0], label: i.label })),

  // Reachable from the event workspace rather than the sidebar.
  { href: "/app/events/new", label: "Create tournament" },
  { href: "/app/tournaments", label: "Tournaments" },
  { href: "/app/check-in", label: "Check-in" },
  { href: "/app/categories", label: "Divisions" },
  { href: "/app/seeding", label: "Seeding" },
  { href: "/app/venue", label: "Seating & Venue" },
  { href: "/app/pairings", label: "Pairing Lab" },
  { href: "/app/score-entry", label: "Score Entry" },
  { href: "/app/standings", label: "Live Standings" },
  { href: "/app/teams", label: "Teams" },
  { href: "/app/arbiter", label: "Arbiter Desk" },
  { href: "/app/broadcast", label: "Broadcast" },
  { href: "/app/promotions", label: "Promotions" },
  { href: "/app/certificates", label: "Certificates" },
];
