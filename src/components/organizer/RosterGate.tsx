"use client";

import * as React from "react";
import Link from "next/link";
import { LockKeyhole, UserX } from "lucide-react";

import { Button, Card, EmptyState } from "@/components/ui";
import type { RosterAccess } from "@/lib/supabase/useRoster";

/**
 * Explains an empty roster.
 *
 * Every organizer screen that reads the database can be empty for three unrelated
 * reasons, and they need different actions from the person looking at the screen.
 * Showing the same blank table for all three is how an organizer concludes on the
 * morning of the event that the registrations have been lost.
 *
 * Returns null when there is nothing to explain, so a caller can render it above
 * the real content unconditionally.
 */
export function RosterGate({
  access,
  loaded,
  children,
}: {
  access: RosterAccess;
  loaded: boolean;
  /** Rendered only once the roster is readable. */
  children: React.ReactNode;
}) {
  if (!loaded || access === "unknown") {
    return (
      <Card>
        <EmptyState title="Loading the roster" description="Reading registrations from the database." />
      </Card>
    );
  }

  if (access === "signed-out") {
    return (
      <Card>
        <EmptyState
          icon={<LockKeyhole className="size-6" />}
          title="Sign in to see the roster"
          description={
            "Registrations hold names and phone numbers, so the database will not " +
            "release them to a browser that has not signed in."
          }
          action={
            <Link href="/organizer">
              <Button>Go to organizer sign-in</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  if (access === "not-staff") {
    return (
      <Card>
        <EmptyState
          icon={<UserX className="size-6" />}
          title="This account has no staff access"
          description={
            "You are signed in, but the address is not on the staff allowlist, so " +
            "the database returns nothing. Add it to `staff_allowlist` in Supabase."
          }
        />
      </Card>
    );
  }

  return <>{children}</>;
}
