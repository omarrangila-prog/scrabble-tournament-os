-- Creating an event, for real.
--
-- The old form wrote a tournament to browser storage and reported it created
-- successfully. Nothing could ever attach to it: registrations and games are rows keyed
-- by an event id in Postgres, and that event did not exist there. The button worked and
-- the event did not.
--
-- This is the row. The details a public page needs — date, venue, fee, capacity,
-- rounds — go in `data`, which is where the 23 August event's details already live, so
-- a created event is the same shape as the one that works rather than a lesser kind.

create or replace function public.staff_create_event(
  p_slug text,
  p_name text,
  p_subtitle text,
  p_data jsonb
)
returns table (out_id text, out_slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_id text;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'The event needs a name';
  end if;

  /*
   * The slug is normalised here rather than trusted.
   *
   * It becomes part of a public URL, so "Blufy's AlphaBattle 2027" has to become
   * something that survives being typed, shared and put in a QR code. Doing it in the
   * database means every route in — a form now, an import later — gets the same answer.
   */
  v_slug := lower(trim(coalesce(nullif(trim(p_slug), ''), p_name)));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);

  if v_slug = '' then
    raise exception 'The name has no letters or numbers to make a link from';
  end if;

  if exists (select 1 from public.events where slug = v_slug) then
    raise exception 'An event already uses the link /events/%', v_slug;
  end if;

  v_id := 'evt-' || v_slug;

  if exists (select 1 from public.events where id = v_id) then
    raise exception 'An event with that identifier already exists';
  end if;

  /*
   * Created as a draft and private.
   *
   * A new event must not appear on the public site the moment it is named. The
   * organizer opens registration deliberately, once the date, fee and payment details
   * are right — the same reason the phase is a separate control rather than a side
   * effect.
   */
  insert into public.events (
    id, organization_id, slug, name, subtitle, data, visibility, state, status
  )
  values (
    v_id,
    'org-federation',
    v_slug,
    trim(p_name),
    nullif(trim(coalesce(p_subtitle, '')), ''),
    coalesce(p_data, '{}'::jsonb),
    'private',
    'draft',
    'active'
  );

  return query select v_id, v_slug;
end $$;

/**
 * Every event this organization has, for staff.
 *
 * Includes drafts, which is the point: an organizer needs to see the event they are
 * still setting up. The public site reads the published ones through its own path.
 */
create or replace function public.staff_events()
returns table (
  out_id text,
  out_slug text,
  out_name text,
  out_subtitle text,
  out_state text,
  out_visibility text,
  out_status text,
  out_data jsonb,
  out_created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_staff('org-federation') then
    return;
  end if;

  return query
  select e.id, e.slug, e.name, e.subtitle, e.state, e.visibility, e.status, e.data, e.created_at
  from public.events e
  where e.organization_id = 'org-federation'
    and e.status <> 'deleted'
  order by e.created_at desc;
end $$;

/**
 * Publishes or unpublishes an event.
 *
 * Separate from creation, and from the phase. Making an event visible is a decision
 * about whether strangers can see it; the phase is about what they are shown. Merging
 * them would mean an organizer could not prepare a page without exposing it.
 */
create or replace function public.staff_set_event_visibility(
  p_event_id text,
  p_visibility text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visibility text;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  if p_visibility not in ('public', 'private') then
    raise exception 'Visibility must be public or private';
  end if;

  update public.events
  set visibility = p_visibility,
      updated_at = now()
  where id = p_event_id
  returning visibility into v_visibility;

  if v_visibility is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  return v_visibility;
end $$;

revoke all on function public.staff_create_event(text, text, text, jsonb) from public, anon;
revoke all on function public.staff_events() from public, anon;
revoke all on function public.staff_set_event_visibility(text, text) from public, anon;

grant execute on function public.staff_create_event(text, text, text, jsonb) to authenticated;
grant execute on function public.staff_events() to authenticated;
grant execute on function public.staff_set_event_visibility(text, text) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.staff_create_event(text, text, text, jsonb)', 'execute') then
    raise exception 'anon can create events';
  end if;

  if has_function_privilege('anon', 'public.staff_events()', 'execute') then
    raise exception 'anon can list events including drafts';
  end if;

  raise notice 'event creation is staff-only';
end $$;
