import {
  BarChart3,
  Bell,
  CalendarClock,
  CircleHelp,
  ClipboardList,
  FileText,
  IdCard,
  Gauge,
  Gavel,
  Grid3x3,
  Layers,
  Layers3,
  ListOrdered,
  MapPinned,
  Radio,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown as a small count when non-zero. */
  badgeKey?: "pending" | "disputes" | "live" | "registrations";
}

/** Primary operational navigation, ordered by tournament workflow. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Command Centre", icon: Gauge },
  { href: "/app/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/app/registrations", label: "Registration", icon: IdCard, badgeKey: "registrations" },
  { href: "/app/check-in", label: "Check-in", icon: UserCheck, badgeKey: "live" },
  { href: "/app/players", label: "Players", icon: Users },
  { href: "/app/categories", label: "Divisions", icon: Layers3 },
  { href: "/app/seeding", label: "Seeding", icon: Layers },
  { href: "/app/venue", label: "Seating & Venue", icon: MapPinned },
  { href: "/app/pairings", label: "Pairing Lab", icon: Grid3x3 },
  { href: "/app/score-entry", label: "Score Entry", icon: ClipboardList, badgeKey: "pending" },
  { href: "/app/standings", label: "Live Standings", icon: ListOrdered },
  { href: "/app/arbiter", label: "Arbiter Desk", icon: Gavel, badgeKey: "disputes" },
  { href: "/app/broadcast", label: "Broadcast", icon: Radio },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/app/reports", label: "Reports", icon: FileText },
  { href: "/app/communication", label: "Communication", icon: Bell },
];

/** Secondary navigation, pinned above the profile footer. */
export const EXTRA_NAV: NavItem[] = [
  { href: "/app/copilot", label: "Tournament Copilot", icon: Sparkles },
  { href: "/app/settings", label: "Staff & Roles", icon: ShieldCheck },
  { href: "/app/scope", label: "Implementation Scope", icon: CalendarClock },
  { href: "/app/settings#help", label: "Help & Support", icon: CircleHelp },
];
