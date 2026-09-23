"use client";

import * as React from "react";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";

import { Button, Card, EmptyState } from "@/components/ui";
import { useStaffRole } from "@/lib/supabase/useStaffRole";

/**
 * Shows a screen only to the accounts whose job it is.
 *
 * Not the security boundary, and this file should not be read as one. Every action behind
 * these screens is checked by the database against the caller's own role, so a desk account
 * that reached the results screen would find each button refused. That is safe and it is a
 * miserable way to find out.
 *
 * So: say it once, at the top, in a sentence, with a way back to the screen that *is* theirs.
 */
export function RoleGate({
  need,
  children,
}: {
  need: "desk" | "results" | "director";
  children: React.ReactNode;
}) {
  const staff = useStaffRole();

  if (!staff.loaded) {
    return (
      <Card className="mt-4">
        <EmptyState title="Checking your access" description="Asking the database what this account may do." />
      </Card>
    );
  }

  const allowed =
    need === "desk" ? staff.canDesk : need === "results" ? staff.canResults : staff.isDirector;

  if (allowed) return <>{children}</>;

  /* Where this account should be instead, so the message ends somewhere useful. */
  const home = staff.canDesk ? "/app/desk" : staff.canResults ? "/app/results" : "/app";
  const homeLabel = staff.canDesk ? "Go to the Desk" : staff.canResults ? "Go to Results & Pairings" : "Go to the dashboard";

  return (
    <Card className="mt-4">
      <EmptyState
        icon={<LockKeyhole className="size-6" />}
        title={TITLE[need]}
        description={
          staff.capability === "none"
            ? "This account is not on the staff list for this organisation."
            : `This account is signed in for ${LABEL[staff.capability]}, and this screen belongs to ${LABEL[need]}.`
        }
        action={
          <Link href={home}>
            <Button>{homeLabel}</Button>
          </Link>
        }
      />
    </Card>
  );
}

const TITLE: Record<"desk" | "results" | "director", string> = {
  desk: "This is the check-in desk",
  results: "This is the results table",
  director: "This screen is for the tournament director",
};

const LABEL: Record<string, string> = {
  desk: "the check-in desk",
  results: "the results table",
  director: "the tournament director",
  viewer: "a read-only display",
  none: "no role",
};
