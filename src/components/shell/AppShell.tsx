"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  Cloud,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  PanelLeft,
  RotateCcw,
  Search,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { useGuidedDemo } from "@/lib/store/guidedDemo";
import { ROLE_LABEL } from "@/lib/store/permissions";
import { useTheme } from "@/lib/design/theme";
import { cn, formatTime } from "@/lib/utils";
import { EventSwitcher } from "./EventSwitcher";
import { ALL_ROUTES, EXTRA_NAV, NAV_ITEMS } from "./nav";
import { CommandPalette } from "./CommandPalette";
import { Toaster } from "./Toaster";
import { GuidedDemoOverlay, GuidedDemoSummary } from "./GuidedDemoOverlay";

type BadgeKey = "pending" | "disputes" | "live" | "registrations";

/** Sidebar navigation. Module-scope so it never remounts between renders. */
function NavList({
  pathname,
  counts,
  collapsed,
}: {
  pathname: string;
  counts: Record<BadgeKey, number>;
  collapsed: boolean;
}) {
  const renderItem = (item: (typeof NAV_ITEMS)[number]) => {
    const base = item.href.split("#")[0];
    const active =
      base === "/app" ? pathname === "/app" : pathname.startsWith(base);
    const count = item.badgeKey ? counts[item.badgeKey] : 0;

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        title={collapsed ? item.label : undefined}
        className={cn(
          "group relative flex items-center gap-3 rounded-control px-3 py-2.5 text-[13.5px] font-semibold transition-all duration-150",
          collapsed && "justify-center px-2",
          active
            ? "text-[var(--nav-active-ink)] shadow-[0_2px_10px_rgba(39,48,92,0.08)]"
            : "text-muted hover:bg-[rgb(var(--c-surface))] hover:text-ink",
        )}
        style={active ? { background: "var(--nav-active-bg)" } : undefined}
      >
        {/* Active edge light */}
        {active ? (
          <span
            className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-primary to-secondary"
            aria-hidden
          />
        ) : null}

        <item.icon
          className={cn(
            "size-[18px] shrink-0",
            active ? "text-primary" : "text-faint group-hover:text-muted",
          )}
          strokeWidth={active ? 2.1 : 1.8}
        />

        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {count > 0 ? (
              <span className="num shrink-0 rounded-full bg-critical-050 px-1.5 py-0.5 text-[11px] font-bold text-[#c33450]">
                {count}
              </span>
            ) : null}
          </>
        ) : count > 0 ? (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-critical" />
        ) : null}
      </Link>
    );
  };

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV_ITEMS.map(renderItem)}
      <div className="my-3 h-px bg-line" />
      {EXTRA_NAV.map(renderItem)}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  const [mobileNav, setMobileNav] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [userOpen, setUserOpen] = React.useState(false);

  const hydrated = useStore((s) => s.hydrated);
  const signedIn = useStore((s) => s.signedIn);
  const currentUser = useStore((s) => s.currentUser);
  const role = useStore((s) => s.role);
  const organization = useStore((s) => s.organization);
  const tournament = useStore((s) => s.tournament);
  const tournaments = useStore((s) => s.tournaments);
  const players = useStore((s) => s.players);
  const pairings = useStore((s) => s.pairings);
  const disputes = useStore((s) => s.disputes);
  const activity = useStore((s) => s.activity);
  const signOut = useStore((s) => s.signOut);
  const resetDemo = useStore((s) => s.resetDemo);
  const startDemo = useGuidedDemo((s) => s.start);
  const demoActive = useGuidedDemo((s) => s.active);

  // A refresh keeps tournament data but not the session; restore a sensible one.
  React.useEffect(() => {
    if (hydrated && !signedIn) useStore.getState().signIn(role);
  }, [hydrated, signedIn, role]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the mobile drawer whenever the route changes.
  const [lastPath, setLastPath] = React.useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (mobileNav) setMobileNav(false);
  }

  const counts: Record<BadgeKey, number> = {
    pending: pairings.filter(
      (p) => p.round === tournament.currentRound && p.status === "awaiting-verification",
    ).length,
    disputes: disputes.filter((d) => d.status !== "closed").length,
    live: players.filter((p) => p.checkIn !== "checked-in").length,
    registrations: 0,
  };

  const logOut = () => {
    signOut();
    // The homepage is now the public events listing, so signing out goes to the
    // sign-in screen rather than dropping an organizer on a visitor page.
    router.push("/signin");
  };

  /**
   * Breadcrumb for the current page. Matched longest-href first so a nested
   * route such as /app/events/new reports itself rather than its parent.
   */
  const crumb =
    [...ALL_ROUTES]
      .sort((a, b) => b.href.length - a.href.length)
      .find((i) =>
        i.href === "/app" ? pathname === "/app" : pathname.startsWith(i.href),
      )?.label ?? "Command Centre";

  return (
    <div className="flex min-h-dvh">
      {/* ---------------------------------------------------------------- */}
      {/* Desktop sidebar                                                   */}
      {/* ---------------------------------------------------------------- */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line",
          "bg-[rgb(var(--c-surface))] backdrop-blur-xl transition-[width] duration-240 lg:flex",
        )}
        style={{ width: collapsed ? 82 : 260 }}
      >
        <div
          className={cn(
            "flex items-center gap-2.5 px-4 py-4",
            collapsed && "justify-center px-2",
          )}
        >
          <Link href="/app" className="flex min-w-0 items-center gap-2.5" title={organization.name}>
            <span className="grid size-10 shrink-0 place-items-center rounded-control bg-gradient-to-br from-primary to-secondary text-white shadow-[0_8px_22px_rgba(115,87,246,0.32)]">
              <LayoutGrid className="size-5" />
            </span>
            {!collapsed ? (
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-extrabold tracking-[-0.02em] text-ink">
                  Tournament OS
                </span>
                <span className="block truncate text-[11px] text-muted">{organization.name}</span>
              </span>
            ) : null}
          </Link>
        </div>

        <div className="pb-3">
          <EventSwitcher collapsed={collapsed} />
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 scroll-slim">
          <NavList pathname={pathname} counts={counts} collapsed={collapsed} />
        </div>

        <SidebarFooter
          collapsed={collapsed}
          userName={currentUser?.name ?? "Demo user"}
          initials={currentUser?.initials ?? "TD"}
          roleLabel={ROLE_LABEL[role]}
          onReset={resetDemo}
          onSignOut={logOut}
          onCollapse={() => setCollapsed((v) => !v)}
        />
      </aside>

      {/* ---------------------------------------------------------------- */}
      {/* Mobile drawer                                                     */}
      {/* ---------------------------------------------------------------- */}
      {mobileNav ? (
        <div className="fixed inset-0 z-[65] lg:hidden">
          <div
            className="absolute inset-0 bg-[rgb(18_23_42/0.34)] backdrop-blur-[3px]"
            onClick={() => setMobileNav(false)}
          />
          <div className="relative flex h-full w-[88%] max-w-[300px] flex-col border-r border-line bg-[rgb(var(--c-surface-strong))] backdrop-blur-2xl">
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-10 place-items-center rounded-control bg-gradient-to-br from-primary to-secondary text-white">
                  <LayoutGrid className="size-5" />
                </span>
                <p className="text-[14.5px] font-extrabold text-ink">Bluffy Alphabattle</p>
              </div>
              <button
                onClick={() => setMobileNav(false)}
                aria-label="Close navigation"
                className="rounded-full p-2 text-muted hover:bg-[rgb(var(--c-line))]"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 scroll-slim">
              <NavList pathname={pathname} counts={counts} collapsed={false} />
            </div>
            <SidebarFooter
              collapsed={false}
              userName={currentUser?.name ?? "Demo user"}
              initials={currentUser?.initials ?? "TD"}
              roleLabel={ROLE_LABEL[role]}
              onReset={resetDemo}
              onSignOut={logOut}
            />
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Main column                                                       */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-[rgb(var(--c-surface))] backdrop-blur-xl">
          <div className="flex h-[72px] items-center gap-2 px-4 sm:px-6">
            <button
              onClick={() => setMobileNav(true)}
              aria-label="Open navigation"
              className="rounded-control p-2 text-muted hover:bg-[rgb(var(--c-surface-soft))] hover:text-ink lg:hidden"
            >
              <Menu className="size-5" />
            </button>

            {/* Breadcrumb + tournament selector */}
            <div className="hidden min-w-0 flex-col sm:flex">
              <p className="truncate text-[11.5px] font-semibold uppercase tracking-[0.05em] text-faint">
                {crumb}
              </p>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="size-1.5 shrink-0 rounded-full bg-success pulse-dot" />
                <select
                  aria-label="Current tournament"
                  value={tournament.id}
                  onChange={() => undefined}
                  className="max-w-[260px] truncate bg-transparent text-[13.5px] font-bold text-ink outline-none"
                >
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name.replace(" — Demo", "")}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => setPaletteOpen(true)}
              className="ml-auto flex items-center gap-2 rounded-control border border-line bg-[rgb(var(--c-surface-soft))] px-3 py-2.5 text-[13px] text-muted transition-colors hover:text-ink lg:ml-6 lg:min-w-[300px]"
            >
              <Search className="size-4 shrink-0" />
              <span className="hidden flex-1 text-left lg:block">
                Search players, boards, rounds or cases
              </span>
              <kbd className="hidden shrink-0 rounded-md border border-line bg-[rgb(var(--c-surface-strong))] px-1.5 text-[11px] lg:block">
                ⌘K
              </kbd>
            </button>

            <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
              <Badge tone="success" dot pulse className="hidden xl:inline-flex">
                Round {tournament.currentRound} live
              </Badge>

              <Button
                size="sm"
                variant={demoActive ? "primary" : "secondary"}
                onClick={() => startDemo("tournament")}
                icon={<Sparkles className="size-3.5" />}
                className="hidden sm:inline-flex"
              >
                Guided Demo
              </Button>

              <button
                onClick={toggle}
                aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
                className="grid size-10 place-items-center rounded-control text-muted transition-colors hover:bg-[rgb(var(--c-surface-soft))] hover:text-ink"
              >
                {theme === "light" ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
              </button>

              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => {
                    setNotifOpen((v) => !v);
                    setUserOpen(false);
                  }}
                  aria-label="Notifications"
                  className="relative grid size-10 place-items-center rounded-control text-muted transition-colors hover:bg-[rgb(var(--c-surface-soft))] hover:text-ink"
                >
                  <Bell className="size-[18px]" />
                  {counts.pending + counts.disputes > 0 ? (
                    <span className="absolute right-2 top-2 size-2 rounded-full bg-critical ring-2 ring-[rgb(var(--c-canvas))]" />
                  ) : null}
                </button>
                {notifOpen ? (
                  <DropdownPanel onClose={() => setNotifOpen(false)} label="Notification centre">
                    <p className="px-3 pb-2 pt-1 text-[11.5px] font-bold uppercase tracking-[0.05em] text-muted">
                      Recent activity
                    </p>
                    <ul className="max-h-80 overflow-y-auto scroll-slim">
                      {activity.slice(0, 8).map((a) => (
                        <li
                          key={a.id}
                          className="flex items-start gap-2.5 px-3 py-2 hover:bg-[rgb(var(--c-surface-soft))]"
                        >
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                          <span className="min-w-0">
                            <span className="block text-[13px] text-ink">{a.message}</span>
                            <span className="block text-[11.5px] text-muted">
                              {a.user} · {formatTime(a.at)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </DropdownPanel>
                ) : null}
              </div>

              {/* User */}
              <div className="relative">
                <button
                  onClick={() => {
                    setUserOpen((v) => !v);
                    setNotifOpen(false);
                  }}
                  className="flex items-center gap-2 rounded-control py-1 pl-1 pr-2 transition-colors hover:bg-[rgb(var(--c-surface-soft))]"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary-050 to-secondary-050 text-[12.5px] font-bold text-primary-600">
                    {currentUser?.initials ?? "TD"}
                  </span>
                  <ChevronDown className="hidden size-3.5 text-faint sm:block" />
                </button>
                {userOpen ? (
                  <DropdownPanel onClose={() => setUserOpen(false)} label="Account">
                    <div className="px-3 py-2.5">
                      <p className="text-[13.5px] font-bold text-ink">
                        {currentUser?.name ?? "Demo user"}
                      </p>
                      <p className="text-[12px] text-muted">{ROLE_LABEL[role]}</p>
                      <p className="mt-0.5 text-[11.5px] text-faint">{currentUser?.email}</p>
                    </div>
                    <div className="my-1 h-px bg-line" />
                    <button
                      onClick={() => {
                        resetDemo();
                        setUserOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-ink hover:bg-[rgb(var(--c-surface-soft))]"
                    >
                      <RotateCcw className="size-4 text-muted" />
                      Reset demo data
                    </button>
                    <button
                      onClick={logOut}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-critical hover:bg-critical-050"
                    >
                      <LogOut className="size-4" />
                      Log out
                    </button>
                  </DropdownPanel>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 pb-24 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
          <div className="mx-auto w-full" style={{ maxWidth: 1680 }}>
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toaster />
      <GuidedDemoOverlay />
      <GuidedDemoSummary />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function SidebarFooter({
  collapsed,
  userName,
  initials,
  roleLabel,
  onReset,
  onSignOut,
  onCollapse,
}: {
  collapsed: boolean;
  userName: string;
  initials: string;
  roleLabel: string;
  onReset: () => void;
  onSignOut: () => void;
  onCollapse?: () => void;
}) {
  return (
    <div className="border-t border-line p-3">
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-compact bg-[rgb(var(--c-surface-soft))] px-2.5 py-2.5",
          collapsed && "justify-center px-1",
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary-050 to-secondary-050 text-[12.5px] font-bold text-primary-600">
          {initials}
        </span>
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-ink">{userName}</p>
            <p className="truncate text-[11.5px] text-muted">{roleLabel}</p>
          </div>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="mt-2 flex items-center gap-1.5 px-1">
          <Cloud className="size-3.5 shrink-0 text-success" />
          <span className="text-[11.5px] text-muted">Synced · local demo storage</span>
        </div>
      ) : null}

      <div className={cn("mt-2.5 flex items-center gap-1", collapsed && "flex-col")}>
        {onCollapse ? (
          <button
            onClick={onCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex items-center justify-center rounded-[10px] p-2 text-muted transition-colors hover:bg-[rgb(var(--c-surface))] hover:text-ink"
          >
            {collapsed ? <PanelLeft className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        ) : null}
        {!collapsed ? (
          <button
            onClick={onReset}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2 py-2 text-[12px] font-semibold text-muted transition-colors hover:bg-[rgb(var(--c-surface))] hover:text-ink"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </button>
        ) : null}
        <button
          onClick={onSignOut}
          className="flex items-center justify-center rounded-[10px] p-2 text-muted transition-colors hover:bg-critical-050 hover:text-critical"
          aria-label="Log out"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Small popover used by the topbar menus. */
function DropdownPanel({
  children,
  onClose,
  label,
}: {
  children: React.ReactNode;
  onClose: () => void;
  label: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className="absolute right-0 top-[calc(100%+10px)] z-50 w-[290px] overflow-hidden rounded-card border border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface-strong))] py-1 shadow-[var(--sh-float)] backdrop-blur-2xl"
    >
      {children}
    </div>
  );
}
