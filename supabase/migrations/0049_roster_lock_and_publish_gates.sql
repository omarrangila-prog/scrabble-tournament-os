-- Phase 1, unit C: the pairing-integrity gaps found by direct code inspection, each
-- verified against the live database before this migration existed and rebuilt here from
-- that same, already-proven design.
--
-- Four real problems:
--
--   1. No roster lock. Pairing has always read `checked_in_at is not null` live, at the
--      instant the button is pressed. A check-in during pairing generation changes who gets
--      paired, with nothing recorded afterward about who the tournament actually considered
--      present.
--
--   2. No round-completion gate. `staff_publish_round` never checked the previous round was
--      finished. A director could publish round 4 with round 3 still holding a disputed
--      board.
--
--   3. A player could be double-booked across columns — player_a on one board, player_b on
--      another, same round. The unique indexes on `games` only stop a repeat within the same
--      column; this was caught only in the browser.
--
--   4. Round history was never preserved. Once round 2 published, there was no record of
--      what round 1's pairings and standings actually said the moment it was finalized.
--
-- All four are additive. A normal publish, with a finished previous round and no lock in
-- place, behaves exactly as before.

-- ---------------------------------------------------------------------------
-- 1. Locking who is actually playing
-- ---------------------------------------------------------------------------
--
-- Deliberately soft: an event that never calls this — including every event that ran before
-- this migration — keeps working exactly as before. The check inside `staff_publish_round`
-- below only applies once a lock exists.

create or replace function public.staff_lock_active_players(
  p_event_id text,
  p_by text
)
returns table (out_locked_count integer, out_already_published boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_ids uuid[];
  v_published boolean;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

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

  update public.events
  set data = data || jsonb_build_object(
        'activePlayerIds', coalesce(to_jsonb(v_ids), '[]'::jsonb),
        'activePlayersLockedAt', now(),
        'activePlayersLockedBy', coalesce(nullif(trim(p_by), ''), 'unknown')
      )
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(trim(p_by), ''), 'unknown'), 'lock-active-players',
    jsonb_build_object('count', coalesce(array_length(v_ids, 1), 0))
  );

  return query select coalesce(array_length(v_ids, 1), 0), false;
end $$;

/**
 * The locked roster. Null means nothing has been locked yet — the caller falls back to the
 * live roster. Staff-checked even though it carries no contact detail: it is a list of
 * internal registration ids, and a signed-in account that never made staff has no legitimate
 * use for one.
 */
create or replace function public.staff_active_player_ids(p_event_id text)
returns uuid[]
language sql
security definer
stable
set search_path = public
as $$
  select case
    when not public.is_staff('org-federation') then null
    when data ? 'activePlayerIds'
      then array(select jsonb_array_elements_text(data -> 'activePlayerIds')::uuid)
    else null
  end
  from public.events
  where id = p_event_id;
$$;

revoke all on function public.staff_lock_active_players(text, text) from public, anon;
revoke all on function public.staff_active_player_ids(text) from public, anon;
grant execute on function public.staff_lock_active_players(text, text) to authenticated;
grant execute on function public.staff_active_player_ids(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Round snapshots — an immutable record of a finalized round
-- ---------------------------------------------------------------------------
--
-- Standings stay live-derived and remain the only source of truth for anything currently
-- displayed — that design decision is sound and stays. This answers a different question:
-- what did round 2's pairings and standings actually say the moment it was superseded,
-- before any later correction. Written once, read only by recovery/history screens.

create table if not exists public.round_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  event_id text not null references public.events (id) on delete restrict,
  round integer not null check (round > 0),
  kind text not null check (kind in ('pairings', 'standings')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  created_by text
);

create unique index if not exists round_snapshots_unique_idx
  on public.round_snapshots (event_id, round, kind);

alter table public.round_snapshots enable row level security;

drop policy if exists "staff read round snapshots" on public.round_snapshots;
create policy "staff read round snapshots"
  on public.round_snapshots for select
  using (public.is_staff(organization_id));

-- No insert policy: written only through `staff_snapshot_round`, which runs as this table's
-- owner. Never edited or deleted, for the same reason the audit log is not.

create or replace function public.staff_snapshot_round(
  p_event_id text,
  p_round integer,
  p_by text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_pairings jsonb;
  v_standings jsonb;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  -- Already snapshotted: do nothing rather than overwrite with a value that may have been
  -- affected by a correction made after the fact. The whole point of a snapshot is that it
  -- does not move.
  if exists (
    select 1 from public.round_snapshots
    where event_id = p_event_id and round = p_round and kind = 'pairings'
  ) then
    return;
  end if;

  select jsonb_agg(jsonb_build_object(
    'board', g.board, 'division', g.division,
    'playerA', ra.data ->> 'fullName', 'playerB',
    case when g.player_b is null then null else rb.data ->> 'fullName' end,
    'scoreA', g.score_a, 'scoreB', g.score_b, 'status', g.status
  ) order by g.board)
  into v_pairings
  from public.games g
  join public.records ra on ra.id = g.player_a
  left join public.records rb on rb.id = g.player_b
  where g.event_id = p_event_id and g.round = p_round;

  if v_pairings is null then
    -- Nothing was ever published for this round; nothing to preserve.
    return;
  end if;

  insert into public.round_snapshots (organization_id, event_id, round, kind, payload, created_by)
  values (v_org, p_event_id, p_round, 'pairings', v_pairings, coalesce(nullif(trim(p_by), ''), 'system'));

  select jsonb_agg(row_to_json(s)) into v_standings from public.event_standings(p_event_id) as s;

  insert into public.round_snapshots (organization_id, event_id, round, kind, payload, created_by)
  values (v_org, p_event_id, p_round, 'standings', coalesce(v_standings, '[]'::jsonb), coalesce(nullif(trim(p_by), ''), 'system'));

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(trim(p_by), ''), 'system'), 'snapshot-round',
    jsonb_build_object('round', p_round)
  );
end $$;

revoke all on function public.staff_snapshot_round(text, integer, text) from public, anon;
grant execute on function public.staff_snapshot_round(text, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Publishing a round — three checks added
-- ---------------------------------------------------------------------------

drop function if exists public.staff_publish_round(text, integer, jsonb);

create function public.staff_publish_round(
  p_event_id text,
  p_round integer,
  p_boards jsonb,
  p_by text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_played integer;
  v_count integer;
  v_unfinished integer;
  v_active uuid[];
  v_plan_players uuid[];
  v_stray integer;
  v_duplicate integer;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  if jsonb_typeof(p_boards) <> 'array' then
    raise exception 'Boards must be a JSON array';
  end if;

  select count(*) into v_played
  from public.games
  where event_id = p_event_id
    and round = p_round
    and (score_a is not null or score_b is not null);

  if v_played > 0 then
    raise exception
      'Round % already has % result(s). Clear them before re-pairing.', p_round, v_played;
  end if;

  -- (a) The previous round must be settled — every board verified, none disputed — before
  -- this one can publish. Skipped for round 1, which has no previous round.
  if p_round > 1 then
    select count(*) into v_unfinished
    from public.games
    where event_id = p_event_id
      and round = p_round - 1
      and status <> 'verified';

    if v_unfinished > 0 then
      raise exception
        'Round % still has % board(s) not verified. Resolve them before publishing round %.',
        p_round - 1, v_unfinished, p_round;
    end if;
  end if;

  select array_agg(distinct x.id) into v_plan_players
  from (
    select (b ->> 'playerA')::uuid as id from jsonb_array_elements(p_boards) as b
    union all
    select nullif(b ->> 'playerB', '')::uuid from jsonb_array_elements(p_boards) as b
  ) as x
  where x.id is not null;

  -- (b) Nobody appears as player_a in one board and player_b in another — the unique indexes
  -- on the table only stop a repeat within the same column. `v_duplicate` counts how many
  -- distinct players that is true of.
  select count(*) into v_duplicate
  from (
    select x.id
    from (
      select (b ->> 'playerA')::uuid as id from jsonb_array_elements(p_boards) as b
      union all
      select nullif(b ->> 'playerB', '')::uuid from jsonb_array_elements(p_boards) as b
    ) as x
    where x.id is not null
    group by x.id
    having count(*) > 1
  ) as dupes;

  if v_duplicate > 0 then
    raise exception 'Round % pairs the same player onto more than one board.', p_round;
  end if;

  -- (c) Only checked when a lock exists.
  v_active := public.staff_active_player_ids(p_event_id);
  if v_active is not null then
    select count(*) into v_stray
    from unnest(v_plan_players) as p
    where not (p = any(v_active));

    if v_stray > 0 then
      raise exception
        '% player(s) in round % are not on the locked active list.', v_stray, p_round;
    end if;
  end if;

  -- Finalize the round this one supersedes: an immutable record of what the pairings and
  -- standings actually said the moment play on it was complete.
  if p_round > 1 then
    perform public.staff_snapshot_round(p_event_id, p_round - 1, coalesce(p_by, 'system'));
  end if;

  delete from public.games where event_id = p_event_id and round = p_round;

  insert into public.games (
    organization_id, event_id, round, board, division, player_a, player_b
  )
  select
    v_org,
    p_event_id,
    p_round,
    (b ->> 'board')::integer,
    b ->> 'division',
    (b ->> 'playerA')::uuid,
    nullif(b ->> 'playerB', '')::uuid
  from jsonb_array_elements(p_boards) as b;

  select count(*) into v_count
  from public.games where event_id = p_event_id and round = p_round;

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(trim(p_by), ''), 'unknown'), 'publish-round',
    jsonb_build_object('round', p_round, 'boards', v_count)
  );

  return v_count;
end $$;

grant execute on function public.staff_publish_round(text, integer, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'staff_publish_round'
  ) then
    raise exception 'staff_publish_round is missing';
  end if;
  if (
    select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'staff_publish_round'
  ) <> 1 then
    raise exception 'staff_publish_round has more than one overload';
  end if;
  raise notice 'Phase 1 unit C applied: roster lock, round snapshots, publish-round gates.';
end $$;
