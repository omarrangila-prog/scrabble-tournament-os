"use client";

import * as React from "react";
import {
  Bell,
  CheckCheck,
  Mail,
  MessageCircle,
  Monitor,
  Send,
  Smartphone,
  XCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  Tabs,
  TableWrap,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { MessageCampaign } from "@/lib/domain/types";
import { cn, formatDateTime, formatTime } from "@/lib/utils";

const CHANNELS = [
  { id: "push", label: "Push notification", icon: Smartphone },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "sms", label: "SMS", icon: Smartphone },
  { id: "email", label: "Email", icon: Mail },
  { id: "in-app", label: "In-app announcement", icon: Bell },
  { id: "public-screen", label: "Public screen", icon: Monitor },
] as const;

const TEMPLATES: Record<string, string> = {
  "Registration confirmed":
    "Your registration for {tournament} is confirmed. Your player ID is {playerId}. Please arrive by 08:30 for check-in.",
  "Payment pending":
    "We have not yet received your registration fee for {tournament}. Please complete payment before the deadline to secure your place.",
  "Check-in reminder":
    "Check-in for {tournament} opens at 08:00. Bring your player badge QR code for fast entry.",
  "Pairings published":
    "Round {round} pairings are now available. Check your board number in the player app before play begins.",
  "Board changed":
    "Your board for round {round} has changed. Please check the player app for your new board number.",
  "Round starting":
    "Round {round} begins in 10 minutes. Please take your seat and confirm your board number.",
  "Result verified":
    "Your round {round} result has been verified and included in the standings.",
  "Tournament delayed":
    "Round {round} has been delayed. The revised start time will be announced shortly. Thank you for your patience.",
  "Prize ceremony announcement":
    "The prize ceremony for {tournament} will take place in the main hall. All players are invited to attend.",
  "Certificate ready":
    "Your certificate for {tournament} is ready. Collect it from the organizer desk or download it from the player app.",
};

const AUDIENCES = [
  "All players",
  "Masters",
  "Open",
  "Recreational",
  "Novice",
  "Selected players",
  "Organizers",
  "Volunteers",
  "Parents",
  "Spectators",
];

export default function CommunicationPage() {
  const store = useStore();
  const { campaigns, announcements, tournament, players } = store;
  const [tab, setTab] = React.useState("compose");

  const [template, setTemplate] = React.useState("Pairings published");
  const [channel, setChannel] = React.useState<MessageCampaign["channel"]>("whatsapp");
  const [audience, setAudience] = React.useState("All players");
  const [title, setTitle] = React.useState("Round 6 pairings are available");
  const [body, setBody] = React.useState(TEMPLATES["Pairings published"]);

  const applyTemplate = (name: string) => {
    setTemplate(name);
    setBody(TEMPLATES[name] ?? "");
    setTitle(name);
  };

  const recipientCount = React.useMemo(() => {
    if (audience === "All players") return players.length;
    if (audience === "Selected players") return 2;
    if (["Organizers", "Volunteers"].includes(audience)) return 12;
    if (["Parents", "Spectators"].includes(audience)) return 64;
    const div = audience.toLowerCase().replace(/\s/g, "-").replace("u18", "u18");
    return players.filter((p) => p.division.includes(div.replace("youth-", "youth-").replace("junior-", "junior-"))).length || 30;
  }, [audience, players]);

  const resolved = body
    .replace(/{tournament}/g, tournament.name.replace(" — Demo", ""))
    .replace(/{round}/g, String(tournament.currentRound + 1))
    .replace(/{playerId}/g, "PK-042");

  const send = () => {
    if (!store.requireCapability("communication.send")) return;
    // Simulated delivery: a small share fails, as in a real gateway.
    const failed = Math.max(0, Math.round(recipientCount * 0.012));
    const pending = Math.max(0, Math.round(recipientCount * 0.008));
    store.sendCampaign({
      id: `c-${Math.random().toString(36).slice(2, 8)}`,
      template: title || template,
      channel,
      audience,
      recipients: recipientCount,
      sent: recipientCount,
      delivered: recipientCount - failed - pending,
      failed,
      pending,
      sentAt: new Date().toISOString(),
      status: "sent",
    });
    if (channel === "in-app" || channel === "public-screen") {
      store.publishAnnouncement({
        id: `a-${Math.random().toString(36).slice(2, 8)}`,
        tournamentId: tournament.id,
        title,
        body: resolved,
        audience,
        channels: [channel],
        publishedAt: new Date().toISOString(),
        author: store.currentUser?.name ?? "Demo user",
        pinned: false,
      });
    }
    store.toast({
      title: "Message sent",
      description: `${recipientCount} recipients via ${channel.replace("-", " ")}.`,
      tone: "success",
    });
    setTab("delivery");
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Communication"
        subtitle="One place for every message that goes to players, organizers and the public."
        badge={<Badge tone="neutral">Simulated in this demo</Badge>}
      />

      <Tabs
        tabs={[
          { id: "compose", label: "Compose" },
          { id: "delivery", label: "Delivery status", count: campaigns.length },
          { id: "announcements", label: "Announcements", count: announcements.length },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === "compose" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Compose a message" subtitle="Choose a template, audience and channel" icon={<Send className="size-4.5" />} />
            <div className="space-y-3.5 px-5 pb-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Template">
                  <Select value={template} onChange={(e) => applyTemplate(e.target.value)}>
                    {Object.keys(TEMPLATES).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Audience">
                  <Select value={audience} onChange={(e) => setAudience(e.target.value)}>
                    {AUDIENCES.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div>
                <p className="mb-1.5 text-[13px] font-medium text-ink">Channel</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {CHANNELS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setChannel(c.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-control border px-3 py-2.5 text-left transition-colors",
                        channel === c.id
                          ? "border-primary bg-primary-050"
                          : "border-line-strong bg-[rgb(var(--c-surface))] hover:bg-[rgb(var(--c-surface-strong))]",
                      )}
                    >
                      <c.icon className={cn("size-4 shrink-0", channel === c.id ? "text-primary" : "text-faint")} />
                      <span className="min-w-0 truncate text-[12.5px] text-ink">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Field label="Title" required>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>

              <Field
                label="Message"
                required
                hint="Placeholders {tournament}, {round} and {playerId} are replaced automatically."
              >
                <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
              </Field>

              <Button variant="primary" onClick={send} disabled={!title.trim() || !body.trim()} icon={<Send className="size-4" />}>
                Send to {recipientCount} recipient{recipientCount === 1 ? "" : "s"}
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Preview" subtitle={`As seen on ${channel.replace("-", " ")}`} />
            <div className="px-5 pb-5">
              <div className="rounded-compact border border-line-strong bg-white p-4">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-primary text-white">
                    <Bell className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-ink">Bluffy Alphabattle</p>
                    <p className="text-[11px] text-muted">now</p>
                  </div>
                </div>
                <p className="mt-2.5 text-[13px] font-semibold text-ink">{title || "Message title"}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{resolved}</p>
              </div>

              <dl className="mt-3 space-y-1 text-[12.5px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Audience</dt>
                  <dd className="text-ink">{audience}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Recipients</dt>
                  <dd className="text-ink num">{recipientCount}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Channel</dt>
                  <dd className="capitalize text-ink">{channel.replace("-", " ")}</dd>
                </div>
              </dl>

              <p className="mt-3 rounded-control bg-secondary-050 px-3 py-2.5 text-[11.5px] leading-relaxed text-[#2b7fd4]">
                External delivery is simulated in this demonstration. In production this connects
                to your WhatsApp Business, SMS and email providers.
              </p>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "delivery" ? (
        <Card>
          <CardHeader title="Delivery status" subtitle="Every message sent from this tournament" />
          <div className="px-3 pb-4">
            <TableWrap>
              <thead>
                <tr>
                  <Th>Message</Th>
                  <Th className="w-32">Channel</Th>
                  <Th className="w-36">Audience</Th>
                  <Th className="w-24">Recipients</Th>
                  <Th className="w-24">Delivered</Th>
                  <Th className="w-20">Failed</Th>
                  <Th className="w-20">Pending</Th>
                  <Th className="w-32">Sent</Th>
                  <Th className="w-28">Status</Th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-[rgb(var(--c-surface-soft))]">
                    <Td className="font-medium">{c.template}</Td>
                    <Td className="capitalize">{c.channel.replace("-", " ")}</Td>
                    <Td>{c.audience}</Td>
                    <Td className="num">{c.recipients}</Td>
                    <Td className="num text-[#1b8f68]">{c.delivered}</Td>
                    <Td className={cn("num", c.failed > 0 && "text-critical")}>{c.failed}</Td>
                    <Td className="num">{c.pending}</Td>
                    <Td>{formatTime(c.sentAt)}</Td>
                    <Td>
                      <Badge
                        tone={c.status === "sent" ? "success" : c.status === "scheduled" ? "info" : c.status === "failed" ? "critical" : "warning"}
                        dot
                      >
                        {c.status}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>

          <div className="grid grid-cols-2 gap-2 px-5 pb-5 sm:grid-cols-4">
            {[
              ["Delivered", campaigns.reduce((a, c) => a + c.delivered, 0), CheckCheck, "success"],
              ["Sent", campaigns.reduce((a, c) => a + c.sent, 0), Send, "info"],
              ["Failed", campaigns.reduce((a, c) => a + c.failed, 0), XCircle, "critical"],
              ["Pending", campaigns.reduce((a, c) => a + c.pending, 0), Bell, "warning"],
            ].map(([label, value, Icon, tone]) => {
              const I = Icon as React.ElementType;
              return (
                <div
                  key={String(label)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-control px-3.5 py-2.5",
                    tone === "success" && "bg-success-050/70",
                    tone === "info" && "bg-secondary-050/70",
                    tone === "critical" && "bg-critical-050/70",
                    tone === "warning" && "bg-warning-050/70",
                  )}
                >
                  <I className="size-4 shrink-0 text-muted" />
                  <div>
                    <p className="text-[17px] font-semibold text-ink num">{value as number}</p>
                    <p className="text-[11.5px] text-muted">{label as string}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {tab === "announcements" ? (
        <div className="space-y-2">
          {announcements.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink">{a.title}</p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {a.author} · {formatDateTime(a.publishedAt)} · {a.audience}
                  </p>
                </div>
                {a.pinned ? <Badge tone="primary" dot>Pinned</Badge> : null}
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-ink">{a.body}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.channels.map((c) => (
                  <Badge key={c} tone="neutral" className="capitalize">{c.replace("-", " ")}</Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
