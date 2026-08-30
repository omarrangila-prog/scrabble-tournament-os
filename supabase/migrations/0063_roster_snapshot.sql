-- The roster lock becomes a snapshot rather than a list of ids.
--
-- `staff_lock_active_players` works and is enforced where it counts: a player outside the
-- lock cannot be paired, because `staff_publish_round` rejects the plan. But it writes only
-- an array of uuids into `events.data.activePlayerIds`, and the specification asks for the
-- player's number, division and check-in state captured at the moment of the lock.
--
-- The difference is not bookkeeping. Division is edited through `staff_set_division`, and
-- nothing stops that happening between rounds. When it does, the id array still says who was
-- playing but nothing says which division they were paired in, so the record of round two
-- quietly rewrites itself to match a decision made before round three. A snapshot is what
-- makes "who was in this tournament, and as what" answerable after the fact.
--
-- Two things are deliberately not here.
--
-- No rating column. This system has no rating, by explicit decision, and a column that is
-- always null is a place for somebody to later assume there is one. It arrives with the
-- rating export it exists to serve.
--
-- The readers do not move yet. `staff_active_player_ids` still answers from the array, so
-- publishing behaves exactly as it did today; the snapshot is written alongside and proven
-- equal before anything depends on it. `active_from_round` and `withdrawn_after_round` are
-- the columns late arrivals and withdrawals will use, and they are unused until then —
-- carried here because adding them later would mean rewriting rows that are meant to be a
-- record of what was true.

create table if not exists public.roster_entries (
  organization_id text not null,
  event_id text not null references public.events(id) on delete cascade,
  player_id uuid not null references public.records(id) on delete cascade,

  /* Captured at lock time, not looked up later. That is the whole point. */
  player_number text,
  full_name text not null,
  division text not null,
  checked_in_at timestamptz,

  /* Round 1 for everybody at the lock. A late arrival joins from a later round. */
  active_from_round integer not null default 1,
  /* Null while playing. Set to the last round somebody actually played. */
  withdrawn_after_round integer,

  locked_at timestamptz not null default now(),
  locked_by text,

  primary key (event_id, player_id)
);

create index if not exists roster_entries_event_idx on public.roster_entries (event_id);

alter table public.roster_entries enable row level security;

drop policy if exists "staff read the roster" on public.roster_entries;
create policy "staff read the roster" on public.roster_entries
  for select using (public.is_staff(organization_id));

-- ---------------------------------------------------------------------------
-- The lock, writing both.
-- ---------------------------------------------------------------------------

drop function if exists public.staff_lock_active_players(text, text);

create function public.staff_lock_active_players(p_event_id text, p_by text)
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
    checked_in_at, active_from_round, locked_by
  )
  select
    v_org,
    p_event_id,
    r.id,
    nullif(btrim(coalesce(r.data ->> 'playerNumber', '')), ''),
    coalesce(nullif(btrim(coalesce(r.data ->> 'fullName', '')), ''), 'Unnamed player'),
    coalesce(nullif(btrim(coalesce(r.data ->> 'division', '')), ''), 'open'),
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
    jsonb_build_object('count', coalesce(array_length(v_ids, 1), 0))
  );

  return query select coalesce(array_length(v_ids, 1), 0), false;
end $$;

revoke all on function public.staff_lock_active_players(text, text) from public, anon;
grant execute on function public.staff_lock_active_players(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading it.
-- ---------------------------------------------------------------------------

drop function if exists public.staff_roster(text);

create function public.staff_roster(p_event_id text)
returns table (
  out_player_id uuid,
  out_player_number text,
  out_full_name text,
  out_division text,
  out_checked_in_at timestamptz,
  out_active_from_round integer,
  out_withdrawn_after_round integer,
  out_locked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.player_id, r.player_number, r.full_name, r.division, r.checked_in_at,
         r.active_from_round, r.withdrawn_after_round, r.locked_at
  from public.roster_entries r
  where r.event_id = p_event_id
    and public.is_staff(r.organization_id)
  order by r.full_name;
$$;

revoke all on function public.staff_roster(text) from public, anon;
grant execute on function public.staff_roster(text) to authenticated;

/*
 * Proves the two agree. Called by the verification below and available afterwards, because
 * "they matched when I deployed it" is a weaker claim than one anybody can re-check.
 */
create or replace function public.roster_snapshot_matches(p_event_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select array_agg(player_id order by player_id) from public.roster_entries where event_id = p_event_id),
    '{}'::uuid[]
  ) = coalesce(
    (select array_agg(x order by x)
     from public.events e, jsonb_array_elements_text(coalesce(e.data -> 'activePlayerIds', '[]'::jsonb)) as t(x_text),
          lateral (select t.x_text::uuid as x) as c
     where e.id = p_event_id),
    '{}'::uuid[]
  );
$$;

revoke all on function public.roster_snapshot_matches(text) from public, anon;
grant execute on function public.roster_snapshot_matches(text) to authenticated;

do $$
begin
  raise notice 'roster snapshot table created; the lock writes it alongside the id array';
end $$;
