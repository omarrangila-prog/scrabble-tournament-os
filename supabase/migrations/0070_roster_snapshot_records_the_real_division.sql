-- The roster snapshot records the category a player is actually paired in.
--
-- `staff_lock_active_players` read `data ->> 'division'` and fell back to 'open'. No
-- registration in this database has a 'division' key: the form writes 'preferredDivision'
-- and a director's correction writes 'confirmedDivision'. So every row of every snapshot
-- recorded 'open' — a category no event runs and no engine pairs.
--
-- The snapshot exists to answer one question after the fact: which category was this player
-- paired in during round two. It was answering "open" for all of them, which is the one
-- answer that is never true. Nothing downstream broke, because publishing reads the id array
-- and looks the division up live — which is exactly why this would have gone unnoticed until
-- somebody needed the history and found it blank.
--
-- Only the two division expressions change. The function's signature, its refusal once a
-- round exists, what it writes onto the event and what it returns are all left exactly as
-- they were: the client reads `out_locked_count` and `out_already_published`, and a snapshot
-- fix is no reason to touch either.

create or replace function public.division_for(p_level text)
returns text
language sql
immutable
set search_path = public
as $$
  /*
   * Plain language in, division id out.
   *
   * An unrecognised value becomes 'recreational' rather than nothing. Somebody who
   * registered and paid has to appear on the roster, and the middle division is a judgement
   * a director can correct — whereas dropping them is a person turned away at the door. This
   * mirrors `divisionFor` in src/lib/domain/roster.ts, which is what the pairing engine sees,
   * and the two must agree: a snapshot that classified players differently from the engine
   * that paired them would be worse than one saying 'open', because it would look right.
   */
  select case
    when lower(btrim(coalesce(p_level, ''))) like '%beginner%' then 'beginner'
    when lower(btrim(coalesce(p_level, ''))) like '%new%'      then 'beginner'
    when lower(btrim(coalesce(p_level, ''))) like '%advanced%' then 'advanced'
    when lower(btrim(coalesce(p_level, ''))) like '%regular%'  then 'advanced'
    else 'recreational'
  end
$$;

revoke all on function public.division_for(text) from public, anon;
grant execute on function public.division_for(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Whether anybody ever said, which is not the same as which category they are in.
--
-- `division_for` always answers, so the snapshot can never be blank and pairing can never be
-- blocked by a missing category. That is right for the engine and wrong for the desk: a
-- player filed as recreational because nobody asked is not the same as one filed as
-- recreational because they said so, and the desk is the only place that difference can be
-- settled.

alter table public.roster_entries
  add column if not exists division_stated boolean not null default true;

comment on column public.roster_entries.division_stated is
  'False when the category was inferred from a blank answer rather than stated at registration or set by a director.';

-- ---------------------------------------------------------------------------
-- The stated category, or nothing. One expression, used three times below.

create or replace function public.stated_division(p_data jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  /* A director's correction wins over what the player chose at registration. */
  select coalesce(
    nullif(btrim(coalesce(p_data ->> 'confirmedDivision', '')), ''),
    nullif(btrim(coalesce(p_data ->> 'preferredDivision', '')), '')
  )
$$;

revoke all on function public.stated_division(jsonb) from public, anon;
grant execute on function public.stated_division(jsonb) to authenticated;

-- ---------------------------------------------------------------------------

create or replace function public.staff_lock_active_players(p_event_id text, p_by text)
returns table (out_locked_count integer, out_already_published boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_ids uuid[];
  v_published boolean;
  v_actor text;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  v_actor := coalesce(nullif(btrim(coalesce(p_by, '')), ''), 'unknown');

  -- Once a round exists, the roster this tournament is running on is a fact of what has
  -- already been played, not something a second lock should quietly change underneath it.
  -- A player who arrives after this point is a late arrival, handled on its own terms.
  select exists(select 1 from public.games where event_id = p_event_id) into v_published;
  if v_published then
    return query select 0, true;
    return;
  end if;

  select array_agg(id) into v_ids
  from public.records
  where event_id = p_event_id
    and collection = 'registrations'
    and status = 'active'
    and checked_in_at is not null;

  /*
   * The snapshot. Replaced wholesale on a re-lock, which can only happen before any round
   * exists — after that the guard above has already returned.
   */
  delete from public.roster_entries where event_id = p_event_id;

  insert into public.roster_entries (
    organization_id, event_id, player_id, player_number, full_name, division,
    division_stated, checked_in_at, active_from_round, locked_by
  )
  select
    v_org,
    p_event_id,
    r.id,
    nullif(btrim(coalesce(r.data ->> 'playerNumber', '')), ''),
    coalesce(nullif(btrim(coalesce(r.data ->> 'fullName', '')), ''), 'Unnamed player'),
    public.division_for(public.stated_division(r.data)),
    public.stated_division(r.data) is not null,
    r.checked_in_at,
    1,
    v_actor
  from public.records r
  where r.event_id = p_event_id
    and r.collection = 'registrations'
    and r.status = 'active'
    and r.checked_in_at is not null;

  /* Still written, and still what publishing reads. The snapshot is proven before it is
     trusted, and the array goes when the readers move. */
  update public.events
  set data = data || jsonb_build_object(
        'activePlayerIds', coalesce(to_jsonb(v_ids), '[]'::jsonb),
        'activePlayersLockedAt', now(),
        'activePlayersLockedBy', v_actor
      )
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, v_actor, 'lock-active-players',
    jsonb_build_object(
      'count', coalesce(array_length(v_ids, 1), 0),
      /* What the lock actually captured, so the audit answers the division question too. */
      'byDivision', (
        select jsonb_object_agg(division, n)
        from (
          select division, count(*) as n
          from public.roster_entries
          where event_id = p_event_id
          group by division
        ) d
      ),
      'withoutStatedCategory', (
        select count(*) from public.roster_entries
        where event_id = p_event_id and not division_stated
      ))
  );

  return query select coalesce(array_length(v_ids, 1), 0), false;
end $$;

revoke all on function public.staff_lock_active_players(text, text) from public, anon;
grant execute on function public.staff_lock_active_players(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The reader gains the same column, so a screen can show what the lock captured.
-- Dropped first: `create or replace` cannot change an OUT-parameter shape.

drop function if exists public.staff_roster(text);

create function public.staff_roster(p_event_id text)
returns table (
  out_player_id text,
  out_player_number text,
  out_full_name text,
  out_division text,
  out_division_stated boolean,
  out_checked_in_at timestamptz,
  out_active_from_round integer,
  out_withdrawn_after_round integer,
  out_locked_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  return query
  select r.player_id::text, r.player_number, r.full_name, r.division, r.division_stated,
         r.checked_in_at, r.active_from_round, r.withdrawn_after_round, r.locked_at
  from public.roster_entries r
  where r.event_id = p_event_id
  order by r.division, r.player_number nulls last, r.full_name;
end $$;

revoke all on function public.staff_roster(text) from public, anon;
grant execute on function public.staff_roster(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Any snapshot already taken was filed under 'open'. Safe to re-derive: a lock is only
-- possible before a round exists, so nothing has been paired from these rows.

update public.roster_entries e
set division = public.division_for(public.stated_division(r.data)),
    division_stated = public.stated_division(r.data) is not null
from public.records r
where r.id = e.player_id
  and e.division = 'open';
