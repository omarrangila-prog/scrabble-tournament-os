"use client";

import * as React from "react";
import {
  Award,
  FileSpreadsheet,
  FileText,
  Link2,
  Printer,
  Table2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Modal,
  PageHeader,
  Select,
  Tabs,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { computeStandings } from "@/lib/engine/standings";
import { cn, downloadFile, formatDate, formatDateTime, signed, toCsv } from "@/lib/utils";

interface ReportDef {
  id: string;
  name: string;
  description: string;
  group: "results" | "operations" | "finance";
}

const REPORTS: ReportDef[] = [
  { id: "final-standings", name: "Final standings", description: "Ranked table for every division with tiebreaks applied.", group: "results" },
  { id: "round-pairings", name: "Round pairings", description: "Board assignments for a selected round.", group: "results" },
  { id: "round-results", name: "Round results", description: "Scores, winners and spreads for a selected round.", group: "results" },
  { id: "cross-tables", name: "Cross tables", description: "Every player against every opponent they faced.", group: "results" },
  { id: "player-cards", name: "Player record cards", description: "One-page record for each player, round by round.", group: "results" },
  { id: "attendance", name: "Attendance report", description: "Check-in status, late arrivals and withdrawals.", group: "operations" },
  { id: "corrections", name: "Score correction report", description: "Every corrected result with the reason recorded.", group: "operations" },
  { id: "byes", name: "Bye report", description: "Bye allocation by round and division.", group: "operations" },
  { id: "disputes", name: "Dispute report", description: "Arbiter cases, rulings and appeals.", group: "operations" },
  { id: "audit", name: "Audit log", description: "Complete record of every tournament action.", group: "operations" },
  { id: "prize-list", name: "Prize list", description: "Prize winners by division and category.", group: "results" },
  { id: "rating-export", name: "Rating submission export", description: "Results formatted for submission to the rating body.", group: "results" },
  { id: "summary", name: "Tournament summary", description: "Headline figures and outcomes for the whole event.", group: "results" },
  { id: "financial", name: "Financial summary", description: "Registration income, fees collected and outstanding.", group: "finance" },
  { id: "certificates", name: "Certificates", description: "Printable certificates with your branding.", group: "results" },
  { id: "sponsor", name: "Sponsor report", description: "Sponsor exposure across screens and publications.", group: "finance" },
];

const CERTIFICATE_TYPES = [
  "Champion",
  "Runner-up",
  "Division winner",
  "Best performance",
  "Highest game score",
  "Participation",
  "Organizer appreciation",
  "Volunteer appreciation",
];

export default function ReportsPage() {
  const store = useStore();
  const { tournament, players, pairings, divisions, disputes, audit } = store;

  const [group, setGroup] = React.useState("all");
  const [preview, setPreview] = React.useState<ReportDef | null>(null);
  const [certOpen, setCertOpen] = React.useState(false);

  const [filterDivision, setFilterDivision] = React.useState("masters");
  const [filterRound, setFilterRound] = React.useState(String(tournament.currentRound));
  const [filterStatus, setFilterStatus] = React.useState("all");

  const list = REPORTS.filter((r) => group === "all" || r.group === group);

  const nameOf = (id: string | null) =>
    id ? players.find((p) => p.id === id)?.fullName ?? "—" : "Bye";

  /** Builds the rows for whichever report is being previewed. */
  const buildRows = (def: ReportDef): { headers: string[]; rows: (string | number)[][] } => {
    switch (def.id) {
      case "final-standings": {
        const table = computeStandings(players, pairings, tournament, { division: filterDivision });
        return {
          headers: ["Rank", "Player", "ID", "Rating", "W", "D", "L", "Spread", "Performance"],
          rows: table.map((r) => {
            const p = players.find((x) => x.id === r.playerId);
            return [r.rank, p?.fullName ?? "", p?.playerId ?? "", p?.rating || "Unrated", r.wins, r.draws, r.losses, signed(r.spread), r.performance];
          }),
        };
      }
      case "round-pairings": {
        const list = pairings.filter((p) => p.round === Number(filterRound)).sort((a, b) => a.board - b.board);
        return {
          headers: ["Board", "Player A", "Player B", "Division"],
          rows: list.map((p) => [p.playerBId ? p.board : "Bye", nameOf(p.playerAId), nameOf(p.playerBId), p.division]),
        };
      }
      case "round-results": {
        const list = pairings
          .filter((p) => p.round === Number(filterRound) && p.scoreA !== undefined)
          .sort((a, b) => a.board - b.board);
        return {
          headers: ["Board", "Player A", "Score A", "Player B", "Score B", "Winner", "Spread"],
          rows: list.map((p) => [
            p.board, nameOf(p.playerAId), p.scoreA!, nameOf(p.playerBId), p.scoreB!,
            p.scoreA! > p.scoreB! ? nameOf(p.playerAId) : p.scoreA! < p.scoreB! ? nameOf(p.playerBId) : "Tie",
            Math.abs(p.scoreA! - p.scoreB!),
          ]),
        };
      }
      case "cross-tables": {
        const pool = players.filter((p) => p.division === filterDivision).slice(0, 20);
        return {
          headers: ["Player", ...Array.from({ length: tournament.currentRound }, (_, i) => `R${i + 1}`)],
          rows: pool.map((p) => [
            p.fullName,
            ...Array.from({ length: tournament.currentRound }, (_, i) => {
              const g = pairings.find(
                (x) => x.round === i + 1 && (x.playerAId === p.id || x.playerBId === p.id),
              );
              if (!g) return "—";
              if (g.playerBId === null) return "Bye";
              if (g.scoreA === undefined) return "—";
              const isA = g.playerAId === p.id;
              const mine = isA ? g.scoreA : g.scoreB!;
              const theirs = isA ? g.scoreB! : g.scoreA;
              return `${mine > theirs ? "W" : mine === theirs ? "D" : "L"} ${mine}-${theirs}`;
            }),
          ]),
        };
      }
      case "attendance":
        return {
          headers: ["Player", "ID", "Division", "Check-in", "Time", "Payment"],
          rows: players
            .filter((p) => filterStatus === "all" || p.checkIn === filterStatus)
            .map((p) => [p.fullName, p.playerId, p.division, p.checkIn, p.checkInAt ? formatDateTime(p.checkInAt) : "—", p.payment]),
        };
      case "corrections":
        return {
          headers: ["Time", "User", "Target", "Previous", "New", "Reason"],
          rows: audit
            .filter((a) => a.action.toLowerCase().includes("correct"))
            .map((a) => [formatDateTime(a.at), a.user, a.target, a.previousValue ?? "—", a.newValue ?? "—", a.reason ?? "—"]),
        };
      case "byes":
        return {
          headers: ["Round", "Player", "Division"],
          rows: pairings.filter((p) => p.playerBId === null).map((p) => [p.round, nameOf(p.playerAId), p.division]),
        };
      case "disputes":
        return {
          headers: ["Case", "Round", "Board", "Category", "Status", "Arbiter", "Decision"],
          rows: disputes.map((d) => [d.caseNumber, d.round, d.board, d.category, d.status, d.assignedArbiter, d.decision ?? "—"]),
        };
      case "audit":
        return {
          headers: ["Time", "User", "Role", "Action", "Target", "Previous", "New", "Reason"],
          rows: audit.map((a) => [formatDateTime(a.at), a.user, a.role, a.action, a.target, a.previousValue ?? "—", a.newValue ?? "—", a.reason ?? "—"]),
        };
      case "prize-list": {
        const rows: (string | number)[][] = [];
        for (const d of divisions) {
          const table = computeStandings(players, pairings, tournament, { division: d.id });
          table.slice(0, 3).forEach((r, i) => {
            const p = players.find((x) => x.id === r.playerId);
            rows.push([d.name, ["Champion", "Runner-up", "Third place"][i], p?.fullName ?? "", `${r.wins}–${r.losses}`, signed(r.spread)]);
          });
        }
        return { headers: ["Division", "Prize", "Player", "Record", "Spread"], rows };
      }
      case "player-cards":
        return {
          headers: ["Player", "ID", "Division", "Seed", "Rating", "W", "L", "D", "Spread"],
          rows: players
            .filter((p) => p.division === filterDivision)
            .map((p) => [p.fullName, p.playerId, p.division, p.seed, p.rating || "Unrated", p.wins, p.losses, p.draws, signed(p.spread)]),
        };
      case "rating-export":
        return {
          headers: ["Player ID", "Name", "Rating", "Games", "Wins", "Losses", "Draws", "Spread"],
          rows: players.map((p) => [p.playerId, p.fullName, p.rating || 0, p.wins + p.losses + p.draws, p.wins, p.losses, p.draws, p.spread]),
        };
      case "financial": {
        const paid = players.filter((p) => p.payment === "paid").length;
        const pending = players.filter((p) => p.payment === "pending").length;
        const waived = players.filter((p) => p.payment === "waived").length;
        const fee = tournament.registrationFee;
        return {
          headers: ["Item", "Count", "Amount (PKR)"],
          rows: [
            ["Registrations paid", paid, (paid * fee).toLocaleString("en-PK")],
            ["Payments pending", pending, (pending * fee).toLocaleString("en-PK")],
            ["Fees waived", waived, "0"],
            ["Total collected", paid, (paid * fee).toLocaleString("en-PK")],
            ["Expected total", players.length - waived, ((players.length - waived) * fee).toLocaleString("en-PK")],
          ],
        };
      }
      case "sponsor":
        return {
          headers: ["Sponsor", "Public site", "TV display", "Certificates", "Pairing sheets"],
          rows: tournament.sponsors.map((s) => [s, "Yes", "Yes", "Yes", "Yes"]),
        };
      case "summary":
        return {
          headers: ["Metric", "Value"],
          rows: [
            ["Tournament", tournament.name],
            ["Venue", `${store.venue.name}, ${tournament.city}`],
            ["Dates", `${formatDate(tournament.startDate)} – ${formatDate(tournament.endDate)}`],
            ["System", tournament.system],
            ["Rounds", `${tournament.currentRound} of ${tournament.totalRounds}`],
            ["Players", players.length],
            ["Divisions", divisions.length],
            ["Games verified", pairings.filter((p) => p.status === "verified").length],
            ["Arbiter cases", disputes.length],
            ["Audit entries", audit.length],
          ],
        };
      default:
        return { headers: ["Item"], rows: [["Preview not available for this report."]] };
    }
  };

  const exportReport = (def: ReportDef, format: "csv" | "pdf" | "excel" | "link") => {
    if (!store.requireCapability("reports.export")) return;
    const { headers, rows } = buildRows(def);

    if (format === "csv" || format === "excel") {
      downloadFile(
        `${def.id}.${format === "csv" ? "csv" : "xls"}`,
        toCsv([headers, ...rows]),
        format === "csv" ? "text/csv" : "application/vnd.ms-excel",
      );
      store.toast({
        title: `${def.name} exported`,
        description: `${rows.length} rows downloaded as ${format.toUpperCase()}.`,
        tone: "success",
      });
      return;
    }
    if (format === "link") {
      navigator.clipboard?.writeText(`${window.location.origin}/live?report=${def.id}`);
      store.toast({
        title: "Public link copied",
        description: "Anyone with this link can view the published report.",
        tone: "success",
      });
      return;
    }
    // PDF in the demo opens the print dialog, which produces a real PDF.
    setPreview(def);
    window.setTimeout(() => window.print(), 350);
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Reports"
        subtitle="Every record the tournament produces, ready to print, export or publish."
        actions={
          <Button variant="primary" icon={<Award className="size-4" />} onClick={() => setCertOpen(true)}>
            Certificate generator
          </Button>
        }
      />

      {/* Filters */}
      <Card className="mb-4">
        <CardHeader title="Report filters" subtitle="Applied to the report you preview or export" />
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Tournament">
            <Select defaultValue={tournament.id}>
              {store.tournaments.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Division">
            <Select value={filterDivision} onChange={(e) => setFilterDivision(e.target.value)}>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Round">
            <Select value={filterRound} onChange={(e) => setFilterRound(e.target.value)}>
              {Array.from({ length: tournament.currentRound }, (_, i) => i + 1).map((r) => (
                <option key={r} value={r}>Round {r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="checked-in">Checked in</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
              <option value="withdrawn">Withdrawn</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Tabs
        tabs={[
          { id: "all", label: "All reports", count: REPORTS.length },
          { id: "results", label: "Results", count: REPORTS.filter((r) => r.group === "results").length },
          { id: "operations", label: "Operations", count: REPORTS.filter((r) => r.group === "operations").length },
          { id: "finance", label: "Finance", count: REPORTS.filter((r) => r.group === "finance").length },
        ]}
        value={group}
        onChange={setGroup}
        className="mb-4"
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((r) => (
          <Card key={r.id} className="flex flex-col p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-050 text-primary">
                {r.id === "certificates" ? <Award className="size-4.5" /> : r.group === "finance" ? <Table2 className="size-4.5" /> : <FileText className="size-4.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-ink">{r.name}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{r.description}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => (r.id === "certificates" ? setCertOpen(true) : setPreview(r))}
              >
                Preview
              </Button>
              <Button size="sm" variant="ghost" onClick={() => exportReport(r, "pdf")} icon={<Printer className="size-3.5" />}>
                PDF
              </Button>
              <Button size="sm" variant="ghost" onClick={() => exportReport(r, "excel")} icon={<FileSpreadsheet className="size-3.5" />}>
                Excel
              </Button>
              <Button size="sm" variant="ghost" onClick={() => exportReport(r, "csv")}>
                CSV
              </Button>
              <Button size="sm" variant="ghost" onClick={() => exportReport(r, "link")} icon={<Link2 className="size-3.5" />}>
                Link
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Preview */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.name ?? ""}
        subtitle={preview?.description}
        size="lg"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => preview && exportReport(preview, "csv")}>
              Export CSV
            </Button>
            <Button variant="secondary" onClick={() => preview && exportReport(preview, "excel")}>
              Export Excel
            </Button>
            <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
              Print / PDF
            </Button>
          </div>
        }
      >
        {preview ? <ReportPreview def={preview} build={buildRows} /> : null}
      </Modal>

      <CertificateModal
        open={certOpen}
        onClose={() => setCertOpen(false)}
      />
    </div>
  );
}

function ReportPreview({
  def,
  build,
}: {
  def: ReportDef;
  build: (d: ReportDef) => { headers: string[]; rows: (string | number)[][] };
}) {
  const { headers, rows } = build(def);
  const store = useStore();

  return (
    <div>
      <div className="mb-3 rounded-compact bg-[rgb(var(--c-surface))] p-4">
        <p className="text-[15px] font-semibold text-ink">
          {store.tournament.name.replace(" — Demo", "")}
        </p>
        <p className="text-[12.5px] text-muted">
          {def.name} · generated {formatDateTime(new Date().toISOString())}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-6 text-center text-[13px] text-muted">
          This report has no data yet.
        </p>
      ) : (
        <>
          <TableWrap className="max-h-[46vh]">
            <thead>
              <tr>
                {headers.map((h) => (
                  <Th key={h}>{h}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 60).map((row, i) => (
                <tr key={i} className="hover:bg-[rgb(var(--c-surface-soft))]">
                  {row.map((cell, j) => (
                    <Td key={j} className={cn(typeof cell === "number" && "num")}>
                      {cell}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableWrap>
          {rows.length > 60 ? (
            <p className="mt-2 text-center text-[12px] text-muted">
              Showing the first 60 of {rows.length} rows. The export contains every row.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CertificateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const { players, pairings, tournament, divisions } = store;
  const [type, setType] = React.useState(CERTIFICATE_TYPES[0]);
  const [division, setDivision] = React.useState("masters");

  const table = computeStandings(players, pairings, tournament, { division });
  const winner = players.find((p) => p.id === table[0]?.playerId);
  const recipient =
    type === "Organizer appreciation"
      ? "Sir Hani"
      : type === "Volunteer appreciation"
        ? "Tournament Volunteer"
        : winner?.fullName ?? "Player name";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Certificate generator"
      subtitle="Certificates carry your branding and sponsor logos."
      size="lg"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              store.toast({
                title: "Certificates queued",
                description: `${type} certificates were generated for every eligible recipient.`,
                tone: "success",
              })
            }
          >
            Generate for all recipients
          </Button>
          <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
            Print certificate
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Certificate type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {CERTIFICATE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Division">
          <Select value={division} onChange={(e) => setDivision(e.target.value)}>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Certificate preview */}
      <div className="mt-4 overflow-hidden rounded-card border border-line-strong bg-white">
        <div className="board-motif relative px-8 py-10 text-center">
          <div className="pointer-events-none absolute inset-3 rounded-compact border-2 border-primary/25" />
          <div className="relative">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
              {store.organization.name}
            </p>
            <p className="mt-3 text-[13px] uppercase tracking-[0.16em] text-muted">Certificate of</p>
            <p className="mt-1 text-[26px] font-semibold tracking-[-0.02em] text-ink">{type}</p>

            <p className="mt-6 text-[12.5px] text-muted">This certificate is presented to</p>
            <p className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em] text-primary">
              {recipient}
            </p>

            <p className="mx-auto mt-5 max-w-md text-[12.5px] leading-relaxed text-muted">
              in recognition of outstanding achievement at the{" "}
              {tournament.name.replace(" — Demo", "")}, held at {store.venue.name},{" "}
              {tournament.city}, from {formatDate(tournament.startDate)} to{" "}
              {formatDate(tournament.endDate)}.
            </p>

            <div className="mt-8 flex items-end justify-between gap-6 px-4">
              <div className="flex-1 border-t border-[rgb(17_22_43/0.2)] pt-1.5 text-[11px] text-muted">
                Tournament Director
              </div>
              <div className="grid size-12 shrink-0 place-items-center rounded-[10px] bg-primary text-[10px] font-semibold text-white">
                SEAL
              </div>
              <div className="flex-1 border-t border-[rgb(17_22_43/0.2)] pt-1.5 text-[11px] text-muted">
                Chief Arbiter
              </div>
            </div>

            {tournament.sponsors.length > 0 ? (
              <div className="mt-6 border-t border-line pt-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-faint">
                  Supported by
                </p>
                <p className="mt-1 text-[11.5px] text-muted">{tournament.sponsors.join(" · ")}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[12px] text-muted">
        <Badge tone="neutral">Client branding and sponsor logos are configurable</Badge>
      </p>
    </Modal>
  );
}
