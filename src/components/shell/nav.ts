import {
  BarChart3,
  CircleHelp,
  Gauge,
  IdCard,
  Radio,
  ShieldCheck,
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
 *
 * Trimmed to the screens that actually do something. Several pages offered
 * buttons that showed a confirmation and changed nothing — Promotions, Teams,
 * Broadcast, Reports, Finance, Copilot and Implementation Scope among them — and
 * a control that pretends to work is worse than one that is absent: the organizer
 * believes an action was taken. They are no longer reachable from navigation.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Command Centre", icon: Gauge },
  /*
   * Points at the database-backed list, not `/app/registrations`.
   *
   * That page reads browser storage, so it showed zero and told the organizer
   * "registrations submitted through the public site appear here for review" —
   * which they do not. Sending someone to an empty page that promises the thing
   * they are looking for is worse than not linking it at all.
   */
  { href: "/organizer/registrations", label: "Registrations", icon: IdCard },
  { href: "/app/players", label: "Players", icon: Users },
  { href: "/app/payments", label: "Payments", icon: Wallet },
  { href: "/app/live-event", label: "Live Event", icon: Radio, badgeKey: "live" },
  { href: "/app/certificates", label: "Awards", icon: Trophy },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
];

/** Secondary navigation, pinned above the profile footer. */
export const EXTRA_NAV: NavItem[] = [
  { href: "/app/settings", label: "Settings", icon: ShieldCheck },
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

  /*
   * Reachable from the event workspace rather than the sidebar. Every entry must
   * resolve: this list feeds the global search and the command palette, so a stale
   * href here is a search result that leads to a 404. Teams, Broadcast and
   * Promotions were left behind when those pages were removed.
   */
  { href: "/app/events/new", label: "Create tournament" },
  { href: "/app/payments", label: "Payments" },
  { href: "/app/tournaments", label: "Tournaments" },
  { href: "/app/check-in", label: "Check-in" },
  { href: "/app/categories", label: "Divisions" },
  { href: "/app/seeding", label: "Seeding" },
  { href: "/app/venue", label: "Seating & Venue" },
  { href: "/app/pairings", label: "Pairing Lab" },
  { href: "/app/score-entry", label: "Score Entry" },
  { href: "/app/standings", label: "Live Standings" },
  { href: "/app/arbiter", label: "Arbiter Desk" },
  { href: "/app/certificates", label: "Certificates" },
];
