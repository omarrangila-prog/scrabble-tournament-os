"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Check, Copy, ExternalLink, ShieldAlert } from "lucide-react";

import { Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui";
import {
  DEFAULT_PUBLIC_COLUMNS,
  PUBLIC_COLUMNS,
  exposesPrivateColumns,
} from "@/lib/domain/publicRegistrations";
import { publicLinks } from "@/lib/domain/publicLinks";
import { readHits, type HitTotals } from "@/lib/supabase/publicHits";
import {
  saveLiveDefaultCategory,
  savePublicRegistrationSettings,
} from "@/lib/supabase/publicSettings";
import { useEventById } from "@/lib/supabase/useCurrentEvent";
import { useEventCategories } from "@/lib/supabase/useEventCategories";
import { useStaffRole } from "@/lib/supabase/useStaffRole";
import { cn } from "@/lib/utils";

/**
 * The addresses to hand out, and what they show.
 *
 * Every link is built here from the event, so nobody types a slug on the morning of the event.
 * The column list is the part with consequences: the registration table and the CSV are
 * readable by anybody holding the link, so what they contain is a director's decision, made on
 * purpose, with the personal columns marked and gated behind an explicit confirmation.
 */
export default function PublicLinksPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = decodeURIComponent(params.eventId ?? "");

  const { event, loaded, reload } = useEventById(eventId);
  const role = useStaffRole();
  const categories = useEventCategories(eventId);

  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const saved = event?.details.publicRegistrations;
  const savedColumns = React.useMemo(
    () => (saved?.columns?.length ? saved.columns : DEFAULT_PUBLIC_COLUMNS),
    [saved],
  );

  /* The in-progress choice, or null while the stored one is still what is shown. */
  const [draft, setDraft] = React.useState<{
    enabled: boolean;
    columns: string[];
  } | null>(null);
  const [confirmed, setConfirmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [hits, setHits] = React.useState<HitTotals[] | null>(null);

  React.useEffect(() => {
    let live = true;
    void (async () => {
      if (!role.isDirector) return;
      const rows = await readHits(eventId);
      if (live) setHits(rows);
    })();
    return () => {
      live = false;
    };
  }, [eventId, role.isDirector]);

  if (!loaded)
    return <p className="py-10 text-center text-[14px] text-muted">Loading…</p>;

  if (!event) {
    return (
      <Card>
        <EmptyState
          title="Event not found"
          description="This event may have been deleted."
        />
      </Card>
    );
  }

  const links = publicLinks(origin, event.slug);
  const enabled = draft?.enabled ?? saved?.enabled !== false;
  const columns = draft?.columns ?? savedColumns;
  const dirty = draft !== null;
  const wantsPrivate = exposesPrivateColumns(columns);
  const wasPrivate = exposesPrivateColumns(savedColumns);
  /* Turning a personal column on needs a second, deliberate tick. Leaving one on does not. */
  const needsConfirm = wantsPrivate && !wasPrivate;

  const toggleColumn = (key: string) => {
    const next = columns.includes(key)
      ? columns.filter((c) => c !== key)
      : [...columns, key];
    /* Kept in the order the list is written in, so the table reads the same however it was ticked. */
    const ordered = PUBLIC_COLUMNS.map((c) => c.key).filter((k) =>
      next.includes(k),
    );
    setDraft({ enabled, columns: ordered });
    setConfirmed(false);
    setMessage(null);
  };

  const copy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
    } catch {
      setMessage({
        ok: false,
        text: "Could not copy. Select the address and copy it by hand.",
      });
    }
  };

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setMessage(null);
    const result = await savePublicRegistrationSettings({
      eventId,
      enabled: draft.enabled,
      columns: draft.columns,
    });
    setBusy(false);

    if (!result.ok) {
      setMessage({ ok: false, text: result.message });
      return;
    }
    setDraft(null);
    setConfirmed(false);
    setMessage({
      ok: true,
      text: "Saved. The public list and the CSV change immediately.",
    });
    reload();
  };

  const rows: {
    id: string;
    title: string;
    description: string;
    url: string;
    copy: string;
    open: string;
  }[] = [
    {
      id: "live",
      title: "Live results",
      description: "Standings, pairings and results for a phone. No sign-in.",
      url: links.live,
      copy: "Copy live results link",
      open: "Open",
    },
    {
      id: "registrations",
      title: "Public registration table",
      description: "Search, sort and filter the registration list as a table.",
      url: links.registrations,
      copy: "Copy public registration table",
      open: "Open",
    },
    {
      id: "csv",
      title: "Registration CSV",
      description:
        "The same list, regenerated from the database every time it is opened.",
      url: links.csv,
      copy: "Copy CSV link",
      open: "Open",
    },
    {
      id: "tv",
      title: "TV pairings",
      description:
        "Large current pairings for the venue screen, pinned to this event.",
      url: links.tv,
      copy: "Copy TV link",
      open: "Open TV pairings",
    },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Public links"
          subtitle="Copy these. Nobody should have to type an address."
        />
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            >
              <div className="min-w-0 flex-1 basis-64">
                <p className="text-[14.5px] font-bold text-ink">{r.title}</p>
                <p className="text-[12.5px] text-muted">{r.description}</p>
                <p className="mt-1 break-all font-mono text-[12px] text-faint">
                  {r.url}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => void copy(r.id, r.url)}
                >
                  {copied === r.id ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  {copied === r.id ? "Copied" : r.copy}
                </Button>
                <a href={r.url} target="_blank" rel="noreferrer">
                  <Button variant="secondary">
                    <ExternalLink className="size-4" />
                    {r.open}
                  </Button>
                </a>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="What the public registration list shows"
          subtitle="Applies to the table and the CSV alike. Anybody holding the link can read it."
          action={
            <Badge tone={enabled ? "success" : "neutral"}>
              {enabled ? "On" : "Off"}
            </Badge>
          }
        />

        <div className="space-y-4 px-5 pb-5">
          {!role.isDirector ? (
            <p className="rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-[13px] text-muted">
              Only a director can change this. You can see what is currently
              shown.
            </p>
          ) : null}

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!role.isDirector}
              onChange={(e) => {
                setDraft({ enabled: e.target.checked, columns });
                setMessage(null);
              }}
              className="size-5 accent-primary"
            />
            <span className="text-[14px] font-semibold text-ink">
              Public registration list and CSV are switched on
            </span>
          </label>

          <fieldset
            className="grid gap-2 sm:grid-cols-2"
            disabled={!role.isDirector}
          >
            <legend className="sr-only">Columns</legend>
            {PUBLIC_COLUMNS.map((c) => (
              <label
                key={c.key}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-control border px-3 py-2.5",
                  columns.includes(c.key)
                    ? "border-primary bg-primary-050"
                    : "border-line",
                  c.private && "border-dashed",
                )}
              >
                <input
                  type="checkbox"
                  checked={columns.includes(c.key)}
                  onChange={() => toggleColumn(c.key)}
                  className="size-4.5 accent-primary"
                />
                <span className="min-w-0 text-[14px] font-semibold text-ink">
                  {c.label}
                  {c.private ? (
                    <span className="ml-2 text-[11.5px] font-bold uppercase tracking-wide text-critical">
                      Personal
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </fieldset>

          <p className="text-[12.5px] leading-relaxed text-muted">
            Payment proofs, internal notes, check-in codes and private ids are
            never available here, whatever is ticked.
          </p>

          {wantsPrivate ? (
            <div className="flex items-start gap-2.5 rounded-control bg-critical-050 px-3.5 py-3 text-[13px] leading-relaxed text-critical">
              <ShieldAlert className="mt-0.5 size-4.5 shrink-0" />
              <div>
                <p className="font-bold">
                  Phone numbers or email addresses will be public.
                </p>
                <p>
                  Anybody with the link — and anybody they forward it to — can
                  read them. Turn these on only for a controlled export, and off
                  again afterwards.
                </p>
                {needsConfirm ? (
                  <label className="mt-2 flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="mt-0.5 size-4.5 accent-critical"
                    />
                    <span className="font-semibold">
                      I understand, and I want this public.
                    </span>
                  </label>
                ) : null}
              </div>
            </div>
          ) : null}

          {message ? (
            <p
              className={cn(
                "rounded-control px-3.5 py-3 text-[13px]",
                message.ok
                  ? "bg-success-050 text-[#12855c]"
                  : "bg-critical-050 text-critical",
              )}
            >
              {message.text}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={
                !dirty ||
                busy ||
                !role.isDirector ||
                columns.length === 0 ||
                (needsConfirm && !confirmed)
              }
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
            {dirty ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft(null);
                  setConfirmed(false);
                  setMessage(null);
                }}
              >
                Discard
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Live results opens on"
          subtitle="The category a phone shows first. People can still change it."
        />
        <div className="px-5 pb-5">
          <select
            value={event.details.liveDefaultCategory || "all"}
            disabled={!role.canResults}
            onChange={async (e) => {
              const result = await saveLiveDefaultCategory(
                eventId,
                e.target.value,
              );
              setMessage(
                result.ok
                  ? { ok: true, text: "Saved." }
                  : { ok: false, text: result.message },
              );
              if (result.ok) reload();
            }}
            className="w-full max-w-xs rounded-control border border-line bg-[rgb(var(--c-surface))] px-3 py-2.5 text-[15px] outline-none focus:border-primary"
          >
            <option value="all">All categories</option>
            {categories.categories.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </Card>
      {role.isDirector ? (
        <Card>
          <CardHeader
            title="How the public pages are used"
            subtitle="Counts only, no names. Page views count once per visit."
          />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
            {(
              [
                ["results_view", "Opened the results page"],
                ["certificate_view", "Opened a certificate page"],
                ["certificate_download", "Downloaded a certificate"],
                ["odoovations_click", "Clicked the Odoovations link"],
              ] as const
            ).map(([kind, label]) => {
              const row = hits?.find((h) => h.kind === kind);
              return (
                <div
                  key={kind}
                  className="rounded-control border border-line px-4 py-3"
                >
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                    {label}
                  </p>
                  <p className="mt-1 text-[24px] font-bold">
                    {hits ? (row?.total ?? 0) : "…"}
                  </p>
                  <p className="text-[12px] text-muted">
                    {hits ? `${row?.today ?? 0} today` : ""}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="px-5 pb-5 text-[12px] text-muted">
            Counting started when this was added; earlier visits were not
            recorded. A certificate opened from inside a downloaded PDF cannot
            be counted.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
