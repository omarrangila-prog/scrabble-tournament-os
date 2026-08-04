"use client";

/**
 * Public events, registration forms, discounts and guest registrations.
 *
 * Kept separate from `useIdentityStore` (which owns the internal player
 * identity ledger) because this store is the public face of the product: it is
 * read by unauthenticated visitors on the event page and written by guests who
 * have no account. Its records intentionally expose only opaque tokens.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  buildShareAssets,
  defaultForm,
  computeFee,
  Discount,
  EventState,
  FormField,
  generateToken,
  PublicEvent,
  QrToken,
  RegistrationForm,
  registrationStatusOf,
  slugify,
  TokenKind,
} from "../domain/events";
import { PaymentMethod, PlayerCategory } from "../domain/identity";
import {
  activeEvent as resolveActiveEvent,
  isStale,
  Scope,
  scoped,
  scopedToOrg,
  ScopeStatus,
  scopeStatus,
} from "../domain/scope";
import { buildEventSeed } from "../domain/eventSeed";

export const EVENT_STORAGE_KEY = "bluffy-events-v1";

/* -------------------------------------------------------------------------- */
/* Guest registration                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Payment status.
 *
 * Mirrors `PaymentStatus` in the payments engine so a review decision can be
 * recorded without translation. Every state except `verified` and
 * `complimentary` means money has not been confirmed as received.
 */
export type GuestPaymentStatus =
  | "not-submitted"
  | "receipt-uploaded"
  | "processing"
  | "review-required"
  | "verified"
  | "amount-mismatch"
  | "duplicate-transaction"
  | "invalid-receipt"
  | "rejected"
  | "partially-paid"
  | "complimentary"
  | "refunded";

export type GuestRegistrationStatus =
  | "submitted"
  | "under-review"
  | "approved"
  | "waitlisted"
  | "rejected";

/**
 * A registration made from the public form.
 *
 * `token` is the only identifier ever placed in a URL or shown to the
 * participant; `id` never leaves the organizer side.
 */
export interface GuestRegistration {
  id: string;
  token: string;
  eventId: string;

  fullName: string;
  email: string;
  mobile: string;
  dateOfBirth: string;
  city: string;
  club: string;

  experience: string;
  selfRating?: number;
  preferredDivision: PlayerCategory;
  previousEvents?: string;

  guardianName?: string;
  guardianPhone?: string;

  /** Answers to director-authored custom questions, keyed by field id. */
  answers: Record<string, string>;

  paymentMethod: PaymentMethod;
  paymentReference?: string;
  receiptFileName?: string;
  amountDue: number;
  discountCode?: string;
  discountAmount: number;
  currency: string;

  status: GuestRegistrationStatus;
  paymentStatus: GuestPaymentStatus;
  /** Division confirmed by the organizer; may differ from the preference. */
  confirmedDivision?: PlayerCategory;

  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  timeline: { at: string; by: string; entry: string }[];
}

/* -------------------------------------------------------------------------- */

interface EventState_ {
  hydrated: boolean;
  /**
   * The event every scoped screen reads from. Persisted, so a reload returns
   * the organizer to the event they were working in.
   */
  activeEventId: string | null;
  activeOrganizationId: string | null;
  events: PublicEvent[];
  forms: RegistrationForm[];
  discounts: Discount[];
  registrations: GuestRegistration[];
  tokens: QrToken[];
}

interface EventActions {
  /** Selects the event all scoped screens read from. */
  setActiveEvent: (eventId: string | null) => void;
  scope: () => Scope;
  status: () => ScopeStatus;

  createEvent: (draft: Omit<PublicEvent, "id" | "slug" | "createdAt" | "state">) => PublicEvent;
  updateEvent: (eventId: string, patch: Partial<PublicEvent>) => void;
  publishEvent: (eventId: string) => void;
  setEventState: (eventId: string, state: EventState) => void;

  updateForm: (eventId: string, patch: Partial<RegistrationForm>) => void;
  addField: (eventId: string, field: FormField) => void;
  removeField: (eventId: string, fieldId: string) => void;
  moveField: (eventId: string, fieldId: string, direction: -1 | 1) => void;

  addDiscount: (discount: Omit<Discount, "id" | "redemptions">) => void;
  toggleDiscount: (discountId: string) => void;

  /** Creates a registration from the public form. Returns the guest token. */
  submitRegistration: (
    input: Omit<
      GuestRegistration,
      "id" | "token" | "status" | "paymentStatus" | "submittedAt" | "timeline"
    >,
  ) => string;

  reviewRegistration: (
    registrationId: string,
    decision: GuestRegistrationStatus,
    by: string,
    note?: string,
    division?: PlayerCategory,
  ) => void;
  verifyPayment: (
    registrationId: string,
    status: GuestPaymentStatus,
    by: string,
    note?: string,
  ) => void;

  issueToken: (kind: TokenKind, eventId: string, subjectId?: string) => string;
  resolveToken: (token: string) => QrToken | undefined;
  revokeToken: (token: string) => void;

  resetEvents: () => void;
}

export type EventStore = EventState_ & EventActions;

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();

function freshState(): EventState_ {
  const seed = buildEventSeed();
  // A fresh install opens on the seeded event rather than no selection, so the
  // demo has something to show before the organizer creates anything.
  const first = seed.events[0];
  return {
    hydrated: false,
    activeEventId: first?.id ?? null,
    activeOrganizationId: first?.organizationId ?? null,
    events: seed.events,
    forms: seed.forms,
    discounts: seed.discounts,
    registrations: seed.registrations,
    tokens: seed.tokens,
  };
}

export const useEventStore = create<EventStore>()(
  persist(
    (set, get) => ({
      ...freshState(),

      /* ---- Scope ---------------------------------------------------- */

      setActiveEvent: (eventId) =>
        set((s) => {
          if (eventId === null) return { activeEventId: null };
          const event = s.events.find((e) => e.id === eventId);
          // Selecting an unknown event would leave the app pointing at nothing
          // while claiming a selection; ignore it instead.
          if (!event) return s;
          return {
            activeEventId: event.id,
            activeOrganizationId: event.organizationId,
          };
        }),

      scope: () => ({
        organizationId: get().activeOrganizationId,
        eventId: get().activeEventId,
      }),

      status: () => scopeStatus(get().events, get().scope(), get().hydrated),

      /* ---- Events -------------------------------------------------- */

      createEvent: (draft) => {
        const id = `evt-${uid()}`;
        const event: PublicEvent = {
          ...draft,
          id,
          slug: slugify(draft.name) || `event-${uid()}`,
          state: "draft",
          createdAt: now(),
        };
        set((s) => ({
          events: [event, ...s.events],
          forms: [defaultForm(id), ...s.forms],
          // Creating an event selects it. The organizer is taken straight into
          // its workspace and must never have to find it again.
          activeEventId: id,
          activeOrganizationId: event.organizationId,
        }));
        return event;
      },

      updateEvent: (eventId, patch) =>
        set((s) => ({
          events: s.events.map((e) =>
            e.id === eventId
              ? { ...e, ...patch, slug: patch.name ? slugify(patch.name) : e.slug }
              : e,
          ),
        })),

      publishEvent: (eventId) => {
        set((s) => ({
          events: s.events.map((e) =>
            e.id === eventId
              ? { ...e, state: "registration-open" as EventState, publishedAt: now() }
              : e,
          ),
        }));
        // Every published event gets its stable phase-aware QR token.
        const existing = get().tokens.find((t) => t.kind === "event" && t.eventId === eventId);
        if (!existing) get().issueToken("event", eventId);
      },

      setEventState: (eventId, state) =>
        set((s) => ({
          events: s.events.map((e) => (e.id === eventId ? { ...e, state } : e)),
        })),

      /* ---- Form builder --------------------------------------------- */

      updateForm: (eventId, patch) =>
        set((s) => ({
          forms: s.forms.map((f) =>
            f.eventId === eventId ? { ...f, ...patch, updatedAt: now() } : f,
          ),
        })),

      addField: (eventId, field) =>
        set((s) => ({
          forms: s.forms.map((f) =>
            f.eventId === eventId
              ? { ...f, fields: [...f.fields, field], updatedAt: now() }
              : f,
          ),
        })),

      removeField: (eventId, fieldId) =>
        set((s) => ({
          forms: s.forms.map((f) =>
            f.eventId === eventId
              ? {
                  ...f,
                  // Locked fields are structural; the event cannot run without them.
                  fields: f.fields.filter((x) => x.id !== fieldId || x.locked),
                  updatedAt: now(),
                }
              : f,
          ),
        })),

      moveField: (eventId, fieldId, direction) =>
        set((s) => ({
          forms: s.forms.map((f) => {
            if (f.eventId !== eventId) return f;
            const i = f.fields.findIndex((x) => x.id === fieldId);
            const j = i + direction;
            if (i === -1 || j < 0 || j >= f.fields.length) return f;
            const fields = [...f.fields];
            [fields[i], fields[j]] = [fields[j], fields[i]];
            return { ...f, fields, updatedAt: now() };
          }),
        })),

      /* ---- Discounts ------------------------------------------------ */

      addDiscount: (discount) =>
        set((s) => ({
          discounts: [{ ...discount, id: `disc-${uid()}`, redemptions: 0 }, ...s.discounts],
        })),

      toggleDiscount: (discountId) =>
        set((s) => ({
          discounts: s.discounts.map((d) =>
            d.id === discountId ? { ...d, active: !d.active } : d,
          ),
        })),

      /* ---- Registration --------------------------------------------- */

      submitRegistration: (input) => {
        const token = generateToken();
        const id = `reg-${uid()}`;
        const event = get().events.find((e) => e.id === input.eventId);
        const count = get().registrations.filter((r) => r.eventId === input.eventId).length;

        // Over capacity goes to the waiting list rather than being rejected.
        const overCapacity = event ? count >= event.capacity : false;
        const status: GuestRegistrationStatus =
          overCapacity && event?.waitingList ? "waitlisted" : "submitted";

        const paymentStatus: GuestPaymentStatus =
          input.amountDue === 0
            ? "complimentary"
            : input.receiptFileName
              ? "receipt-uploaded"
              : input.paymentMethod === "cash"
                ? "not-submitted"
                : "not-submitted";

        const registration: GuestRegistration = {
          ...input,
          id,
          token,
          status,
          paymentStatus,
          submittedAt: now(),
          timeline: [
            { at: now(), by: input.fullName, entry: "Registration submitted." },
            ...(input.receiptFileName
              ? [{ at: now(), by: input.fullName, entry: "Payment receipt uploaded." }]
              : []),
          ],
        };

        set((s) => ({
          registrations: [registration, ...s.registrations],
          tokens: [
            {
              token,
              kind: "participant" as TokenKind,
              eventId: input.eventId,
              subjectId: id,
              issuedAt: now(),
              revoked: false,
            },
            ...s.tokens,
          ],
          discounts: input.discountCode
            ? s.discounts.map((d) =>
                d.code === input.discountCode ? { ...d, redemptions: d.redemptions + 1 } : d,
              )
            : s.discounts,
        }));

        return token;
      },

      reviewRegistration: (registrationId, decision, by, note, division) =>
        set((s) => ({
          registrations: s.registrations.map((r) =>
            r.id === registrationId
              ? {
                  ...r,
                  status: decision,
                  confirmedDivision: division ?? r.confirmedDivision,
                  reviewedAt: now(),
                  reviewedBy: by,
                  reviewNote: note,
                  timeline: [
                    ...r.timeline,
                    {
                      at: now(),
                      by,
                      entry: `Registration ${decision}${note ? ` — ${note}` : ""}.`,
                    },
                  ],
                }
              : r,
          ),
        })),

      verifyPayment: (registrationId, status, by, note) =>
        set((s) => ({
          registrations: s.registrations.map((r) =>
            r.id === registrationId
              ? {
                  ...r,
                  paymentStatus: status,
                  timeline: [
                    ...r.timeline,
                    {
                      at: now(),
                      by,
                      entry: `Payment marked ${status.replace(/-/g, " ")}${note ? ` — ${note}` : ""}.`,
                    },
                  ],
                }
              : r,
          ),
        })),

      /* ---- Tokens ---------------------------------------------------- */

      issueToken: (kind, eventId, subjectId) => {
        const token = generateToken();
        set((s) => ({
          tokens: [
            { token, kind, eventId, subjectId, issuedAt: now(), revoked: false },
            ...s.tokens,
          ],
        }));
        return token;
      },

      resolveToken: (token) => {
        const t = get().tokens.find((x) => x.token === token);
        if (!t || t.revoked) return undefined;
        if (t.expiresAt && new Date(t.expiresAt) < new Date()) return undefined;
        return t;
      },

      revokeToken: (token) =>
        set((s) => ({
          tokens: s.tokens.map((t) => (t.token === token ? { ...t, revoked: true } : t)),
        })),

      resetEvents: () => set({ ...freshState(), hydrated: true }),
    }),
    {
      name: EVENT_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        const { hydrated, ...rest } = s as EventStore;
        void hydrated;
        return rest as unknown as EventStore;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.hydrated = true;
        // A persisted selection can outlive its event. Drop it rather than
        // leaving the app pointing at an id that resolves to nothing.
        if (isStale(state.events, { organizationId: state.activeOrganizationId, eventId: state.activeEventId })) {
          state.activeEventId = null;
          state.activeOrganizationId = null;
        }
      },
    },
  ),
);

/* -------------------------------------------------------------------------- */
/* Selectors                                                                   */
/* -------------------------------------------------------------------------- */

export const selectEventBySlug = (s: EventStore, slug: string) =>
  s.events.find((e) => e.slug === slug);

export const selectForm = (s: EventStore, eventId: string) =>
  s.forms.find((f) => f.eventId === eventId);

export const selectRegistrations = (s: EventStore, eventId: string) =>
  s.registrations.filter((r) => r.eventId === eventId);

/* -------------------------------------------------------------------------- */
/* Scoped selectors                                                            */
/* -------------------------------------------------------------------------- */

/*
 * Prefer these over the id-taking selectors above on any screen that follows
 * the active event. They return nothing when no event is selected, so a screen
 * shows its empty state rather than another event's data.
 */

/** The event every scoped screen is about, or undefined. */
export const selectActiveEvent = (s: EventStore) =>
  resolveActiveEvent(s.events, s.scope());

/** Events belonging to the active organization. */
export const selectOrgEvents = (s: EventStore) => scopedToOrg(s.events, s.scope());

export const selectScopedRegistrations = (s: EventStore) =>
  scoped(s.registrations, s.scope());

export const selectScopedForm = (s: EventStore) => scoped(s.forms, s.scope())[0];

/** Headline counts for the organizer review queue. */
export function registrationSummary(registrations: GuestRegistration[]) {
  return {
    total: registrations.length,
    approved: registrations.filter((r) => r.status === "approved").length,
    pending: registrations.filter((r) => r.status === "submitted" || r.status === "under-review")
      .length,
    waitlisted: registrations.filter((r) => r.status === "waitlisted").length,
    rejected: registrations.filter((r) => r.status === "rejected").length,

    paymentVerified: registrations.filter((r) => r.paymentStatus === "verified").length,
    paymentPending: registrations.filter(
      (r) =>
        r.paymentStatus === "receipt-uploaded" ||
        r.paymentStatus === "review-required" ||
        r.paymentStatus === "processing",
    ).length,
    paymentMissing: registrations.filter((r) => r.paymentStatus === "not-submitted").length,
    complimentary: registrations.filter((r) => r.paymentStatus === "complimentary").length,

    // Only verified payments count as money received.
    verifiedRevenue: registrations
      .filter((r) => r.paymentStatus === "verified")
      .reduce((sum, r) => sum + r.amountDue, 0),
    expectedRevenue: registrations.reduce((sum, r) => sum + r.amountDue, 0),
    totalDiscount: registrations.reduce((sum, r) => sum + r.discountAmount, 0),
  };
}

export { computeFee, registrationStatusOf, buildShareAssets };
