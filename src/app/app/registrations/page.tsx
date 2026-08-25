"use client";

import * as React from "react";
import { useCurrentEvent } from "@/lib/supabase/useCurrentEvent";
import { Check, Copy, Download, RefreshCw, UserCheck } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  SearchInput,
  Stat,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { RosterGate } from "@/components/organizer/RosterGate";
import { answer, verifyPayment, type OrganizerRegistration } from "@/lib/supabase/organizer";
import { useRoster } from "@/lib/supabase/useRoster";
import { useStore } from "@/lib/store/useStore";
import { cn, formatTime } from "@/lib/utils";

type Filter = "all" | "unpaid" | "arrived" | "waiting";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unpaid", label: "Unpaid" },
  { id: "arrived", label: "Arrived" },
  { id: "waiting", label: "Waiting list" },
];

/**
 * The participant list, inside the dashboard.
 *
 * This used to be a separate page at /organizer/registrations with its own layout,
 * its own sign-in and no sidebar — so the organizer signed in, landed on a screen
 * that looked like a different product, and had no route to the rest of the app. One
 * shell, one set of navigation, no shifting between two interfaces.
 *
 * Everything here reads the database. Payments are verified against a named person,
 * because a verification nobody signed is not a record of a decision.
 */
export default function RegistrationsPage() {
  const app = useStore();
  const currentEvent = useCurrentEvent();
  const roster = useRoster(currentEvent.eventId);
  const rows = roster.registrations;

  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [verifying, setVerifying] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);

  const needle = query.trim().toLowerCase();

  const visible = rows.filter((r) => {
    if (filter === "unpaid" && r.paymentStatus === "verified") return false;
    if (filter === "arrived" && !r.checkedInAt) return false;
    if (filter === "waiting" && r.registrationStatus !== "waitlisted") return false;
    if (!needle) return true;
    return (
      r.fullName.toLowerCase().includes(needle) ||
      r.mobile.includes(needle) ||
      r.email.toLowerCase().includes(needle) ||
      (r.checkInCode ?? "").includes(needle)
    );
  });

  const paid = rows.filter((r) => r.paymentStatus === "verified");
  const arrived = rows.filter((r) => r.checkedInAt);

  /*
   * Only verified payments are counted. Money nobody has confirmed is not revenue,
   * and a figure that includes it is the one an organizer would budget against.
   */
  const collected = paid.reduce((sum, r) => sum + r.amountDue, 0);
  const currency = rows[0]?.currency ?? "PKR";
  const money = (n: number) => `${currency} ${n.toLocaleString("en-PK")}`;

  const verify = async (row: OrganizerRegistration) => {
    setVerifying(row.id);
    const ok = await verifyPayment(row.id, roster.signedInAs ?? "organizer");
    setVerifying(null);

    if (!ok) {
      app.toast({
        title: "Not verified",
        description: "The decision was not saved. Please try again.",
        tone: "critical",
      });
      return;
    }

    roster.reload();
    app.toast({
      title: `${row.fullName}'s payment verified`,
      description: `Recorded against ${roster.signedInAs ?? "you"}.`,
      tone: "success",
    });
  };

  const copyCode = async (row: OrganizerRegistration) => {
    if (!row.checkInCode) return;
    await navigator.clipboard?.writeText(row.checkInCode);
    setCopied(row.id);
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Registrations"
        badge={
          <Badge tone={rows.length ? "primary" : "neutral"}>
            {rows.length} {rows.length === 1 ? "entry" : "entries"}
          </Badge>
        }
        subtitle="Everyone who has registered for 23 August, read live from the database."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={roster.reload}>
              Refresh
            </Button>
            <Button
              variant="secondary"
              icon={<Download className="size-4" />}
              onClick={() => downloadCsv(visible)}
              disabled={visible.length === 0}
            >
              CSV
            </Button>
          </>
        }
      />

      <RosterGate access={roster.access} loaded={roster.loaded}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Registered" value={rows.length} sub="entries received" tone="primary" />
          <Stat
            label="Paid"
            value={`${paid.length} of ${rows.length}`}
            sub="payment verified"
            tone={paid.length === rows.length && rows.length > 0 ? "success" : "warning"}
          />
          <Stat
            label="Checked in"
            value={`${arrived.length} of ${rows.length}`}
            sub={arrived.length ? "at the venue" : "nobody yet"}
            tone={arrived.length ? "success" : "neutral"}
          />
          <Stat label="Collected" value={money(collected)} sub="verified payments only" tone="gold" />
        </div>

        <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search a name, mobile, email or check-in code"
            className="lg:max-w-sm"
          />
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Button
                key={f.id}
                size="sm"
                variant={filter === f.id ? "primary" : "secondary"}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        <Card className="mt-3">
          <CardHeader
            title={filter === "all" ? "All entries" : FILTERS.find((f) => f.id === filter)!.label}
            subtitle={`${visible.length} shown`}
            icon={<UserCheck className="size-4.5" />}
          />
          <div className="px-3 pb-4">
            {rows.length === 0 ? (
              <EmptyState
                title="Nobody has registered yet"
                description="Entries from the public registration page appear here as they arrive."
                action={
                  <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={roster.reload}>
                    Check again
                  </Button>
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState
                title="Nothing matches"
                description={`${rows.length} on the list, none matching this search or filter.`}
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    Clear
                  </Button>
                }
              />
            ) : (
              <TableWrap className="max-h-[64vh]">
                <thead>
                  <tr>
                    <Th>Participant</Th>
                    <Th className="w-28">Level</Th>
                    <Th className="w-28">Code</Th>
                    <Th className="w-36">Payment</Th>
                    <Th className="w-32">Check-in</Th>
                    <Th className="w-28">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const isPaid = r.paymentStatus === "verified";
                    const area = answer(r, "area");

                    return (
                      <tr key={r.id} className={cn(r.checkedInAt && "bg-success-050/40")}>
                        <Td>
                          <span className="block truncate text-[13.5px] font-semibold text-ink">
                            {r.fullName}
                          </span>
                          <span className="num block truncate text-[11.5px] text-muted">
                            {r.mobile}
                            {area ? ` · ${area}` : ""}
                          </span>
                        </Td>
                        <Td className="capitalize">{r.playingLevel.replace(/-/g, " ")}</Td>
                        <Td>
                          {r.checkInCode ? (
                            <button
                              onClick={() => copyCode(r)}
                              className="tap-target num inline-flex items-center gap-1.5 text-[13px] font-bold text-ink hover:text-primary"
                              title="Copy this code"
                            >
                              {r.checkInCode}
                              {copied === r.id ? (
                                <Check className="size-3.5 text-success" />
                              ) : (
                                <Copy className="size-3 text-faint" />
                              )}
                            </button>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </Td>
                        <Td>
                          <Badge tone={isPaid ? "success" : "warning"}>
                            {isPaid ? "Verified" : r.paymentStatus.replace(/-/g, " ")}
                          </Badge>
                          <span className="num mt-0.5 block text-[11.5px] text-muted">
                            {money(r.amountDue)}
                          </span>
                        </Td>
                        <Td>
                          {r.checkedInAt ? (
                            <Badge tone="success" dot>
                              {formatTime(r.checkedInAt)}
                            </Badge>
                          ) : (
                            <Badge tone="neutral">Not arrived</Badge>
                          )}
                        </Td>
                        <Td>
                          {isPaid ? (
                            <span className="text-[12px] text-faint">—</span>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={verifying === r.id}
                              onClick={() => verify(r)}
                            >
                              {verifying === r.id ? "Saving…" : "Verify"}
                            </Button>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
          </div>
        </Card>
      </RosterGate>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Exports what is on screen, so a filtered view downloads what it shows. */
function downloadCsv(rows: OrganizerRegistration[]) {
  const header = [
    "Name",
    "Mobile",
    "Email",
    "Area",
    "Level",
    "Status",
    "Payment",
    "Amount",
    "Check-in code",
    "Checked in",
  ];

  const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const body = rows.map((r) =>
    [
      r.fullName,
      r.mobile,
      r.email,
      answer(r, "area") ?? "",
      r.playingLevel,
      r.registrationStatus,
      r.paymentStatus,
      String(r.amountDue),
      r.checkInCode ?? "",
      r.checkedInAt ?? "",
    ]
      .map(escape)
      .join(","),
  );

  const blob = new Blob([[header.map(escape).join(","), ...body].join("\n")], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "alphabattle-23-august-registrations.csv";
  a.click();
  URL.revokeObjectURL(url);
}
