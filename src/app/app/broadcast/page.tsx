"use client";

import * as React from "react";
import Link from "next/link";
import {
  ExternalLink,
  Link2,
  Megaphone,
  Monitor,
  RefreshCw,
  Send,
  Smartphone,
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
  Textarea,
  Toggle,
} from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { formatTime } from "@/lib/utils";

export default function BroadcastPage() {
  const store = useStore();
  const { tournament, pairings, announcements } = store;

  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [audience, setAudience] = React.useState("All players");
  // Read on the client only; the server render falls back to a relative path.
  const publicUrl = React.useSyncExternalStore(
    () => () => {},
    () => `${window.location.origin}/live`,
    () => "/live",
  );

  const live = pairings.filter(
    (p) => p.round === tournament.currentRound && p.status === "live",
  ).length;

  const copy = (url: string, label: string) => {
    navigator.clipboard?.writeText(url);
    store.toast({
      title: `${label} copied`,
      description: "Share this link with players and spectators.",
      tone: "success",
    });
  };

  const publish = () => {
    if (!store.requireCapability("broadcast.manage")) return;
    store.publishAnnouncement({
      id: `a-${Math.random().toString(36).slice(2, 8)}`,
      tournamentId: tournament.id,
      title,
      body,
      audience,
      channels: ["in-app", "public-screen"],
      publishedAt: new Date().toISOString(),
      author: store.currentUser?.name ?? "Demo user",
      pinned: false,
    });
    store.toast({
      title: "Announcement published",
      description: "It is now visible on the public site and the venue screens.",
      tone: "success",
    });
    setTitle("");
    setBody("");
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Live Broadcast"
        badge={<Badge tone="success" dot pulse>Public site live</Badge>}
        subtitle="Control what players and spectators see on the public website and the venue screens."
        actions={
          <>
            <Link href="/live" target="_blank">
              <Button variant="secondary" icon={<ExternalLink className="size-4" />}>
                Open public site
              </Button>
            </Link>
            <Link href="/live/tv" target="_blank">
              <Button variant="primary" icon={<Monitor className="size-4" />}>
                Open TV display
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Public channels"
            subtitle="Share these links with players, spectators and the venue AV team"
            icon={<Link2 className="size-4.5" />}
          />
          <div className="space-y-2 px-5 pb-5">
            {[
              ["Public tournament website", `${publicUrl}`, "Home, pairings, results and standings"],
              ["TV display mode", `${publicUrl}/tv`, "Full-screen auto-rotating panels for the venue"],
              ["Player mobile view", `${publicUrl.replace("/live", "")}/player`, "Personal pairing, board and result submission"],
            ].map(([label, url, hint]) => (
              <div key={label} className="rounded-compact bg-[rgb(var(--c-surface))] px-3.5 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-ink">{label}</p>
                    <p className="text-[12px] text-muted">{hint}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => copy(url, label)}>
                      Copy Public Link
                    </Button>
                    <Link href={url.replace(publicUrl, "/live").replace("/live/live", "/live")} target="_blank">
                      <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />}>
                        Open
                      </Button>
                    </Link>
                  </div>
                </div>
                <p className="mt-1.5 truncate rounded-[9px] bg-[rgb(var(--c-surface-strong))] px-2.5 py-1.5 text-[11.5px] text-muted">
                  {url}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Broadcast status" subtitle="What the public sees right now" icon={<RefreshCw className="size-4.5" />} />
          <div className="space-y-2 px-5 pb-5">
            {[
              ["Current round", `${tournament.currentRound} of ${tournament.totalRounds}`],
              ["Boards live", String(live)],
              ["Standings published", "Yes"],
              ["Last synchronised", formatTime(new Date().toISOString())],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5">
                <span className="text-[12.5px] text-muted">{k}</span>
                <span className="text-[13px] font-semibold text-ink num">{v}</span>
              </div>
            ))}

            <div className="divide-y divide-line rounded-control bg-[rgb(var(--c-surface))] px-3.5">
              <Toggle checked onChange={() => undefined} label="Publish pairings" description="Show board assignments publicly." />
              <Toggle checked onChange={() => undefined} label="Publish results" description="Show verified scores publicly." />
              <Toggle checked onChange={() => undefined} label="Publish standings" description="Show the live ranking table." />
            </div>

            <Button
              variant="secondary"
              className="w-full"
              icon={<RefreshCw className="size-4" />}
              onClick={() =>
                store.toast({
                  title: "Public screens synchronised",
                  description: "The public website and TV displays now show the latest data.",
                  tone: "success",
                })
              }
            >
              Synchronise public screens
            </Button>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Publish an announcement"
            subtitle="Appears on the public site and the venue screens immediately"
            icon={<Megaphone className="size-4.5" />}
          />
          <div className="space-y-3.5 px-5 pb-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" required>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Round 6 begins at 14:15" />
              </Field>
              <Field label="Audience">
                <Select value={audience} onChange={(e) => setAudience(e.target.value)}>
                  {["All players", "Masters", "Open", "Recreational", "Novice", "Spectators"].map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Message" required>
              <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Keep it short — this is read from across the hall." />
            </Field>
            <Button variant="primary" icon={<Send className="size-4" />} disabled={!title.trim() || !body.trim()} onClick={publish}>
              Publish to public screens
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent announcements" icon={<Smartphone className="size-4.5" />} />
          <div className="space-y-1.5 px-4 pb-4">
            {announcements.slice(0, 5).map((a) => (
              <div key={a.id} className="rounded-control bg-[rgb(var(--c-surface))] px-3 py-2.5">
                <p className="text-[12.5px] font-semibold text-ink">{a.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[11.5px] text-muted">{a.body}</p>
                <p className="mt-1 text-[11px] text-faint">
                  {a.author} · {formatTime(a.publishedAt)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
