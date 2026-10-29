"use client";

import * as React from "react";
import { Drama } from "lucide-react";

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
import type { StoredMafiaEntry } from "@/lib/supabase/mafia";
import { formatTime } from "@/lib/utils";

/**
 * Who has signed up for Mafia Wars: the counts, a search box and the list.
 *
 * Shared by the organiser's screen and by the host's own page, so the two can never disagree
 * about what a row shows. Read-only on purpose. A sign-up is paid by uploading a receipt and
 * the database marks it so; nothing here changes a record, which is also what lets the host's
 * account be so narrow.
 *
 * What each row shows is exactly what the form collected: no email, no address, no category.
 * The receipt button opens the file through the same signed link the desk uses; the database
 * lets a host open receipts for their own event and no other.
 */
export function MafiaTable({
  entries,
  onProblem,
}: {
  entries: StoredMafiaEntry[] | null;
  onProblem: (message: string) => void;
}) {
  const [query, setQuery] = React.useState("");

  const rows = React.useMemo(() => entries ?? [], [entries]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.fullName, r.phone, String(r.age ?? "")]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  const paid = rows.filter((r) => r.paymentStatus === "verified");
  const collected = paid.reduce((n, r) => n + r.amountDue, 0);
  const noPhotos = rows.filter((r) => !r.mediaConsent).length;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Signed up" value={String(rows.length)} />
        <Stat label="Paid" value={`${paid.length} of ${rows.length}`} />
        <Stat
          label="Collected"
          value={`PKR ${collected.toLocaleString("en-PK")}`}
          tone="success"
        />
        <Stat label="No photos please" value={String(noPhotos)} />
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
            icon={<Drama className="size-5" />}
            title={
              rows.length === 0 ? "No sign-ups yet" : "Nothing matches that"
            }
            description={
              rows.length === 0
                ? "Sign-ups will appear here as people register."
                : "Try a different name or number."
            }
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Name</Th>
                  <Th>Age</Th>
                  <Th>Contact</Th>
                  <Th>Payment</Th>
                  <Th>Photos</Th>
                  <Th>Signed up</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isPaid = r.paymentStatus === "verified";
                  /* The number in the whole list, so a search does not renumber anybody. */
                  const n = rows.indexOf(r) + 1;
                  return (
                    <tr key={r.id} className="border-t border-line align-top">
                      <Td>
                        <span className="num text-muted">{n}</span>
                      </Td>
                      <Td>
                        <span className="font-semibold text-ink">
                          {r.fullName}
                        </span>
                      </Td>
                      <Td>
                        <span className="num">{r.age ?? "—"}</span>
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
                          <Badge tone={isPaid ? "success" : "info"}>
                            {isPaid
                              ? r.autoVerified
                                ? "Paid (receipt)"
                                : "Paid"
                              : "Receipt uploaded"}
                          </Badge>
                          <span className="num text-[12.5px] text-muted">
                            {r.currency} {r.amountDue.toLocaleString("en-PK")}
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
                        {r.mediaConsent ? (
                          <span className="text-[13px] text-muted">OK</span>
                        ) : (
                          <Badge tone="warning">No photos</Badge>
                        )}
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
