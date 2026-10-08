"use client";

import * as React from "react";
import { Copy, GraduationCap, RefreshCw } from "lucide-react";

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
import { TRAINING_FEE } from "@/lib/domain/training";
import {
  listTrainingSignups,
  TRAINING_SLUG,
  type StoredTrainingSignup,
} from "@/lib/supabase/training";
import { cn, formatTime } from "@/lib/utils";

/**
 * The training signup list.
 *
 * A page of its own, deliberately. These people are not entrants: they have no division, they
 * are never paired, and they must not appear in the roster, the standings or the check-in
 * report. Putting them on the Registrations screen would have meant every count and every
 * export on it needed to remember to exclude them, and one forgotten filter would seat a
 * ten-year-old at a tournament board.
 *
 * So the isolation is structural rather than a flag: signups live in their own collection and
 * this is the only screen that reads it. See `0087_training_sessions_are_not_a_tournament.sql`.
 */
export default function TrainingPage() {
  const [signups, setSignups] = React.useState<StoredTrainingSignup[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);

  /* Bumped to ask for the list again, which is what the Refresh button does. */
  const [reloads, setReloads] = React.useState(0);

  /*
   * The fetch lives in the effect rather than in a callback the effect calls.
   *
   * Calling a setState-ing function synchronously from an effect body cascades renders, and
   * the lint rule here refuses it outright. `live` guards the late arrival: a reply landing
   * after this screen has gone must not set state on an unmounted component.
   */
  React.useEffect(() => {
    let live = true;

    (async () => {
      const rows = await listTrainingSignups();
      if (!live) return;
      setSignups(rows);
    })();

    return () => {
      live = false;
    };
  }, [reloads]);

  /*
   * Memoised so its identity is stable, because the filter below depends on it. A plain
   * `signups ?? []` is a new array every render, which would re-run the filter every render.
   */
  const rows = React.useMemo(() => signups ?? [], [signups]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.fullName, r.guardianName, r.phone, r.guardianPhone, r.preferredSlot]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  const children = rows.filter((r) => Number(r.age) < 18 && r.age !== "").length;
  const owed = rows
    .filter((r) => r.paymentStatus === "cash-at-venue")
    .reduce((sum, r) => sum + (r.amountDue || TRAINING_FEE), 0);

  const formLink =
    typeof window === "undefined" ? "" : `${window.location.origin}/${TRAINING_SLUG}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Training"
        subtitle="Coaching signups. Separate from the tournament — nobody here is in a draw."
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
            <Button variant="secondary" onClick={() => setReloads((n) => n + 1)}>
              <RefreshCw className="size-4" />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Signed up" value={String(rows.length)} />
        <Stat label="Under 18" value={String(children)} />
        <Stat label="Still to collect" value={`PKR ${owed.toLocaleString("en-PK")}`} />
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
            placeholder="Search a name, a parent or a number"
          />
        </div>

        {signups === null ? (
          <EmptyState title="Loading signups" description="One moment." />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<GraduationCap className="size-5" />}
            title={rows.length === 0 ? "No training signups yet" : "Nothing matches that"}
            description={
              rows.length === 0
                ? "Share the form link and signups will appear here."
                : "Try a different name or number."
            }
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr>
                  <Th>Trainee</Th>
                  <Th>Age</Th>
                  <Th>Parent / guardian</Th>
                  <Th>Contact</Th>
                  <Th>Sessions</Th>
                  <Th>Payment</Th>
                  <Th>Signed up</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const minor = r.age !== "" && Number(r.age) < 18;
                  return (
                    <tr key={r.id} className="border-t border-line align-top">
                      <Td>
                        <span className="block font-semibold text-ink">{r.fullName}</span>
                        {r.experience ? (
                          <span className="mt-0.5 block text-[12px] leading-snug text-muted">
                            {r.experience}
                          </span>
                        ) : null}
                      </Td>
                      <Td>
                        <span className={cn("num", minor ? "font-semibold text-primary" : "")}>
                          {r.age || "—"}
                        </span>
                      </Td>
                      <Td>
                        {r.guardianName ? (
                          <span className="text-ink">{r.guardianName}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Td>
                      <Td>
                        {/*
                          The number somebody answers: the parent's for a child, their own
                          otherwise. Both are shown where both exist, because the coach
                          sometimes needs to reach the trainee directly.
                        */}
                        <span className="num block text-ink">
                          {r.guardianPhone || r.phone || "—"}
                        </span>
                        {r.guardianPhone && r.phone ? (
                          <span className="num mt-0.5 block text-[12px] text-muted">
                            {r.phone} (trainee)
                          </span>
                        ) : null}
                      </Td>
                      <Td>{r.preferredSlot || <span className="text-muted">—</span>}</Td>
                      <Td>
                        <div className="flex flex-col items-start gap-1.5">
                          <Badge tone={r.paymentStatus === "receipt-uploaded" ? "info" : "warning"}>
                            {r.paymentStatus === "receipt-uploaded"
                              ? "Receipt uploaded"
                              : "Cash at session"}
                          </Badge>
                          <span className="num text-[12.5px] text-muted">
                            {r.currency} {(r.amountDue || TRAINING_FEE).toLocaleString("en-PK")}
                          </span>
                          {r.proof ? (
                            <ProofOpenButton
                              path={r.proof.path}
                              fileName={r.proof.fileName}
                              contentType={r.proof.contentType}
                              onProblem={setProblem}
                            />
                          ) : null}
                        </div>
                      </Td>
                      <Td>
                        <span className="text-[12.5px] text-muted">
                          {r.createdAt ? formatTime(r.createdAt) : "—"}
                        </span>
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
