"use client";

import * as React from "react";
import { Copy, Palette, RefreshCw } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SearchInput,
  Stat,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { ProofOpenButton } from "@/components/organizer/RegistrationDetails";
import { MAX_TEAMS } from "@/lib/domain/pictionary";
import {
  PICTIONARY_SLUG,
  listTeams,
  removeTeam,
  setTeamPaid,
  type StoredTeam,
} from "@/lib/supabase/pictionary";
import { formatTime } from "@/lib/utils";

/**
 * The Speed Pictionary team list.
 *
 * A page of its own, deliberately. A team has no Scrabble category, rating or player number, and
 * must not appear in the roster, the standings or the check-in report. Teams are stored in a
 * collection of their own and this is the only screen that reads it — see
 * `0094_pictionary_teams.sql`.
 */
export default function PictionaryAdminPage() {
  const [teams, setTeams] = React.useState<StoredTeam[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  /* Bumped to ask for the list again: the Refresh button, and after any change. */
  const [reloads, setReloads] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    (async () => {
      const rows = await listTeams();
      if (!live) return;
      setTeams(rows);
    })();
    return () => {
      live = false;
    };
  }, [reloads]);

  const rows = React.useMemo(() => teams ?? [], [teams]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((t) =>
      [t.teamName, t.captainPhone, ...t.players]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  const players = rows.reduce((n, t) => n + t.players.length, 0);
  const owed = rows.reduce((n, t) => n + t.amountDue, 0);
  const collected = rows
    .filter((t) => t.paymentStatus === "verified")
    .reduce((n, t) => n + t.amountDue, 0);

  const formLink =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/${PICTIONARY_SLUG}`;

  const act = async (
    id: string,
    run: () => Promise<{ ok: true } | { ok: false; message: string }>,
  ) => {
    setBusy(id);
    setProblem(null);
    const result = await run();
    setBusy(null);
    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    setReloads((n) => n + 1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Speed Pictionary"
        subtitle="Team entries. Separate from the Scrabble tournament — nobody here is in a draw."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(formLink);
              }}
            >
              <Copy className="size-4" />
              Copy form link
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Teams" value={`${rows.length} of ${MAX_TEAMS}`} />
        <Stat label="Players" value={String(players)} />
        <Stat
          label="Collected"
          value={`PKR ${collected.toLocaleString("en-PK")}`}
          tone="success"
        />
        <Stat
          label="Still to collect"
          value={`PKR ${(owed - collected).toLocaleString("en-PK")}`}
        />
      </div>

      {problem ? (
        <p className="rounded-control bg-critical-050 px-3.5 py-3 text-[13px] text-critical">
          {problem}
        </p>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <span className="text-[14px] font-semibold text-ink">
            {filtered.length} of {rows.length}
          </span>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search a team, a player or a number"
          />
        </div>

        {teams === null ? (
          <EmptyState title="Loading teams" description="One moment." />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Palette className="size-5" />}
            title={rows.length === 0 ? "No teams yet" : "Nothing matches that"}
            description={
              rows.length === 0
                ? "Share the form link and teams will appear here."
                : "Try a different name or number."
            }
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr>
                  <Th>Team</Th>
                  <Th>Players</Th>
                  <Th>Captain&rsquo;s number</Th>
                  <Th>Payment</Th>
                  <Th>Registered</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const paid = t.paymentStatus === "verified";
                  return (
                    <tr key={t.id} className="border-t border-line align-top">
                      <Td>
                        <span className="font-semibold text-ink">
                          {t.teamName}
                        </span>
                      </Td>
                      <Td>
                        <span className="block text-ink">
                          {t.players.join(", ")}
                        </span>
                        <span className="num mt-0.5 block text-[12px] text-muted">
                          {t.players.length} player
                          {t.players.length === 1 ? "" : "s"}
                        </span>
                      </Td>
                      <Td>
                        <span className="num text-ink">
                          {t.captainPhone || "—"}
                        </span>
                      </Td>
                      <Td>
                        <div className="flex flex-col items-start gap-1.5">
                          {/*
                            "Paid" from an uploaded receipt means the database marked it so
                            when the file arrived; nobody has checked it against the account.
                            The receipt button is how somebody still can.
                          */}
                          <Badge
                            tone={
                              paid
                                ? "success"
                                : t.paymentStatus === "receipt-uploaded"
                                  ? "info"
                                  : "warning"
                            }
                          >
                            {paid
                              ? t.autoVerified
                                ? "Paid (receipt)"
                                : "Paid"
                              : t.paymentStatus === "receipt-uploaded"
                                ? "Receipt uploaded"
                                : "Cash at the desk"}
                          </Badge>
                          <span className="num text-[12.5px] text-muted">
                            {t.currency} {t.amountDue.toLocaleString("en-PK")}
                          </span>
                          {t.proof ? (
                            <ProofOpenButton
                              path={t.proof.path}
                              fileName={t.proof.fileName}
                              contentType={t.proof.contentType}
                              onProblem={setProblem}
                            />
                          ) : null}
                        </div>
                      </Td>
                      <Td>
                        <span className="text-[12.5px] text-muted">
                          {t.createdAt ? formatTime(t.createdAt) : "—"}
                        </span>
                      </Td>
                      <Td>
                        <div className="flex flex-col items-start gap-1.5">
                          <Button
                            variant="secondary"
                            disabled={busy === t.id}
                            onClick={() =>
                              void act(t.id, () => setTeamPaid(t.id, !paid))
                            }
                          >
                            {paid ? "Mark unpaid" : "Mark paid"}
                          </Button>
                          <button
                            type="button"
                            disabled={busy === t.id}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Remove ${t.teamName}? Their place is given back and the team disappears from this list.`,
                                )
                              ) {
                                void act(t.id, () => removeTeam(t.id));
                              }
                            }}
                            className="text-[12.5px] font-semibold text-critical underline-offset-4 hover:underline disabled:opacity-50"
                          >
                            Remove team
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
