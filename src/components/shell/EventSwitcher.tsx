"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  selectActiveEvent,
  selectOrgEvents,
  useEventStore,
} from "@/lib/store/useEventStore";
import { EVENT_STATE_LABEL } from "@/lib/domain/events";
import { cn, formatDate } from "@/lib/utils";

/**
 * The active event, always visible and always switchable.
 *
 * Every scoped screen reads from this one selection, so it belongs in the
 * chrome rather than on a page: an organizer must be able to tell at a glance
 * which tournament they are looking at, without navigating anywhere to find
 * out.
 */
export function EventSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const store = useEventStore();
  const router = useRouter();

  const active = selectActiveEvent(store);
  const events = selectOrgEvents(store);

  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape, the way a menu is expected to behave.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (eventId: string) => {
    store.setActiveEvent(eventId);
    setOpen(false);
    router.push(`/app/events/${eventId}/payments`);
  };

  if (collapsed) {
    return (
      <button
        onClick={() => router.push("/app/events")}
        title={active ? active.name : "Select an event"}
        aria-label={active ? `Active event: ${active.name}` : "Select an event"}
        className="mx-auto grid size-10 place-items-center rounded-control border border-line bg-[rgb(var(--c-surface-soft))] text-[13px] font-extrabold text-primary transition-colors hover:bg-primary-050"
      >
        {active ? active.name.slice(0, 2).toUpperCase() : "—"}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative px-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex w-full items-center gap-2 rounded-control border border-line px-3 py-2.5 text-left transition-colors",
          "bg-[rgb(var(--c-surface-soft))] hover:bg-[rgb(var(--c-surface-strong))]",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint">
            Active event
          </span>
          <span className="block truncate text-[13.5px] font-bold text-ink">
            {active ? active.name : "No event selected"}
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute inset-x-3 top-[calc(100%+4px)] z-50 overflow-hidden rounded-feature border border-line bg-[rgb(var(--c-surface-strong))] shadow-[0_18px_44px_rgba(18,23,42,0.16)]"
        >
          <div className="max-h-[300px] overflow-y-auto p-1.5 scroll-slim">
            {events.length ? (
              events.map((e) => {
                const isActive = e.id === active?.id;
                return (
                  <button
                    key={e.id}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => choose(e.id)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-control px-3 py-2.5 text-left transition-colors",
                      isActive ? "bg-primary-050" : "hover:bg-[rgb(var(--c-surface-soft))]",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-[13px] font-semibold",
                          isActive ? "text-primary" : "text-ink",
                        )}
                      >
                        {e.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted">
                        {formatDate(e.startDate)} · {EVENT_STATE_LABEL[e.state]}
                      </span>
                    </span>
                    {isActive ? <Check className="mt-0.5 size-4 shrink-0 text-primary" /> : null}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-4 text-center text-[12.5px] text-muted">
                No events yet.
              </p>
            )}
          </div>

          {/*
               * Creating an event wrote it to browser storage only, so registrations
               * and games could never attach to it. Next year's event is a row in the
               * database, not a form here.
               */}
        </div>
      ) : null}
    </div>
  );
}
