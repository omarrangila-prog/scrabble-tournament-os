"use client";

import * as React from "react";
import { Copy, RefreshCw } from "lucide-react";

import { Button, PageHeader } from "@/components/ui";
import { MafiaTable } from "@/components/organizer/MafiaTable";
import {
  listMafiaEntries,
  type StoredMafiaEntry,
} from "@/lib/supabase/mafia";

/**
 * The Mafia Wars sign-ups, for staff.
 *
 * A page of its own, deliberately: these people are not Scrabble entrants and must not appear in
 * the roster, the standings or the check-in report. They are stored in a collection of their own
 * and read only through `mafia_registrations` — see `0096_mafia_wars_and_event_hosts.sql`. The
 * event's host sees the same list from `/host`, and nothing else.
 */
export default function MafiaAdminPage() {
  const [entries, setEntries] = React.useState<StoredMafiaEntry[] | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  /* Bumped to ask for the list again, which is what the Refresh button does. */
  const [reloads, setReloads] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    (async () => {
      const rows = await listMafiaEntries();
      if (!live) return;
      setEntries(rows);
    })();
    return () => {
      live = false;
    };
  }, [reloads]);

  const formLink =
    typeof window === "undefined" ? "" : `${window.location.origin}/mafia`;
  const hostLink =
    typeof window === "undefined" ? "" : `${window.location.origin}/host`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mafia Wars"
        subtitle="Sign-ups for the 22 Nov night. Separate from the Scrabble tournament — nobody here is in a draw."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => void navigator.clipboard?.writeText(formLink)}
            >
              <Copy className="size-4" />
              Copy form link
            </Button>
            <Button
              variant="secondary"
              onClick={() => void navigator.clipboard?.writeText(hostLink)}
            >
              <Copy className="size-4" />
              Copy host login link
            </Button>
            <Button
              variant="secondary"
              onClick={() => setReloads((n) => n + 1)}
            >
              <RefreshCw className="size-4" />
              Refresh
            </Button>
          </div>
        }
      />

      {problem ? (
        <p className="rounded-control bg-critical-050 px-3.5 py-3 text-[13px] text-critical">
          {problem}
        </p>
      ) : null}

      <MafiaTable entries={entries} onProblem={setProblem} />
    </div>
  );
}
