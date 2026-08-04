"use client";

/**
 * System states.
 *
 * Every screen shares these so offline, syncing, error and permission
 * conditions read identically wherever they appear.
 */

import * as React from "react";
import {
  CheckCircle2,
  CloudOff,
  Lock,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui";
import { denialReason, ROLE_LABEL, type Capability } from "@/lib/store/permissions";
import { useStore } from "@/lib/store/useStore";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Offline / sync                                                              */
/* -------------------------------------------------------------------------- */

export type SyncState = "synced" | "syncing" | "offline";

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

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

