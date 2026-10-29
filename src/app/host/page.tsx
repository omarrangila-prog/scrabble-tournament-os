"use client";

import * as React from "react";
import { LogOut, RefreshCw } from "lucide-react";

import { MafiaTable } from "@/components/organizer/MafiaTable";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import {
  hostedEvents,
  listMafiaEntries,
  type HostedEvent,
  type StoredMafiaEntry,
} from "@/lib/supabase/mafia";
import { currentOrganizer, signIn, signOut } from "@/lib/supabase/organizer";

/**
 * The host's page: one event's sign-ups, and nothing else.
 *
 * For the person running a night who needs to see who has registered and paid and has no
 * business seeing the Scrabble tournament. Her account is not on the staff list at all — it is
 * a row in `event_hosts` — so there is no staff screen she could be refused on; the database
 * simply has nothing to give her but this event's list and its receipts. See
 * `0096_mafia_wars_and_event_hosts.sql`.
 *
 * Deliberately outside `/app`, which is the organiser's workspace, so she never lands in a
 * navigation full of screens that are not hers.
 */
type View =
  | { step: "checking" }
  | { step: "signed-out"; message?: string }
  | { step: "not-a-host"; email: string }
  | { step: "ready"; email: string; events: HostedEvent[] };

export default function HostPage() {
  const [view, setView] = React.useState<View>({ step: "checking" });

  /* Works out who is signed in and whether they host anything. */
  const resolve = React.useCallback(async (): Promise<View> => {
    const email = await currentOrganizer();
    if (!email) return { step: "signed-out" };
    const events = await hostedEvents();
    return events.length > 0
      ? { step: "ready", email, events }
      : { step: "not-a-host", email };
  }, []);

  React.useEffect(() => {
    let live = true;
    (async () => {
      const next = await resolve();
      if (live) setView(next);
    })();
    return () => {
      live = false;
    };
  }, [resolve]);

  if (view.step === "checking") {
    return (
      <Shell>
        <Card>
          <EmptyState
            title="One moment"
            description="Checking who is signed in."
          />
        </Card>
      </Shell>
    );
  }

  if (view.step === "signed-out") {
    return (
      <Shell>
        <SignInCard
          message={view.message}
          onSignedIn={async () => setView(await resolve())}
        />
      </Shell>
    );
  }

  if (view.step === "not-a-host") {
    return (
      <Shell>
        <Card>
          <EmptyState
            title="This account has no event to show"
            description={`${view.email} is signed in, but it is not set up as the host of an event. Please ask the organisers.`}
            action={
              <Button
                variant="secondary"
                onClick={async () => {
                  await signOut();
                  setView({ step: "signed-out" });
                }}
              >
                Sign out
              </Button>
            }
          />
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <HostedEvent
        event={view.events[0]}
        email={view.email}
        onSignOut={async () => {
          await signOut();
          setView({ step: "signed-out" });
        }}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[1000px] px-4 py-8 sm:px-6 sm:py-12">
      {children}
    </main>
  );
}

function SignInCard({
  message,
  onSignedIn,
}: {
  message?: string;
  onSignedIn: () => void | Promise<void>;
}) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(message ?? null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const outcome = await signIn(email, password);
    setBusy(false);
    if (!outcome.ok) {
      setProblem(outcome.message);
      return;
    }
    await onSignedIn();
  };

  const field =
    "mt-1.5 w-full rounded-control border border-line bg-[rgb(var(--c-surface))] px-3.5 py-3 text-[16px] outline-none focus:border-primary";

  return (
    <div className="mx-auto mt-10 w-full max-w-[420px]">
      <Card>
        <form onSubmit={submit} className="space-y-4 p-5 sm:p-6">
          <div>
            <h1 className="text-[22px] font-extrabold text-ink">
              Host sign-in
            </h1>
            <p className="mt-1 text-[13.5px] text-muted">
              Sign in to see who has registered for your event.
            </p>
          </div>

          <div>
            <label
              htmlFor="h-email"
              className="block text-[14px] font-semibold text-ink"
            >
              Username
            </label>
            <input
              id="h-email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className={field}
            />
          </div>

          <div>
            <label
              htmlFor="h-password"
              className="block text-[14px] font-semibold text-ink"
            >
              Password
            </label>
            <input
              id="h-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={field}
            />
          </div>

          {problem ? (
            <p className="rounded-control bg-critical-050 px-3.5 py-3 text-[13px] leading-relaxed text-critical">
              {problem}
            </p>
          ) : null}

          <Button type="submit" disabled={busy || !email.trim() || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function HostedEvent({
  event,
  email,
  onSignOut,
}: {
  event: HostedEvent;
  email: string;
  onSignOut: () => void | Promise<void>;
}) {
  const [entries, setEntries] = React.useState<StoredMafiaEntry[] | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  /* Bumped to ask for the list again: the button, and a gentle timer while the page is open. */
  const [reloads, setReloads] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    (async () => {
      const rows = await listMafiaEntries(event.id);
      if (live) setEntries(rows);
    })();
    return () => {
      live = false;
    };
  }, [event.id, reloads]);

  React.useEffect(() => {
    const id = window.setInterval(() => setReloads((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        title={event.name}
        subtitle={`Sign-ups, as they come in. Signed in as ${email}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setReloads((n) => n + 1)}
            >
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button variant="secondary" onClick={() => void onSignOut()}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        }
      />

      {problem ? (
        <p className="rounded-control bg-critical-050 px-3.5 py-3 text-[13px] text-critical">
          {problem}
        </p>
      ) : null}

      <MafiaTable entries={entries} onProblem={setProblem} />
    </div>
  );
}
