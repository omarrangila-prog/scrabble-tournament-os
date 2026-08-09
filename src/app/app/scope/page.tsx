"use client";

import * as React from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  Mail,
  MessageCircle,
  Phone,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Modal,
  PageHeader,
} from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { cn, downloadFile } from "@/lib/utils";

/** Configurable contact details — replace with the client's own before delivery. */
const CONTACT = {
  whatsapp: "+923000000000",
  email: "info@perfectcraft.com",
  company: "PerfectCraft",
};

const MVP_MODULES = [
  ["Tournament setup", "Create an event, divisions, rounds and ranking rules."],
  ["Player registration", "Manual entry, bulk import, duplicate detection and payment status."],
  ["Divisions and seeding", "Automatic seeding by rating with manual override and locking."],
  ["QR check-in", "High-speed check-in with attendance exceptions and player cards."],
  ["Pairing generation", "Swiss pairings with conflict detection and director override."],
  ["Score entry", "Fast keyboard entry, validation and verification."],
  ["Live standings", "Automatic recalculation with configurable tiebreaks."],
  ["Public tournament website", "Pairings, results and standings for players and spectators."],
  ["Reports", "Standings, cross tables, attendance, audit log and exports."],
  ["Role-based access", "Director, scorekeeper, check-in officer, arbiter and display roles."],
];

const ADVANCED_MODULES = [
  ["Mobile player portal", "Personal pairing, board directions and result submission."],
  ["Digital result slips", "Two-sided confirmation with signatures and evidence upload."],
  ["Tournament Copilot", "Answers operational questions from live tournament data."],
  ["OCR score entry", "Read paper result slips from a photograph for confirmation."],
  ["WhatsApp notifications", "Pairing, board change and round-start messages."],
  ["Arbiter assistant", "Searchable rulebook and structured case management."],
  ["TV display mode", "Auto-rotating venue screens with sponsor slides."],
  ["Certificates", "Branded certificates for winners, participants and volunteers."],
  ["Analytics", "Round pace, upsets, corrections and board utilisation."],
  ["Rating integrations", "Export results in the format your rating body requires."],
];

const PHASES = [
  {
    name: "Phase 1",
    title: "Core Tournament Operations",
    items: [
      "Tournament setup and division configuration",
      "Player registration and bulk import",
      "Seeding and QR check-in",
      "Pairing generation with validation",
      "Score entry, verification and live standings",
      "Role-based access and the audit trail",
    ],
  },
  {
    name: "Phase 2",
    title: "Player, Public and Communication Experience",
    items: [
      "Public tournament website",
      "Mobile player portal and digital result slips",
      "TV display mode for the venue",
      "WhatsApp, SMS and email communication",
      "Reports, exports and certificates",
    ],
  },
  {
    name: "Phase 3",
    title: "Advanced Intelligence and Federation Integration",
    items: [
      "Tournament Copilot and natural-language reporting",
      "OCR result-sheet capture",
      "Analytics and forecasting",
      "Rating body integration and submission exports",
      "Multi-organization tenancy and offline synchronisation",
    ],
  },
];

export default function ScopePage() {
  const store = useStore();
  const [approved, setApproved] = React.useState(false);
  const [customOpen, setCustomOpen] = React.useState(false);

  const exportSummary = () => {
    const lines = [
      "TOURNAMENT OS — DEMONSTRATION SUMMARY",
      "=====================================",
      "",
      `Tournament: ${store.tournament.name}`,
      `Venue: ${store.venue.name}, ${store.tournament.city}`,
      `Format: Swiss System, ${store.tournament.totalRounds} rounds`,
      `Players: ${store.players.length} across ${store.divisions.length} divisions`,
      `Current round: ${store.tournament.currentRound}`,
      "",
      "MVP MODULES",
      ...MVP_MODULES.map(([n, d]) => `  - ${n}: ${d}`),
      "",
      "ADVANCED MODULES",
      ...ADVANCED_MODULES.map(([n, d]) => `  - ${n}: ${d}`),
      "",
      "IMPLEMENTATION PHASES",
      ...PHASES.flatMap((p) => [
        `  ${p.name} — ${p.title}`,
        ...p.items.map((i) => `    - ${i}`),
        "",
      ]),
      "DEMONSTRATION STATE",
      `  Players checked in: ${store.players.filter((p) => p.checkIn === "checked-in").length}`,
      `  Games verified: ${store.pairings.filter((p) => p.status === "verified").length}`,
      `  Arbiter cases: ${store.disputes.length}`,
      `  Audit entries: ${store.audit.length}`,
      "",
      `Prepared by ${CONTACT.company} · ${CONTACT.email}`,
    ];
    downloadFile("tournament-os-demo-summary.txt", lines.join("\n"), "text/plain");
    store.toast({
      title: "Demo summary exported",
      description: "A written summary of the demonstration was downloaded.",
      tone: "success",
    });
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Your complete tournament platform."
        subtitle="What is included, what can follow, and how the work is sequenced."
        actions={
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportSummary}>
            Export Demo Summary
          </Button>
        }
      />

      {/* Modules ---------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="MVP modules"
            subtitle="Everything needed to run a championship end to end"
            action={<Badge tone="success">Included</Badge>}
          />
          <ul className="space-y-1.5 px-5 pb-5">
            {MVP_MODULES.map(([name, desc]) => (
              <li key={name} className="flex items-start gap-2.5 rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-ink">{name}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Advanced modules"
            subtitle="Added once the core platform is running"
            action={<Badge tone="primary">Optional</Badge>}
          />
          <ul className="space-y-1.5 px-5 pb-5">
            {ADVANCED_MODULES.map(([name, desc]) => (
              <li key={name} className="flex items-start gap-2.5 rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5">
                <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-ink">{name}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Phases ----------------------------------------------------------- */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PHASES.map((p, i) => (
          <Card key={p.name} className={cn("p-5", i === 0 && "ring-1 ring-primary/25")}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-[10px] text-[13px] font-semibold num",
                  i === 0 ? "bg-primary text-white" : "bg-primary-050 text-primary",
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">
                  {p.name}
                </p>
                <p className="text-[14.5px] font-semibold leading-tight tracking-[-0.01em] text-ink">
                  {p.title}
                </p>
              </div>
            </div>

            <ul className="mt-3 space-y-1.5">
              {p.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {/* CTA -------------------------------------------------------------- */}
      <Card id="schedule" className="board-motif mt-4 overflow-hidden">
        <div className="p-6 sm:p-8">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink sm:text-[26px]">
            Ready to run your next championship
          </h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
            Everything shown in this demonstration is working software, not a mockup. The next step
            is to confirm the scope you want in the first release and agree a delivery schedule.
          </p>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <Button
              variant="primary"
              size="lg"
              icon={approved ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
              onClick={() => {
                setApproved(true);
                store.toast({
                  title: "MVP scope approved",
                  description: "Thank you. We will prepare a delivery plan and schedule based on this scope.",
                  tone: "success",
                });
              }}
            >
              {approved ? "MVP scope approved" : "Approve MVP Scope"}
            </Button>

            <Button
              variant="secondary"
              size="lg"
              onClick={() => setCustomOpen(true)}
            >
              Request Customization
            </Button>

            <a
              href={`https://wa.me/${CONTACT.whatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                "Hello, we reviewed the Blufy's AlphaBattle demonstration and would like to discuss the implementation scope.",
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="secondary" size="lg" icon={<MessageCircle className="size-4" />}>
                WhatsApp
              </Button>
            </a>

            <a
              href={`mailto:${CONTACT.email}?subject=${encodeURIComponent(
                "Blufy's AlphaBattle — implementation scope",
              )}&body=${encodeURIComponent(
                "Hello,\n\nWe reviewed the Blufy's AlphaBattle demonstration and would like to discuss next steps.\n\n",
              )}`}
            >
              <Button variant="secondary" size="lg" icon={<Mail className="size-4" />}>
                Contact Development Team
              </Button>
            </a>
          </div>

          {approved ? (
            <div className="mt-5 flex items-start gap-2.5 rounded-compact bg-success-050 px-4 py-3">
              <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-success" />
              <div>
                <p className="text-[13.5px] font-semibold text-ink">Scope recorded</p>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  We will follow up with a delivery plan covering Phase 1, a timeline and the
                  handover process.
                </p>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-4 text-[12.5px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Phone className="size-3.5" />
              {CONTACT.whatsapp}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Mail className="size-3.5" />
              {CONTACT.email}
            </span>
            <span>Prepared by {CONTACT.company}</span>
          </div>
        </div>
      </Card>

      <Modal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Request customization"
        subtitle="Tell us what your federation needs that this demonstration does not yet cover."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
            <a
              href={`mailto:${CONTACT.email}?subject=${encodeURIComponent(
                "Blufy's AlphaBattle — customization request",
              )}`}
            >
              <Button variant="primary">Send by email</Button>
            </a>
          </div>
        }
      >
        <ul className="space-y-2">
          {[
            "A different pairing system or tiebreak policy",
            "Integration with an existing rating database",
            "Urdu or bilingual interface",
            "Custom certificate and report branding",
            "On-site offline operation without internet",
            "Additional roles or approval workflows",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5 text-[13px] text-ink">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
          Pricing is prepared once the scope is confirmed, so the quotation reflects only what you
          actually need.
        </p>
      </Modal>
    </div>
  );
}
