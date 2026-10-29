"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/shell/AppShell";
import { hostedEvents } from "@/lib/supabase/mafia";
import { supabase } from "@/lib/supabase/client";

/**
 * A host account is not staff, so there is nothing for it in the workspace: every list would
 * load empty and every button would be refused. Sending it to its own page is kindness rather
 * than protection — the database already gives it nothing here — and it is the difference
 * between a host seeing her event and seeing a dashboard that looks broken.
 *
 * Staff are never affected: the check only fires for an account with no staff role at all.
 */
function HostRedirect() {
  const router = useRouter();

  React.useEffect(() => {
    let live = true;
    (async () => {
      const db = supabase();
      if (!db) return;
      const { data: role } = await db.rpc("staff_role", {
        org: "org-federation",
      });
      if (!live || role) return;
      if ((await hostedEvents()).length > 0 && live) router.replace("/host");
    })();
    return () => {
      live = false;
    };
  }, [router]);

  return null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HostRedirect />
      <AppShell>{children}</AppShell>
    </>
  );
}
