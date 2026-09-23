import {
  MailCheck,
  Send,
  Search,
  BarChart3,
  CalendarDays,
  CircleHelp,
  ClipboardList,
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
   * Creating an event, and putting it on the public site, was reachable only through
   * search — so the screen that makes a new tournament possible was effectively hidden
   * behind knowing it existed.
   */
  { href: "/app/events", label: "Tournaments", icon: CalendarDays },
  /*
   * The database-backed list, now inside the dashboard shell rather than on its own
   * page. One set of navigation, so no screen is a dead end.
   */
  /*
   * The two screens an event is actually run from, above the reference ones.
   *
   * Desk is arrivals; Results & Pairings is the draw, the clock and the scores. Everything
   * below them is admin, and on event day nobody should need any of it.
   */
  { href: "/app/desk", label: "Desk", icon: Search },
  { href: "/app/results", label: "Results & Pairings", icon: ClipboardList },
  { href: "/app/registrations", label: "Registrations", icon: IdCard },
  { href: "/app/players", label: "Players", icon: Users },
  { href: "/app/payments", label: "Payments", icon: Wallet },
  { href: "/app/send-codes", label: "Send codes", icon: Send },
  /* Before the day: everybody checks their own details, so the roster is right by Sunday. */
  { href: "/app/confirmations", label: "Confirmations", icon: MailCheck },
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
   * Reachable from the event workspace rather than the sidebar.
   *
   * Every entry must resolve and must be backed by the database. This list feeds
   * the global search and the command palette, so a stale href is a search result
   * that leads to a 404, and a screen reading browser storage is a search result
   * that leads to an empty page.
   */
  { href: "/app/events", label: "Tournaments" },
  { href: "/app/events/new", label: "Create tournament" },
  { href: "/app/results", label: "Results & Pairings" },
  { href: "/app/score-entry", label: "Score Entry" },
  { href: "/app/standings", label: "Live Standings" },
  { href: "/app/certificates", label: "Certificates" },
];

/* -------------------------------------------------------------------------- */
/* What each role sees                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The navigation a role is shown.
 *
 * The database already refuses a desk account every action outside the desk, so this is not
 * where the protection lives. What it decides is what the person sees when they sign in: a
 * volunteer on the door does not need twelve screens they cannot use, and a results table
 * does not need Payments. A director sees everything.
 *
 * `null` for the capability means it is not known yet, and the answer is the full list — a
 * screen that flickers from twelve items to one as the role loads is worse than one that
 * shows twelve for half a second.
 */
export function navFor(
  capability: "desk" | "results" | "director" | "viewer" | "none" | null,
): { primary: NavItem[]; extra: NavItem[] } {
  switch (capability) {
    case "desk":
      return { primary: NAV_ITEMS.filter((n) => n.href === "/app/desk"), extra: [] };
    case "results":
      return { primary: NAV_ITEMS.filter((n) => n.href === "/app/results"), extra: [] };
    case "viewer":
      return { primary: [], extra: [] };
    default:
      return { primary: NAV_ITEMS, extra: EXTRA_NAV };
  }
}

/** Where a role lands after signing in. The one screen that is theirs. */
export function homeFor(
  capability: "desk" | "results" | "director" | "viewer" | "none" | null,
): string {
  switch (capability) {
    case "desk":
      return "/app/desk";
    case "results":
      return "/app/results";
    default:
      return "/app";
  }
}
