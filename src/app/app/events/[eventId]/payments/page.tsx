"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import { useEventStore } from "@/lib/store/useEventStore";
import { activeEvent } from "@/lib/domain/scope";

/**
 * Payments for the active event.
 *
 * The existing screen still owns this work. This tab keeps the workspace
 * complete and routes through to it, so the organizer never loses the event
 * they are working in.
 */
export default function PaymentsPage() {
  const params = useParams<{ eventId: string }>();
  const store = useEventStore();
  const router = useRouter();

  const event = activeEvent(store.events, {
    organizationId: store.activeOrganizationId,
    eventId: params.eventId,
  });

  if (!event) return null;

  return (
    <Card>
      <EmptyState
        title="Payments"
        description="Receipt review, verification and payment status."
        action={
          <Button variant="primary" onClick={() => router.push("/app/events")}>
            Open Payments
            <ArrowRight className="size-4" />
          </Button>
        }
      />
    </Card>
  );
}
