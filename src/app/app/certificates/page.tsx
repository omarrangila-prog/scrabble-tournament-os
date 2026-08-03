"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, EmptyState } from "@/components/ui";
import { selectActiveEvent, useEventStore } from "@/lib/store/useEventStore";

/**
 * Certificates belong to an event, so this redirects into the active one.
 *
 * There used to be a second, standalone certificate screen here. It predated
 * the Certificate Studio and lacked its guards — no citation evidence, no check
 * for claims the record cannot support — so a director reaching certificates
 * through the sidebar got weaker tooling than one reaching them through the
 * workspace. Two screens doing the same job is how that divergence happens, so
 * there is now one.
 */
export default function CertificatesRedirectPage() {
  const store = useEventStore();
  const router = useRouter();
  const event = selectActiveEvent(store);
  const eventId = event?.id;

  React.useEffect(() => {
    if (eventId) router.replace(`/app/events/${eventId}/awards`);
  }, [eventId, router]);

  if (eventId) return null;

  return (
    <Card>
      <EmptyState
        title="No event selected"
        description="Certificates are issued for a specific tournament. Choose one to open its Certificate Studio."
        action={
          <Button variant="primary" onClick={() => router.push("/app/events")}>
            Choose an event
          </Button>
        }
      />
    </Card>
  );
}
