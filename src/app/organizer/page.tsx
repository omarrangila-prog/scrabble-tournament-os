"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button, Field, Input } from "@/components/ui";
import { currentOrganizer, signIn } from "@/lib/supabase/organizer";

const CREAM = "#F5F0E4";
const FOREST = "#2F5D3A";
const GOLD = "#C89B3C";
const BROWN = "#3E2F23";

/**
 * The one door in, and it opens onto the dashboard.
 *
 * Signing in used to land on a standalone participant list with its own layout and
 * no sidebar, so the organizer arrived at something that looked like a different
 * product and had no route to the rest of it. Now this screen does one thing —
 * establish who you are — and then hands you to `/app`, where every screen lives
 * behind one set of navigation.
 *
 * Someone already signed in is sent straight through rather than being asked again.
 */
export default function OrganizerSignInPage() {
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    let live = true;

    (async () => {
      const who = await currentOrganizer();
      if (!live) return;

      if (who) {
        router.replace("/app");
        return;
      }
      setChecking(false);
    })();

    return () => {
      live = false;
    };
  }, [router]);

  const submit = async () => {
    setError(null);
    setBusy(true);
    const outcome = await signIn(email, password);
    setBusy(false);

    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    router.replace("/app");
  };

  return (
    <main
      className="grid min-h-dvh place-items-center px-4 py-10"
      style={{ background: CREAM }}
    >
      <div className="w-full max-w-[400px]">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold"
          style={{ color: `${BROWN}A6` }}
        >
          <ArrowLeft className="size-3.5" />
          Public site
        </Link>

        <div
          className="rounded-2xl border bg-white/80 p-6 text-center"
          style={{ borderColor: `${BROWN}1A` }}
        >
          <p
            className="text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ color: GOLD }}
          >
            Organizer
          </p>
          <h1 className="mt-2 text-[24px] font-extrabold" style={{ color: BROWN }}>
            Sign in
          </h1>
          <p className="mt-1.5 text-[13.5px]" style={{ color: `${BROWN}A6` }}>
            Blufy&rsquo;s AlphaBattle · 23 August
          </p>

          {/*
            * Nothing is rendered behind this while the session is being checked, so
            * somebody already signed in never sees a form asking them to do it again.
            */}
          {checking ? (
            <p className="mt-6 text-[13px]" style={{ color: `${BROWN}99` }}>
              Checking your session…
            </p>
          ) : (
            <>
              <div className="mt-5 space-y-3.5 text-left">
                <Field label="Email or username">
                  <Input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
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
            </>
          )}
        </div>
      </div>
    </main>
  );
}
