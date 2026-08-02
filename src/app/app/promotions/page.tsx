"use client";

import * as React from "react";
import {
  Award,
  Check,
  Megaphone,
  Pause,
  Play,
  Plus,
  Sparkles,
  Tag,
  Ticket,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Progress,
  Select,
  Stat,
  TableWrap,
  Tabs,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { selectRegistrations, useEventStore } from "@/lib/store/useEventStore";
import { usePromotionStore } from "@/lib/store/usePromotionStore";
import { useStore } from "@/lib/store/useStore";
import {
  Campaign,
  CampaignKind,
  CAMPAIGN_KIND_LABEL,
  CampaignStatus,
  checkEligibility,
  Reward,
  REWARD_BASIS,
  REWARD_KIND_LABEL,
  rewardSummary,
} from "@/lib/engine/promotions";
import { money } from "@/lib/engine/finance";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<CampaignStatus, "neutral" | "success" | "warning" | "info"> = {
  draft: "neutral",
  active: "success",
  paused: "warning",
  ended: "info",
};

/**
 * Promotions — campaigns that fill the event, and rewards that recognise play.
 *
 * Campaigns change what a player pays. Rewards change nothing but the prize
 * list; they never touch standings.
 */
export default function PromotionsPage() {
  const events = useEventStore();
  const promos = usePromotionStore();
  const app = useStore();

  const event = events.events[0];

  const eventId = event?.id;
  const seeded = promos.seeded;
  React.useEffect(() => {
    if (eventId && !seeded) usePromotionStore.getState().seedDemo(eventId);
  }, [eventId, seeded]);

  const [tab, setTab] = React.useState("campaigns");
  const [campaignOpen, setCampaignOpen] = React.useState(false);
  const [awarding, setAwarding] = React.useState<Reward | null>(null);

  if (!event) {
    return (
      <Card>
        <EmptyState title="No event" description="Create an event before running promotions." />
      </Card>
    );
  }

  const registrations = selectRegistrations(events, event.id);
  const campaigns = promos.campaignsFor(event.id);
  const rewards = promos.rewardsFor(event.id);
  const summary = rewardSummary(rewards);

  const totalRedemptions = campaigns.reduce((s, c) => s + c.redemptions, 0);
  const activeCount = campaigns.filter((c) => c.status === "active").length;

  // Revenue given up is the discount actually recorded against registrations,
  // not the campaign's headline percentage.
  const revenueForgone = registrations.reduce((s, r) => s + Math.max(0, r.discountAmount), 0);

  return (
    <div>
      <PageHeader
        title="Promotions"
        subtitle={`${event.name} · campaigns and awards`}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCampaignOpen(true)}>
            New campaign
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active campaigns" value={activeCount} sub={`${campaigns.length} in total`} icon={<Megaphone className="size-5" />} tone="primary" />
        <Stat label="Codes redeemed" value={totalRedemptions} sub="across all campaigns" icon={<Ticket className="size-5" />} tone="info" />
        <Stat label="Revenue given up" value={money(revenueForgone, event.currency)} sub="recorded discounts" icon={<Tag className="size-5" />} tone="warning" />
        <Stat label="Awards decided" value={`${summary.awarded}/${summary.total}`} sub={summary.needingDecision ? `${summary.needingDecision} need a decision` : "all measured awards ready"} icon={<Award className="size-5" />} tone={summary.pending ? "warning" : "success"} />
      </div>

      <div className="mt-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "campaigns", label: "Campaigns", count: campaigns.length },
            { id: "rewards", label: "Awards", count: rewards.length },
          ]}
        />
      </div>

      {/* Campaigns ---------------------------------------------------------- */}
      {tab === "campaigns" ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-8">
            <CardHeader title="Campaigns" subtitle="Codes a player can enter at registration" />
            {campaigns.length ? (
              <TableWrap>
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th>Campaign</Th>
                      <Th>Code</Th>
                      <Th className="text-right">Reduction</Th>
                      <Th className="text-right">Used</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => {
                      const check = checkEligibility(c, { at: new Date().toISOString(), groupSize: c.minGroupSize });
                      return (
                        <tr key={c.id}>
                          <Td>
                            <span className="block font-semibold text-ink">{c.name}</span>
                            <span className="block text-[11.5px] text-muted">
                              {CAMPAIGN_KIND_LABEL[c.kind]}
                              {c.minGroupSize ? ` · min ${c.minGroupSize} together` : ""}
                            </span>
                          </Td>
                          <Td>
                            <code className="num rounded-compact bg-[rgb(var(--c-surface-soft))] px-2 py-1 text-[12px] font-bold tracking-wide text-primary">
                              {c.code}
                            </code>
                          </Td>
                          <Td className="num text-right font-semibold">
                            {c.percentOff > 0 ? `${c.percentOff}%` : ""}
                            {c.percentOff > 0 && c.amountOff > 0 ? " + " : ""}
                            {c.amountOff > 0 ? money(c.amountOff, event.currency) : ""}
                            {c.percentOff === 0 && c.amountOff === 0 ? "—" : ""}
                          </Td>
                          <Td className="text-right">
                            <span className="num font-semibold text-ink">{c.redemptions}</span>
                            {c.cap > 0 ? (
                              <span className="num text-[11.5px] text-muted"> / {c.cap}</span>
                            ) : null}
                            {c.cap > 0 ? (
                              <Progress
                                className="mt-1"
                                value={Math.round((c.redemptions / c.cap) * 100)}
                                tone={c.redemptions >= c.cap ? "warning" : "primary"}
                                label={`${c.name} usage`}
                              />
                            ) : null}
                          </Td>
                          <Td>
                            <Badge tone={STATUS_TONE[c.status]}>
                              {c.status[0].toUpperCase() + c.status.slice(1)}
                            </Badge>
                            {!check.eligible && c.status === "active" ? (
                              <span className="mt-1 block text-[11px] text-[#a76d16]">
                                {check.reason}
                              </span>
                            ) : null}
                          </Td>
                          <Td>
                            <div className="flex justify-end gap-1.5">
                              {c.status === "active" ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  icon={<Pause className="size-3.5" />}
                                  onClick={() => promos.setCampaignStatus(c.id, "paused")}
                                >
                                  Pause
                                </Button>
                              ) : c.status !== "ended" ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  icon={<Play className="size-3.5" />}
                                  onClick={() => promos.setCampaignStatus(c.id, "active")}
                                >
                                  Activate
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Trash2 className="size-3.5" />}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Delete "${c.name}"? Registrations that already used it keep their discount. This cannot be undone.`,
                                    )
                                  ) {
                                    promos.removeCampaign(c.id);
                                    app.toast({
                                      title: "Campaign deleted",
                                      description: c.name,
                                      tone: "info",
                                    });
                                  }
                                }}
                              />
                            </div>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            ) : (
              <EmptyState title="No campaigns" description="Create a code to offer a reduced entry fee." />
            )}
          </Card>

          <Card className="xl:col-span-4">
            <CardHeader title="Try a code" subtitle="Exactly what a participant would see" icon={<Ticket className="size-4.5" />} />
            <div className="px-5 pb-5">
              <CodeTester eventId={event.id} baseFee={event.fee} currency={event.currency} />
            </div>
          </Card>
        </div>
      ) : null}

      {/* Rewards ------------------------------------------------------------ */}
      {tab === "rewards" ? (
        <div className="mt-4 grid gap-4">
          <Card>
            <CardHeader
              title="Awards"
              subtitle={`${money(summary.prizeValue, event.currency)} in decided prizes`}
            />
            <div className="grid gap-3 px-4 pb-4 md:grid-cols-2 xl:grid-cols-3">
              {rewards.map((r) => {
                const decided = !!r.recipientId && !!r.awardedBy;
                return (
                  <div
                    key={r.id}
                    className={cn(
                      "rounded-feature border p-4",
                      decided ? "border-success bg-success-050/40" : "border-line bg-[rgb(var(--c-surface-soft))]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-bold text-ink">{r.title}</p>
                        <p className="text-[11.5px] text-muted">{REWARD_KIND_LABEL[r.kind]}</p>
                      </div>
                      <Badge tone={REWARD_BASIS[r.kind] === "judged" ? "gold" : "info"}>
                        {REWARD_BASIS[r.kind] === "judged" ? "Judged" : "From the record"}
                      </Badge>
                    </div>

                    {decided ? (
                      <div className="mt-3">
                        <p className="text-[13.5px] font-semibold text-ink">{r.recipientName}</p>
                        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{r.citation}</p>
                        <p className="mt-1.5 text-[11px] text-faint">Decided by {r.awardedBy}</p>
                      </div>
                    ) : (
                      <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                        {REWARD_BASIS[r.kind] === "judged"
                          ? "This award cannot be computed. The director names the recipient."
                          : "Not yet decided. Suggestions come from verified games only."}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      <Button size="sm" variant={decided ? "secondary" : "primary"} onClick={() => setAwarding(r)}>
                        {decided ? "Change" : "Decide"}
                      </Button>
                      {decided ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Undo2 className="size-3.5" />}
                          onClick={() => promos.clearReward(r.id)}
                        >
                          Clear
                        </Button>
                      ) : null}
                      {r.prizeValue > 0 ? (
                        <span className="num ml-auto text-[12.5px] font-semibold text-muted">
                          {money(r.prizeValue, event.currency)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title="What awards do not do" icon={<Sparkles className="size-4.5" />} />
            <p className="px-5 pb-5 text-[13px] leading-relaxed text-muted">
              Awards are recorded alongside the tournament, never inside it. They appear on
              certificates and the prize list, and they do not affect standings, spread, or
              tie-breaks. Ranking stays derived from verified game results only.
            </p>
          </Card>
        </div>
      ) : null}

      <CampaignModal
        open={campaignOpen}
        currency={event.currency}
        onClose={() => setCampaignOpen(false)}
        onSave={(draft) => {
          promos.addCampaign({ ...draft, eventId: event.id });
          app.toast({
            title: "Campaign created",
            description: `${draft.name} — code ${draft.code}`,
            tone: "success",
          });
          setCampaignOpen(false);
        }}
      />

      <AwardModal
        reward={awarding}
        candidates={registrations.map((r) => ({ id: r.id, name: r.fullName }))}
        onClose={() => setAwarding(null)}
        onAward={(recipientId, recipientName, citation) => {
          if (!awarding) return;
          promos.awardReward(
            awarding.id,
            recipientId,
            recipientName,
            citation,
            app.currentUser?.name ?? "Sir Hani",
          );
          app.toast({
            title: `${awarding.title} decided`,
            description: `${recipientName} — ${citation}`,
            tone: "success",
          });
          setAwarding(null);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Lets the director check a code the way a participant experiences it. */
function CodeTester({
  eventId,
  baseFee,
  currency,
}: {
  eventId: string;
  baseFee: number;
  currency: string;
}) {
  const promos = usePromotionStore();
  const [code, setCode] = React.useState("");
  const [groupSize, setGroupSize] = React.useState(1);

  const trimmed = code.trim();
  const result = trimmed
    ? promos.validateCode(eventId, trimmed, new Date().toISOString(), groupSize)
    : null;

  const payable =
    result?.eligible && result.campaign
      ? Math.max(
          0,
          baseFee -
            Math.min(
              baseFee,
              Math.round((baseFee * Math.min(100, Math.max(0, result.campaign.percentOff))) / 100) +
                Math.max(0, result.campaign.amountOff),
            ),
        )
      : baseFee;

  return (
    <div className="space-y-3">
      <Field label="Promotion code">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. SCHOOL4"
          className="num uppercase"
          invalid={!!result && !result.eligible}
        />
      </Field>

      <Field label="Entries registered together" hint="Group campaigns check this number.">
        <Input
          type="number"
          className="num"
          value={groupSize}
          onChange={(e) => setGroupSize(Math.max(1, Number(e.target.value)))}
        />
      </Field>

      {result ? (
        <div
          className={cn(
            "rounded-control px-3.5 py-3 text-[12.5px] leading-relaxed",
            result.eligible ? "bg-success-050 text-[#12855c]" : "bg-warning-050 text-[#a76d16]",
          )}
        >
          {result.eligible && result.campaign
            ? `${result.campaign.name} applied.`
            : result.reason}
        </div>
      ) : null}

      <div className="rounded-feature bg-[rgb(var(--c-surface-soft))] px-4 py-3">
        <div className="flex items-baseline justify-between text-[12.5px] text-muted">
          <span>Entry fee</span>
          <span className="num">{money(baseFee, currency)}</span>
        </div>
        {payable !== baseFee ? (
          <div className="mt-1 flex items-baseline justify-between text-[12.5px] text-[#12855c]">
            <span>Reduction</span>
            <span className="num">−{money(baseFee - payable, currency)}</span>
          </div>
        ) : null}
        <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2">
          <span className="text-[13px] font-semibold text-ink">Payable</span>
          <span className="num text-[17px] font-extrabold text-ink">{money(payable, currency)}</span>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CampaignModal({
  open,
  currency,
  onClose,
  onSave,
}: {
  open: boolean;
  currency: string;
  onClose: () => void;
  onSave: (draft: Omit<Campaign, "id" | "redemptions" | "eventId">) => void;
}) {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<CampaignKind>("early-bird");
  const [code, setCode] = React.useState("");
  const [percentOff, setPercentOff] = React.useState(20);
  const [amountOff, setAmountOff] = React.useState(0);
  const [cap, setCap] = React.useState(0);
  const [minGroupSize, setMinGroupSize] = React.useState(0);
  const [startsAt, setStartsAt] = React.useState("2026-08-01");
  const [endsAt, setEndsAt] = React.useState("2026-08-20");
  const [notes, setNotes] = React.useState("");

  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setName("");
      setKind("early-bird");
      setCode("");
      setPercentOff(20);
      setAmountOff(0);
      setCap(0);
      setMinGroupSize(0);
      setNotes("");
    }
  }

  const valid =
    name.trim().length > 1 &&
    code.trim().length > 2 &&
    (percentOff > 0 || amountOff > 0) &&
    new Date(endsAt) > new Date(startsAt);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New campaign"
      subtitle="A campaign changes the entry fee. It never affects results."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() =>
              onSave({
                name: name.trim(),
                kind,
                status: "active",
                code: code.trim().toUpperCase(),
                percentOff,
                amountOff,
                cap,
                minGroupSize: minGroupSize > 1 ? minGroupSize : undefined,
                startsAt: new Date(`${startsAt}T00:00:00.000Z`).toISOString(),
                endsAt: new Date(`${endsAt}T23:59:59.000Z`).toISOString(),
                notes: notes.trim() || undefined,
              })
            }
          >
            Create campaign
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" required>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Early bird"
            />
          </Field>
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as CampaignKind)}>
              {(Object.keys(CAMPAIGN_KIND_LABEL) as CampaignKind[]).map((k) => (
                <option key={k} value={k}>
                  {CAMPAIGN_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Code" required hint="Case-insensitive. Shown to participants exactly as typed.">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="EARLY20"
            className="num uppercase"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Percent off" hint="0–100.">
            <Input
              type="number"
              className="num"
              value={percentOff}
              onChange={(e) => setPercentOff(Math.min(100, Math.max(0, Number(e.target.value))))}
            />
          </Field>
          <Field label={`Fixed amount off (${currency})`}>
            <Input
              type="number"
              className="num"
              value={amountOff}
              onChange={(e) => setAmountOff(Math.max(0, Number(e.target.value)))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Redemption cap" hint="0 means unlimited.">
            <Input
              type="number"
              className="num"
              value={cap}
              onChange={(e) => setCap(Math.max(0, Number(e.target.value)))}
            />
          </Field>
          <Field label="Minimum group size" hint="0 or 1 for individual entries.">
            <Input
              type="number"
              className="num"
              value={minGroupSize}
              onChange={(e) => setMinGroupSize(Math.max(0, Number(e.target.value)))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Ends">
            <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </div>

        <Field label="Notes" hint="Shown to staff, not to participants.">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function AwardModal({
  reward,
  candidates,
  onClose,
  onAward,
}: {
  reward: Reward | null;
  candidates: { id: string; name: string }[];
  onClose: () => void;
  onAward: (recipientId: string, recipientName: string, citation: string) => void;
}) {
  const [recipientId, setRecipientId] = React.useState("");
  const [citation, setCitation] = React.useState("");

  const [lastId, setLastId] = React.useState<string | null>(null);
  if (reward && reward.id !== lastId) {
    setLastId(reward.id);
    setRecipientId(reward.recipientId ?? "");
    setCitation(reward.citation ?? "");
  }
  if (!reward && lastId !== null) setLastId(null);

  const recipient = candidates.find((c) => c.id === recipientId);
  const valid = !!recipient && citation.trim().length > 3;

  return (
    <Modal
      open={!!reward}
      onClose={onClose}
      title={reward?.title ?? "Decide award"}
      subtitle={
        reward && REWARD_BASIS[reward.kind] === "judged"
          ? "This award is a judgement. Your name is recorded with the decision."
          : "Confirm the recipient and the evidence from the record."
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Check className="size-4" />}
            disabled={!valid}
            onClick={() => recipient && onAward(recipient.id, recipient.name, citation.trim())}
          >
            Record award
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Field label="Recipient" required>
          <Select value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
            <option value="">Select a player…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Citation"
          required
          hint="The evidence, printed on the certificate. e.g. QUIXOTRY, 365 points, round 4."
        >
          <Textarea rows={3} value={citation} onChange={(e) => setCitation(e.target.value)} />
        </Field>

        <p className="rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-[12px] leading-relaxed text-muted">
          Recording an award does not change any standing, spread or tie-break. It appears on the
          prize list and the recipient&apos;s certificate.
        </p>
      </div>
    </Modal>
  );
}
