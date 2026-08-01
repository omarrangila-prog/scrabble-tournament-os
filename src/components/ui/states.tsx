"use client";

/**
 * System states.
 *
 * Every screen shares these so offline, syncing, error and permission
 * conditions read identically wherever they appear.
 */

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Lock,
  RefreshCw,
  WifiOff,
  XCircle,
} from "lucide-react";
import { Button, Card } from "@/components/ui";
import { denialReason, ROLE_LABEL, type Capability } from "@/lib/store/permissions";
import { useStore } from "@/lib/store/useStore";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Offline / sync                                                              */
/* -------------------------------------------------------------------------- */

export type SyncState = "synced" | "syncing" | "offline";

/** Thin banner pinned under the topbar when connectivity or sync needs saying. */
export function OfflineBanner({
  state,
  pendingCount = 0,
  onRetry,
}: {
  state: SyncState;
  pendingCount?: number;
  onRetry?: () => void;
}) {
  if (state === "synced") return null;

  const offline = state === "offline";
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-compact border px-4 py-3",
        offline
          ? "border-warning/30 bg-warning-050"
          : "border-info/30 bg-info-050",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-control",
          offline ? "bg-warning/15 text-[#a76d16]" : "bg-info/15 text-[#2668c9]",
        )}
      >
        {offline ? <WifiOff className="size-4.5" /> : <RefreshCw className="size-4.5 animate-spin" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-bold text-ink">
          {offline ? "You are working offline" : `Synchronizing ${pendingCount} tournament updates…`}
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {offline
            ? "New scores are saved safely on this device and will upload when the connection returns."
            : "Results entered on this device are being sent to the tournament record."}
        </p>
      </div>
      {offline && onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry now
        </Button>
      ) : null}
    </div>
  );
}

/** Compact sync pill for the sidebar or a card header. */
export function SyncIndicator({ state, className }: { state: SyncState; className?: string }) {
  const map = {
    synced: { icon: CheckCircle2, label: "Synced", tone: "text-success" },
    syncing: { icon: RefreshCw, label: "Syncing…", tone: "text-info" },
    offline: { icon: CloudOff, label: "Offline", tone: "text-warning" },
  } as const;
  const { icon: Icon, label, tone } = map[state];

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11.5px] font-semibold", tone, className)}>
      <Icon className={cn("size-3.5", state === "syncing" && "animate-spin")} />
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Error                                                                       */
/* -------------------------------------------------------------------------- */

export function ErrorState({
  title,
  description,
  detail,
  onRetry,
  retryLabel = "Try again",
}: {
  title: string;
  description?: string;
  /** Specific machine-readable cause, shown in a monospace strip. */
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <Card variant="flat" className="p-6">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-control bg-critical-050 text-critical">
          <XCircle className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-ink">{title}</p>
          {description ? (
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{description}</p>
          ) : null}
          {detail ? (
            <p className="mt-2.5 rounded-control bg-critical-050/60 px-3 py-2 font-mono text-[12px] text-[#c33450]">
              {detail}
            </p>
          ) : null}
          {onRetry ? (
            <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Permission                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Explains a restricted action rather than hiding it, so staff understand who
 * can perform the task instead of assuming the feature is missing.
 */
export function PermissionDenied({
  capability,
  compact,
}: {
  capability: Capability;
  compact?: boolean;
}) {
  const role = useStore((s) => s.role);

  if (compact) {
    return (
      <p className="flex items-start gap-2 rounded-control bg-warning-050 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#a76d16]">
        <Lock className="mt-px size-3.5 shrink-0" />
        {denialReason(role, capability)}
      </p>
    );
  }

  return (
    <Card variant="flat" className="p-6">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-control bg-warning-050 text-[#a76d16]">
          <Lock className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-ink">This action is restricted</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
            {denialReason(role, capability)}
          </p>
          <p className="mt-2 text-[12.5px] text-faint">
            You are signed in as {ROLE_LABEL[role]}. Ask a colleague with the required role, or
            switch role in Settings to explore this area.
          </p>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Confirmation                                                                */
/* -------------------------------------------------------------------------- */

/** Inline warning strip for destructive or irreversible actions. */
export function DestructiveNotice({
  title,
  body,
  className,
}: {
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-compact border border-critical/25 bg-critical-050/60 p-3.5", className)}>
      <p className="flex items-center gap-2 text-[13px] font-bold text-ink">
        <AlertTriangle className="size-4 text-critical" />
        {title}
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

/** Skeleton arrangement matching a standard dashboard grid. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-40 animate-pulse rounded-hero bg-[rgb(var(--c-line))]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-card bg-[rgb(var(--c-line))]" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-72 animate-pulse rounded-card bg-[rgb(var(--c-line))]" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton rows for a data table. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-1.5 p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-11 animate-pulse rounded-control bg-[rgb(var(--c-line))]"
          style={{ opacity: 1 - i * 0.07 }}
        />
      ))}
    </div>
  );
}
