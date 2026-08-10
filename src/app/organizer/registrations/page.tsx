"use client";

import * as React from "react";
import { ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Download,
  RefreshCw,
  Search,
  UserCheck,
} from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import {
  currentOrganizer,
  hasStaffAccess,
  listRegistrations,
  signIn,
  signOut,
  verifyPayment,
  type OrganizerRegistration,
} from "@/lib/supabase/organizer";
import { formatTime } from "@/lib/utils";

const CREAM = "#F5F0E4";
const FOREST = "#2F5D3A";
const GOLD = "#C89B3C";
const BROWN = "#3E2F23";


/**
 * The participant list, from the database.
 *
 * This is the screen the event is actually run from: who has registered, who has
 * paid, who has arrived. It reads through a database function that checks staff
 * membership server-side, so an unauthenticated visitor who finds this URL sees
 * a sign-in form and nothing else.
 *
 * Deliberately one table rather than a dashboard of widgets. On the day the
 * questions are "is this person on the list" and "have they paid", and both are
 * answered by looking down a column.
 */
export default function OrganizerRegistrationsPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [signedInAs, setSignedInAs] = React.useState<string | null>(null);
  const [staff, setStaff] = React.useState<boolean | null>(null);
  const [rows, setRows] = React.useState<OrganizerRegistration[]>([]);
  const [busy, setBusy] = React.useState(false);
  /** False until the first read finishes, so "no registrations" is never guessed. */
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "unpaid" | "arrived" | "waiting">("all");

  /*
   * A counter rather than a callback, so refreshing is just a state change.
   *
   * The lint rule forbids setting state synchronously inside an effect, which a
   * `load()` helper called from one does. Bumping this re-runs the fetch, and
   * every write happens in the async continuation.
   */
  const [reloads, setReloads] = React.useState(0);
  const reload = () => setReloads((n) => n + 1);

  React.useEffect(() => {
    let live = true;

    (async () => {
      const who = await currentOrganizer();
      if (!live) return;

      if (!who) {
        setSignedInAs(null);
        setStaff(null);
        setRows([]);
        setLoaded(true);
        return;
      }

      const allowed = await hasStaffAccess();
      const list = allowed ? await listRegistrations(ACTIVE_EVENT_ID) : [];
      if (!live) return;

      setSignedInAs(who);
      setStaff(allowed);
      setRows(list);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [reloads]);

  const submit = async () => {
    setError(null);
    setBusy(true);
    const outcome = await signIn(email, password);
    setBusy(false);

    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    setPassword("");
    reload();
  };

  /* ---- Not signed in --------------------------------------------------- */
  if (!signedInAs) {
    return (
      <Shell>
        <Panel>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>
            Organizer
          </p>
          <h1 className="mt-2 text-[24px] font-extrabold" style={{ color: BROWN }}>
            Sign in
          </h1>
          <p className="mt-1.5 text-[13.5px]" style={{ color: `${BROWN}A6` }}>
            Registrations and payments for 23 August.
          </p>

          <div className="mt-5 space-y-3.5 text-left">
            {/*
              * Text rather than email, and labelled for both.
              *
              * The account is identified by an address because Supabase Auth requires
              * one, but the director signs in as "admin". An `type="email"` field
              * argues with that — it offers the wrong keyboard on a phone and invites
              * the browser to complain about a value that is correct here.
              */}
            <Field label="Email or username">
              <Input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
            <Field label="Password" error={error ?? undefined}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                invalid={Boolean(error)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
              />
            </Field>
          </div>

          <Button
            size="lg"
            className="mt-5 w-full border-0"
            style={{ background: FOREST, color: "white" }}
            disabled={!email.trim() || !password || busy}
            onClick={submit}
          >
            {busy ? "Signing in…" : "Sign in"}
          </Button>

        </Panel>
      </Shell>
    );
  }

  /* ---- Signed in, but not staff ---------------------------------------- */
  if (staff === false) {
    return (
      <Shell>
        <Panel>
          <h1 className="text-[20px] font-extrabold" style={{ color: BROWN }}>
            No access
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: `${BROWN}A6` }}>
            {signedInAs} is signed in but is not an organizer for this event. If this
            is wrong, the address needs adding to the staff list.
          </p>
          <Button
            variant="secondary"
            className="mt-5 w-full"
            onClick={async () => {
              await signOut();
              reload();
            }}
          >
            Sign out
          </Button>
        </Panel>
      </Shell>
    );
  }

  /* ---- The list -------------------------------------------------------- */
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

  const paid = rows.filter((r) => r.paymentStatus === "verified").length;
  const arrived = rows.filter((r) => r.checkedInAt).length;
  const revenue = rows
    .filter((r) => r.paymentStatus === "verified")
    .reduce((sum, r) => sum + r.amountDue, 0);

  return (
    <main className="min-h-dvh px-4 py-6 sm:px-8 sm:py-10" style={{ background: CREAM }}>
      <div className="mx-auto w-full max-w-[1100px]">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
            style={{ color: `${BROWN}A6` }}
          >
            <ArrowLeft className="size-3.5" />
            Public site
          </Link>
          <span className="ml-auto text-[12.5px]" style={{ color: `${BROWN}99` }}>
            {signedInAs}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await signOut();
              reload();
            }}
          >
            Sign out
          </Button>
        </div>

        <h1 className="mt-4 text-[28px] font-extrabold" style={{ color: BROWN }}>
          Blufy&rsquo;s AlphaBattle · 23 August
        </h1>

        {/* Real figures only. Zero reads as zero. */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Registered" value={String(rows.length)} />
          <Stat label="Paid" value={`${paid} of ${rows.length}`} />
          <Stat label="Checked in" value={`${arrived} of ${rows.length}`} />
          <Stat label="Collected" value={`PKR ${revenue.toLocaleString("en-PK")}`} accent />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
              style={{ color: `${BROWN}80` }}
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, mobile, email or code"
              className="pl-9"
            />
          </div>

          {(["all", "unpaid", "arrived", "waiting"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-full px-3.5 py-2 text-[12.5px] font-bold capitalize transition-colors"
              style={
                filter === f
                  ? { background: FOREST, color: "white" }
                  : { background: "#FFFFFFB3", color: `${BROWN}CC` }
              }
            >
              {f}
            </button>
          ))}

          <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" />} onClick={reload}>
            Refresh
          </Button>

          {rows.length ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Download className="size-3.5" />}
              onClick={() => downloadCsv(rows)}
            >
              CSV
            </Button>
          ) : null}
        </div>

        {/* Empty means empty, not a spinner forever. */}
        {rows.length === 0 ? (
          <div
            className="mt-6 rounded-3xl border bg-white/70 px-6 py-14 text-center"
            style={{ borderColor: `${BROWN}1F` }}
          >
            <p className="text-[17px] font-extrabold" style={{ color: BROWN }}>
              {loaded ? "No registrations yet" : "Loading…"}
            </p>
            {loaded ? (
              <>
                <p className="mx-auto mt-2 max-w-[42ch] text-[13.5px]" style={{ color: `${BROWN}A6` }}>
                  Your registration page is live. Share the link to start receiving
                  entries.
                </p>
                <Button
                  size="sm"
                  className="mt-4 border-0"
                  style={{ background: FOREST, color: "white" }}
                  onClick={() =>
                    navigator.clipboard?.writeText(
                      `${window.location.origin}/events/alphabattle-23-august/register`,
                    )
                  }
                >
                  Copy registration link
                </Button>
              </>
            ) : null}
          </div>
        ) : (
          <div
            className="mt-6 overflow-x-auto rounded-3xl border bg-white/80"
            style={{ borderColor: `${BROWN}1F` }}
          >
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr style={{ background: `${BROWN}0A` }}>
                  {["Participant", "Level", "Code", "Payment", "Check-in", ""].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.1em]"
                      style={{ color: `${BROWN}99` }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: `${BROWN}14` }}>
                    <td className="px-4 py-3">
                      <p className="text-[13.5px] font-bold" style={{ color: BROWN }}>
                        {r.fullName}
                      </p>
                      <p className="num text-[12px]" style={{ color: `${BROWN}99` }}>
                        {r.mobile}
                        {r.area ? ` · ${r.area}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[12.5px] capitalize" style={{ color: `${BROWN}CC` }}>
                      {r.playingLevel}
                      {r.registrationStatus === "waitlisted" ? (
                        <span className="block text-[11px]" style={{ color: GOLD }}>
                          Waiting list
                        </span>
                      ) : null}
                    </td>
                    <td className="num px-4 py-3 text-[13px] font-bold" style={{ color: BROWN }}>
                      {r.checkInCode ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <PaymentCell row={r} />
                    </td>
                    <td className="px-4 py-3 text-[12.5px]" style={{ color: `${BROWN}CC` }}>
                      {r.checkedInAt ? (
                        <span className="inline-flex items-center gap-1.5" style={{ color: FOREST }}>
                          <Check className="size-3.5" />
                          {formatTime(r.checkedInAt)}
                        </span>
                      ) : (
                        <span style={{ color: `${BROWN}80` }}>Not arrived</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.paymentStatus !== "verified" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<UserCheck className="size-3.5" />}
                          onClick={async () => {
                            await verifyPayment(r.id, signedInAs ?? "organizer");
                            reload();
                          }}
                        >
                          Verify
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {visible.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px]" style={{ color: `${BROWN}A6` }}>
                Nothing matches that search.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10" style={{ background: CREAM }}>
      <div className="w-full max-w-[400px]">{children}</div>
    </main>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[26px] border bg-white/85 p-6 text-center sm:p-7"
      style={{ borderColor: `${BROWN}1F` }}
    >
      {children}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border bg-white/70 p-4" style={{ borderColor: `${BROWN}1A` }}>
      <p
        className="num text-[22px] font-extrabold leading-none"
        style={{ color: accent ? "#8A6A1F" : BROWN }}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11.5px]" style={{ color: `${BROWN}99` }}>
        {label}
      </p>
    </div>
  );
}

/** Payment state in plain words, with auto-verified flagged as a claim. */
function PaymentCell({ row }: { row: OrganizerRegistration }) {
  const verified = row.paymentStatus === "verified";
  const cash = row.paymentStatus === "cash-at-venue";

  return (
    <div>
      <span
        className="inline-block rounded-full px-2.5 py-1 text-[11px] font-bold"
        style={
          verified
            ? { background: `${FOREST}1A`, color: FOREST }
            : cash
              ? { background: `${GOLD}2E`, color: "#8A6A1F" }
              : { background: "rgba(200,60,60,0.10)", color: "#B23A3A" }
        }
      >
        {verified ? "Verified" : cash ? "Cash at venue" : "Needs review"}
      </span>
      <p className="num mt-1 text-[12px]" style={{ color: `${BROWN}99` }}>
        {row.currency} {row.amountDue.toLocaleString("en-PK")}
      </p>
    </div>
  );
}

/**
 * The list as a spreadsheet.
 *
 * Built in the browser from rows already on screen, so it needs no server and
 * cannot contain anything the organizer cannot already see. Values are quoted
 * because a name with a comma would otherwise shift every later column.
 */
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
      r.area ?? "",
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
  a.download = `alphabattle-23-august-registrations.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
