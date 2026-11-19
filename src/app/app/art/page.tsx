"use client";

import * as React from "react";
import { Copy, Palette, RefreshCw } from "lucide-react";

import { Badge, Button, Card, EmptyState, PageHeader, SearchInput, Stat, TableWrap, Td, Th } from "@/components/ui";
import { ProofOpenButton } from "@/components/organizer/RegistrationDetails";
import { ART_PATH, listArtEntries, removeArtEntry, setArtPaid, type StoredArtEntry } from "@/lib/supabase/art";
import { useStore } from "@/lib/store/useStore";
import { formatTime } from "@/lib/utils";

/**
 * Art Activity sign-ups: Canvas Painting and Tote Bag Printing / Painting.
 *
 * Its own page because these entries are stored apart from the tournament (`artRegistrations`) and
 * must never appear in a roster, a draw or the standings.
 */
export default function ArtAdminPage() {
  const app = useStore();
  const [entries, setEntries] = React.useState<StoredArtEntry[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [reloads, setReloads] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    (async () => {
      const rows = await listArtEntries();
      if (live) setEntries(rows);
    })();
    return () => {
      live = false;
    };
  }, [reloads]);

  const rows = React.useMemo(() => entries ?? [], [entries]);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => `${r.fullName} ${r.phone} ${r.email}`.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const canvas = rows.filter((r) => r.activities.includes("canvas")).length;
  const tote = rows.filter((r) => r.activities.includes("tote")).length;
  const collected = rows.filter((r) => r.paymentStatus === "verified").reduce((n, r) => n + r.amountDue, 0);
  const owed = rows.reduce((n, r) => n + r.amountDue, 0);

  const copyLink = () => {
    void navigator.clipboard?.writeText(`${window.location.origin}${ART_PATH}`);
    app.toast({ title: "Link copied", description: `${window.location.origin}${ART_PATH}`, tone: "success" });
  };

  const act = async (id: string, run: () => Promise<{ ok: true } | { ok: false; message: string }>) => {
    setBusy(id);
    setProblem(null);
    const out = await run();
    setBusy(null);
    if (!out.ok) return setProblem(out.message);
    setReloads((n) => n + 1);
  };

  const yes = (on: boolean) => (on ? <Badge tone="success">Yes</Badge> : <span className="text-[13px] text-faint">No</span>);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Art Activity"
        subtitle="Canvas Painting and Tote Bag Printing / Painting. Rs. 1,000 each, Rs. 2,000 for both."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<Copy className="size-4" />} onClick={copyLink}>
              Copy link
            </Button>
            <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => setReloads((n) => n + 1)}>
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Registrations" value={String(rows.length)} />
        <Stat label="Canvas / Tote bag" value={`${canvas} / ${tote}`} />
        <Stat label="Collected" value={`Rs. ${collected.toLocaleString("en-PK")}`} tone="success" />
        <Stat label="Still to collect" value={`Rs. ${(owed - collected).toLocaleString("en-PK")}`} />
      </div>

      {problem ? <p className="rounded-control bg-critical-050 px-3.5 py-3 text-[13px] text-critical">{problem}</p> : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <span className="text-[14px] font-semibold text-ink">
            {filtered.length} of {rows.length}
          </span>
          <SearchInput value={query} onChange={setQuery} placeholder="Search a name, phone or email" />
        </div>

        {entries === null ? (
          <EmptyState title="Loading registrations" description="One moment." />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Palette className="size-5" />}
            title={rows.length === 0 ? "No registrations yet" : "Nothing matches that"}
            description={rows.length === 0 ? "Copy the link and share it on WhatsApp." : "Try a different name or number."}
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Age</Th>
                  <Th>Phone</Th>
                  <Th>Canvas Painting</Th>
                  <Th>Tote Bag</Th>
                  <Th>Total fee</Th>
                  <Th>Payment method</Th>
                  <Th>Payment status</Th>
                  <Th>Payment proof</Th>
                  <Th>Registered at</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const paid = r.paymentStatus === "verified";
                  return (
                    <tr key={r.id} className="border-t border-line align-top">
                      <Td>
                        <span className="block font-semibold text-ink">{r.fullName}</span>
                        {r.email ? <span className="block break-all text-[12px] text-muted">{r.email}</span> : null}
                      </Td>
                      <Td>
                        <span className="num">{r.age ?? "—"}</span>
                      </Td>
                      <Td>
                        <span className="num">{r.phone}</span>
                      </Td>
                      <Td>{yes(r.activities.includes("canvas"))}</Td>
                      <Td>{yes(r.activities.includes("tote"))}</Td>
                      <Td>
                        <span className="num font-semibold text-ink">Rs. {r.amountDue.toLocaleString("en-PK")}</span>
                      </Td>
                      <Td>{r.payment === "online" ? "Online" : "Cash / at venue"}</Td>
                      <Td>
                        <Badge tone={paid ? "success" : r.paymentStatus === "receipt-uploaded" ? "info" : "warning"}>
                          {paid ? (r.autoVerified ? "Paid (receipt)" : "Paid") : r.paymentStatus === "receipt-uploaded" ? "Submitted" : "Pending"}
                        </Badge>
                      </Td>
                      <Td>
                        {r.proof ? (
                          <ProofOpenButton path={r.proof.path} fileName={r.proof.fileName} contentType={r.proof.contentType} onProblem={setProblem} />
                        ) : (
                          <span className="text-[13px] text-faint">—</span>
                        )}
                      </Td>
                      <Td>
                        <span className="text-[12.5px] text-muted">{r.createdAt ? formatTime(r.createdAt) : "—"}</span>
                      </Td>
                      <Td>
                        <div className="flex flex-col items-start gap-1.5">
                          <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => void act(r.id, () => setArtPaid(r.id, !paid))}>
                            {paid ? "Mark unpaid" : "Mark paid"}
                          </Button>
                          <button
                            type="button"
                            disabled={busy === r.id}
                            onClick={() => {
                              if (window.confirm(`Remove ${r.fullName}'s registration?`)) void act(r.id, () => removeArtEntry(r.id));
                            }}
                            className="text-[12.5px] font-semibold text-critical underline-offset-4 hover:underline disabled:opacity-50"
                          >
                            Remove
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
