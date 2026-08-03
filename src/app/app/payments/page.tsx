"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, EmptyState } from "@/components/ui";
import { selectActiveEvent, useEventStore } from "@/lib/store/useEventStore";

/**
 * Receipt review for the active event.
 *
 * "Payments" in the sidebar used to open the finance dashboard — expenses,
 * profit and budget — which is a different job from checking whether money
 * arrived. A director looking to verify a receipt landed on a profit chart.
 * The two are now separate entries, and this one leads where its label says.
 */
export default function PaymentsRedirectPage() {
  const store = useEventStore();
  const router = useRouter();
  const event = selectActiveEvent(store);
  const eventId = event?.id;

  React.useEffect(() => {
    if (eventId) router.replace(`/app/events/${eventId}/payments`);
  }, [eventId, router]);

  if (eventId) return null;

  return (
    <Card>
      <EmptyState
        title="No event selected"
        description="Payments are reviewed per tournament. Choose one to open its receipt queue."
        action={
          <Button variant="primary" onClick={() => router.push("/app/events")}>
            Choose an event
          </Button>
        }
      />
    </Card>
  );
}
