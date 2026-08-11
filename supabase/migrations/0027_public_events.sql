-- Public event pages read the database, and only an open event can be registered for.
--
-- Three things were wrong at once.
--
-- First, `events.data` was empty for every row. The 23 August event's date, venue and fee
-- lived only in a TypeScript file, so anything asking the database what the event was got
-- nothing — which is why a certificate's own record carried no event date.
--
-- Second, the public pages resolved the slug against browser seed data. An event created
-- through the organizer's own form therefore had no public page and could take no
-- registrations: the button worked, the row appeared, and the event was unreachable.
--
-- Third, nothing but the user interface stopped a registration arriving for an event that
-- was closed, archived, or still a private draft. "Registration is closed" was a screen,
-- not a rule.

-- ---------------------------------------------------------------------------
-- The details, in the database
-- ---------------------------------------------------------------------------

/*
 * Backfilled from `src/lib/domain/eventSeed.ts`, which is where these were already
 * correct. Only the facts a public page and a receipt need: what it is, when, where, and
 * what it costs. The pricing rules and coupons stay in the application, which is the one
 * place they are applied.
 *
 * `||` rather than a replacement, so a value already in `data` wins and re-running this
 * cannot quietly undo an edit made since.
 */
update public.events
set data = jsonb_build_object(
      'startDate', '2026-08-23',
      'startTime', '12:00',
      'endTime', '15:30',
      'venueName', 'Chai Chatt, Habitt City',
      'venueAddress', 'Street No. 3, Karachi Memon Co-operative Housing Society, P.E.C.H.S., Karachi',
      'city', 'Karachi',
      'fee', 1250,
      'currency', 'PKR',
      'capacity', 0,
      'rounds', 5,
      'roundMinutes', 20
    ) || coalesce(data, '{}'::jsonb)
where id = 'evt-alphabattle-23-august';

-- ---------------------------------------------------------------------------
-- Reading one event, publicly
-- ---------------------------------------------------------------------------

/**
 * One event by the slug in its URL. No sign-in.
 *
 * Returns only events that are published and active, so a draft the organizer is still
 * writing stays invisible — the same rule the table's own policy applies, stated here as
 * well because this function is what the public site actually calls.
 *
 * Drafts return nothing rather than an error: "no such event" is the honest answer to a
 * link that is not live yet, and distinguishing the two would let anyone enumerate what an
 * organizer is planning.
 */
create or replace function public.public_event_by_slug(p_slug text)
returns table (
  out_id text,
  out_slug text,
  out_name text,
  out_subtitle text,
  out_state text,
  out_data jsonb
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return query
  select e.id, e.slug, e.name, e.subtitle, e.state, coalesce(e.data, '{}'::jsonb)
  from public.events e
  where lower(btrim(e.slug)) = lower(btrim(p_slug))
    and e.visibility = 'public'
    and e.status = 'active';
end $$;

grant execute on function public.public_event_by_slug(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Only an open event may be registered for
-- ---------------------------------------------------------------------------

/*
 * The user interface already refuses to show a closed form. That is a courtesy, not a
 * control: the insert policy accepted a registration for any event id at all, including
 * an archived one and a private draft, for anyone willing to call the API directly.
 *
 * Staff keep their own insert policy, so walk-ins at the desk are unaffected by the
 * phase — which is correct, because a walk-in is added by a person who can see the room.
 */
drop policy if exists "anyone may submit to open collections" on public.records;
create policy "anyone may submit to open collections"
  on public.records for insert
  with check (
    public.is_public_writable(collection)
    and status = 'active'
    and not (data ? 'verifiedBy')
    and not (data ? 'verifiedAt')
    and not (data ? 'finalLevel')
    and coalesce((data ->> 'confirmed')::boolean, false) = false
    and coalesce(data ->> 'paymentStatus', 'not-submitted') in
        ('not-submitted', 'receipt-uploaded', 'cash-at-venue')
    /*
     * And the event has to be open. A registration is an entry to something; there is no
     * such thing as one that belongs to nothing, or to an event that closed weeks ago.
     */
    and (
      event_id is null
      or exists (
        select 1 from public.events e
        where e.id = records.event_id
          and e.state = 'registration-open'
          and e.visibility = 'public'
          and e.status = 'active'
      )
    )
  );

do $$
declare
  v_id text;
  v_date text;
begin
  if not has_function_privilege('anon', 'public.public_event_by_slug(text)', 'execute') then
    raise exception 'anon cannot read a public event page';
  end if;

  select out_id, out_data ->> 'startDate'
    into v_id, v_date
    from public.public_event_by_slug('alphabattle-23-august');

  if v_id is null then
    raise exception 'The 23 August event is not readable publicly, so its page would be blank';
  end if;

  if v_date is null then
    raise exception 'The 23 August event still has no date in the database';
  end if;

  /* An archived event must not be readable. */
  if exists (select 1 from public.public_event_by_slug('game-on-8-august')) then
    raise exception 'An archived event is being served as a live public page';
  end if;

  /*
   * The open event must still accept a registration. This policy sits directly in front
   * of the one thing the event needs to do before the day, so it is asserted rather than
   * assumed.
   */
  if not exists (
    select 1 from public.events
    where id = 'evt-alphabattle-23-august'
      and state = 'registration-open'
      and visibility = 'public'
      and status = 'active'
  ) then
    raise exception 'The 23 August event would now reject registrations';
  end if;

  raise notice 'public events: details in the database, drafts hidden, only open events accept entries';
end $$;
