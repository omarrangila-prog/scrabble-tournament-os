/**
 * Active event scope.
 *
 * Every event-owned record — registration, payment, pairing, certificate,
 * expense — belongs to exactly one event inside exactly one organization.
 * Reading any of them without naming the scope is how a screen ends up showing
 * one tournament's registrations under another tournament's title.
 *
 * The rule this module exists to enforce: a screen never filters by event id
 * inline. It asks for a scope, and the scope decides. When no event is
 * selected, the answer is an empty list — never "the first one", which is the
 * bug this replaces.
 */

/** Anything owned by an event. */
export interface EventScoped {
  eventId: string;
}

/** Anything owned by an organization. */
export interface OrgScoped {
  organizationId: string;
}

/**
 * The currently selected event, or nothing.
 *
 * `eventId` is null before an organizer picks an event and immediately after
 * the selected event is deleted. Both are ordinary states, not errors.
 */
export interface Scope {
  organizationId: string | null;
  eventId: string | null;
}

export const EMPTY_SCOPE: Scope = { organizationId: null, eventId: null };

/** True once a scope names an event and can be used to read event data. */
export function isResolved(scope: Scope): scope is { organizationId: string; eventId: string } {
  return scope.organizationId !== null && scope.eventId !== null;
}

/**
 * Filters event-owned records to the active scope.
 *
 * Returns an empty array when no event is selected. This is deliberate: a
 * screen with no scope must render its empty state, not silently fall back to
 * whichever event happens to sit first in the array.
 */
export function scoped<T extends EventScoped>(records: T[], scope: Scope): T[] {
  if (!isResolved(scope)) return [];
  return records.filter((r) => r.eventId === scope.eventId);
}

/** Filters organization-owned records, such as the event list itself. */
export function scopedToOrg<T extends OrgScoped>(records: T[], scope: Scope): T[] {
  if (!scope.organizationId) return [];
  return records.filter((r) => r.organizationId === scope.organizationId);
}

/**
 * Resolves the active event from a list.
 *
 * Returns undefined rather than a fallback when the id does not match — an
 * event that was deleted or belongs to another organization must read as
 * absent, so the caller shows "not found" instead of the wrong event.
 */
export function activeEvent<T extends OrgScoped & { id: string }>(
  events: T[],
  scope: Scope,
): T | undefined {
  if (!isResolved(scope)) return undefined;
  return events.find(
    (e) => e.id === scope.eventId && e.organizationId === scope.organizationId,
  );
}

/**
 * Whether a scope still points at something real.
 *
 * Called after the event list changes so a deleted event does not leave the
 * app pointing at an id that no longer exists.
 */
export function isStale<T extends OrgScoped & { id: string }>(
  events: T[],
  scope: Scope,
): boolean {
  if (!isResolved(scope)) return false;
  return activeEvent(events, scope) === undefined;
}

/** Data-loading state for a scoped screen. */
export type ScopeStatus = "no-selection" | "loading" | "ready" | "not-found";

/**
 * What a scoped screen should render right now.
 *
 * Screens branch on this rather than inventing their own combination of
 * hydrated, selected and found — three booleans that are easy to get subtly
 * wrong and produce a flash of the wrong event's data.
 */
export function scopeStatus<T extends OrgScoped & { id: string }>(
  events: T[],
  scope: Scope,
  hydrated: boolean,
): ScopeStatus {
  if (!hydrated) return "loading";
  if (!isResolved(scope)) return "no-selection";
  return activeEvent(events, scope) ? "ready" : "not-found";
}
