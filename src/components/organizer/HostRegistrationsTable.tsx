"use client";

import * as React from "react";
import { ClipboardList } from "lucide-react";

import {
  Badge,
  Card,
  EmptyState,
  SearchInput,
  Stat,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { ProofOpenButton } from "@/components/organizer/RegistrationDetails";
import type { HostRegistration } from "@/lib/supabase/hostRegistrations";
import { formatTime } from "@/lib/utils";

/**
 * Who has registered for an event with ordinary registrations, as its host sees them.
 *
 * Read-only: counts, a search box and the list. The host can open a receipt, since the database
 * lets a host open the receipts of their own event, but nothing here changes a record.
 */
export function HostRegistrationsTable({
  entries,
  onProblem,
}: {
  entries: HostRegistration[] | null;
  onProblem: (message: string) => void;
}) {
  const [query, setQuery] = React.useState("");

  const rows = React.useMemo(() => entries ?? [], [entries]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.fullName, r.phone, r.activity, r.category]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  const isWorkshop = (r: HostRegistration) => /art|craft|workshop/i.test(r.activity);
  const workshop = rows.filter(isWorkshop).length;
  const collected = rows
    .filter((r) => r.paymentStatus === "verified")
    .reduce((n, r) => n + r.amountDue, 0);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Signed up" value={String(rows.length)} />
        <Stat label="Scrabble" value={String(rows.length - workshop)} />
        <Stat label="Arts & crafts" value={String(workshop)} />
        <Stat
          label="Collected"
          value={`PKR ${collected.toLocaleString("en-PK")}`}
          tone="success"
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <span className="text-[14px] font-semibold text-ink">
            {filtered.length} of {rows.length}
          </span>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search a name or a number"
          />
        </div>

        {entries === null ? (
          <EmptyState title="Loading sign-ups" description="One moment." />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title={rows.length === 0 ? "No sign-ups yet" : "Nothing matches that"}
            description={
              rows.length === 0
                ? "Sign-ups will appear here as people register."
                : "Try a different name or number."
            }
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Name</Th>
                  <Th>Joining</Th>
                  <Th>Contact</Th>
                  <Th>Payment</Th>
                  <Th>Signed up</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const paid = r.paymentStatus === "verified";
                  const receipt = r.paymentStatus === "receipt-uploaded";
                  /* The number in the whole list, so a search does not renumber anybody. */
                  const n = rows.indexOf(r) + 1;
                  return (
                    <tr key={r.id} className="border-t border-line align-top">
                      <Td>
                        <span className="num text-muted">{n}</span>
                      </Td>
                      <Td>
                        <span className="font-semibold text-ink">{r.fullName}</span>
                      </Td>
                      <Td>
                        <span className="block text-ink">{r.activity || "Scrabble"}</span>
                        {r.category ? (
                          <span className="mt-0.5 block text-[12px] capitalize text-muted">
                            {r.category}
                          </span>
                        ) : null}
                      </Td>
                      <Td>
                        <span className="num text-ink">{r.phone || "—"}</span>
                      </Td>
                      <Td>
                        <div className="flex flex-col items-start gap-1.5">
                          {/*
                            "Paid" from an uploaded receipt means the database marked it so
                            when the file arrived; nobody has checked it against the account.
                            The receipt button is how somebody still can.
                          */}
                          <Badge tone={paid ? "success" : receipt ? "info" : "warning"}>
                            {paid ? "Paid" : receipt ? "Receipt uploaded" : "Pays at the venue"}
                          </Badge>
                          <span className="num text-[12.5px] text-muted">
                            {r.amountDue === 0
                              ? "Price to be announced"
                              : `${r.currency} ${r.amountDue.toLocaleString("en-PK")}`}
                          </span>
                          {r.proof ? (
                            <ProofOpenButton
                              path={r.proof.path}
                              fileName={r.proof.fileName}
                              contentType={r.proof.contentType}
                              onProblem={onProblem}
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
    </>
  );
}
