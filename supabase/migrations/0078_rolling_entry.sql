-- Rolling entry: a running round accepts new matches, and never loses existing ones.
--
-- Migration 0075 made START ROUND a freeze — nothing about the round could change afterwards.
-- That protected the right thing by the wrong means. What must never happen is a match that
-- has started being reshuffled: its players moved, its board taken, the whole round drawn
-- again around a newcomer. What can perfectly well happen is a *new* match being added
-- alongside — two late arrivals in the same category, at a free table in that category's
-- range, playing with whatever time is left on the official round clock.
--
-- So the rule becomes: a round is a time window. Starting it starts the clock and fixes every
-- match already on it. Until END ROUND is pressed, the unpaired may still be paired, and only
-- the unpaired. `staff_publish_round` keeps refusing to re-draw a started round, because that
-- is the reshuffle. `staff_append_match` is the one door left open, and it can only add.
--
-- Two facts recorded per board so the history says who joined late: `added_after_round_start`
-- and `started_at`. A late match does not get its own timer. It ends when the round ends.

alter table public.games
  add column if not exists added_after_round_start boolean not null default false,
  add column if not exists started_at timestamptz;

comment on column public.games.added_after_round_start is
  'True for a match appended to a round that had already started. Its time is whatever was left.';
comment on column public.games.started_at is
  'When this board actually began. Null on boards published before the round started, which began with the round.';

-- ---------------------------------------------------------------------------
-- Who in this round has nobody to play: eligible, checked in, on no board.

create or replace function public.staff_waiting_players(p_event_id text, p_round integer)
returns table (out_player_id uuid, out_full_name text, out_player_number text, out_division text, out_checked_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_eligible uuid[];
begin
  if not (public.can_desk('org-federation') or public.can_results('org-federation')) then
    return;
  end if;

  v_eligible := public.staff_eligible_player_ids(p_event_id, p_round);
  if v_eligible is null then
    return;
  end if;

  return query
  select r.id,
         coalesce(nullif(btrim(coalesce(r.data ->> 'fullName', '')), ''), 'Unnamed player'),
         nullif(btrim(coalesce(r.data ->> 'playerNumber', '')), ''),
         public.division_for(public.stated_division(r.data)),
         r.checked_in_at
  from public.records r
  where r.id = any (v_eligible)
    and r.checked_in_at is not null
    and r.status = 'active'
    and not exists (
      select 1 from public.games g
      where g.event_id = p_event_id and g.round = p_round
        and (g.player_a = r.id or g.player_b = r.id)
    )
  order by r.checked_in_at, r.id;
end $$;

revoke all on function public.staff_waiting_players(text, integer) from public, anon;
grant execute on function public.staff_waiting_players(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- The first free table in a category's range, or null when the range is full.

create or replace function public.free_table_for(p_event_id text, p_round integer, p_division text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with range as (
    select (r ->> 'from')::integer as lo, (r ->> 'to')::integer as hi
    from jsonb_array_elements(public.event_table_plan(p_event_id)) as r
    where r ->> 'division' = p_division
    limit 1
  ),
  taken as (
    select board from public.games
    where event_id = p_event_id and round = p_round and player_b is not null
  )
  select t
  from range, generate_series(range.lo, range.hi) as t
  where t not in (select board from taken)
  order by t
  limit 1;
$$;

revoke all on function public.free_table_for(text, integer, text) from public, anon;
grant execute on function public.free_table_for(text, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Appending one match to a round that is already running.

create or replace function public.staff_append_match(
  p_event_id text,
  p_round integer,
  p_player_a uuid,
  p_player_b uuid,
  p_by text default null
)
returns table (out_game_id uuid, out_board integer, out_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_actor text;
  v_div_a text;
  v_div_b text;
  v_board integer;
  v_eligible uuid[];
  v_timer public.round_timers;
  v_id uuid;
  v_first boolean;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  v_actor := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'unknown');

  if p_player_a = p_player_b then
    return query select null::uuid, null::integer, 'A player cannot be paired against themselves.'::text;
    return;
  end if;

  /*
   * The round has to exist and still be open.
   *
   * No boards means nothing has been published, and the right tool is publishing. An ended
   * round is closed to new matches — that is what END ROUND means — and anybody arriving
   * after it joins the next round.
   */
  if not exists (select 1 from public.games where event_id = p_event_id and round = p_round) then
    return query select null::uuid, null::integer,
      format('Round %s has not been published yet. Publish it first, then late arrivals can be added.', p_round)::text;
    return;
  end if;

  select * into v_timer from public.round_timers where event_id = p_event_id and round = p_round;
  if v_timer.ended_at is not null then
    return query select null::uuid, null::integer,
      format('Round %s has ended. This player joins round %s.', p_round, p_round + 1)::text;
    return;
  end if;

  /* Both must be eligible for this round — on the roster and checked in. */
  v_eligible := public.staff_eligible_player_ids(p_event_id, p_round);
  if v_eligible is not null and not (p_player_a = any (v_eligible) and p_player_b = any (v_eligible)) then
    return query select null::uuid, null::integer,
      'One of these players is not on the active roster for this round. Add them as a late arrival first.'::text;
    return;
  end if;

  /* Neither may already be on a board this round. This is the rule that protects live matches. */
  if exists (
    select 1 from public.games
    where event_id = p_event_id and round = p_round
      and (player_a in (p_player_a, p_player_b) or player_b in (p_player_a, p_player_b))
  ) then
    return query select null::uuid, null::integer,
      'One of these players is already on a board this round. Existing matches are not changed.'::text;
    return;
  end if;

  /* Same category, always. A director wanting otherwise does it by hand, on the record. */
  select public.division_for(public.stated_division(data)) into v_div_a from public.records where id = p_player_a;
  select public.division_for(public.stated_division(data)) into v_div_b from public.records where id = p_player_b;

  if v_div_a is distinct from v_div_b then
    return query select null::uuid, null::integer,
      format('%s and %s are different categories. Categories play separately.', v_div_a, v_div_b)::text;
    return;
  end if;

  /* A free table inside this category's range, never one somebody is sitting at. */
  v_board := public.free_table_for(p_event_id, p_round, v_div_a);
  if v_board is null then
    return query select null::uuid, null::integer,
      format('No free table in the %s range. Waiting for a table.', v_div_a)::text;
    return;
  end if;

  /*
   * Who goes first: whichever of the two has gone first less often so far. On a first game
   * for both, the earlier arrival, which is at least a rule people can see.
   */
  select (
    (select count(*) from public.games where event_id = p_event_id and player_a = p_player_a and a_plays_first)
    + (select count(*) from public.games where event_id = p_event_id and player_b = p_player_a and a_plays_first = false)
  ) <= (
    (select count(*) from public.games where event_id = p_event_id and player_a = p_player_b and a_plays_first)
    + (select count(*) from public.games where event_id = p_event_id and player_b = p_player_b and a_plays_first = false)
  ) into v_first;

  insert into public.games (
    organization_id, event_id, round, board, division, player_a, player_b,
    a_plays_first, pairing_reason, added_after_round_start, started_at
  )
  values (
    v_org, p_event_id, p_round, v_board, v_div_a, p_player_a, p_player_b,
    v_first,
    case
      when v_timer.started_at is null then 'Paired late, before the round started.'
      else format('Paired late, %s minutes into round %s. Plays to the round clock.',
                  greatest(0, floor(extract(epoch from now() - v_timer.started_at) / 60))::integer, p_round)
    end,
    v_timer.started_at is not null,
    case when v_timer.started_at is not null then now() else null end
  )
  returning id into v_id;

  perform public.write_audit_log(
    v_org, p_event_id, v_actor, 'append-late-match',
    jsonb_build_object(
      'round', p_round, 'board', v_board, 'division', v_div_a,
      'playerA', p_player_a, 'playerB', p_player_b,
      'roundStartedAt', v_timer.started_at,
      'minutesIntoRound', case when v_timer.started_at is null then null
        else floor(extract(epoch from now() - v_timer.started_at) / 60)::integer end));

  return query select v_id, v_board,
    format('Table %s. They play to the round clock.', v_board)::text;
end $$;

revoke all on function public.staff_append_match(text, integer, uuid, uuid, text) from public, anon;
grant execute on function public.staff_append_match(text, integer, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A late arrival may join the round that is running, not only the next one.
--
-- `staff_add_late_player` put everybody late into round max+1. Under rolling entry the desk
-- chooses: join now, or start next round. Same function, one more argument, same default —
-- so every existing caller keeps its behaviour.

drop function if exists public.staff_add_late_player(text, uuid, text);

create function public.staff_add_late_player(
  p_event_id text,
  p_registration_id uuid,
  p_by text default null,
  p_join_current boolean default false
)
returns table (out_from_round integer, out_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_published integer;
  v_from integer;
  v_rec public.records;
  v_existing integer;
  v_actor text;
  v_locked boolean;
  v_ended boolean;
begin
  if not (public.can_desk('org-federation') or public.can_results('org-federation')) then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  v_actor := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'unknown');

  select exists(select 1 from public.roster_entries where event_id = p_event_id) into v_locked;
  if not v_locked then
    return query select null::integer,
      'The roster has not been locked yet, so everybody checked in is already playing. Lock it when the room has settled.';
    return;
  end if;

  select * into v_rec
  from public.records
  where id = p_registration_id and event_id = p_event_id
    and collection = 'registrations' and status = 'active';

  if not found then
    return query select null::integer, 'That registration is not on this event.';
    return;
  end if;

  if v_rec.checked_in_at is null then
    return query select null::integer, 'Check this player in first, then add them to the round.';
    return;
  end if;

  select active_from_round into v_existing
  from public.roster_entries
  where event_id = p_event_id and player_id = p_registration_id;

  if v_existing is not null then
    return query select v_existing,
      format('Already on the roster, playing from round %s.', v_existing);
    return;
  end if;

  select coalesce(max(round), 0) into v_published from public.games where event_id = p_event_id;

  /*
   * Joining the current round is allowed only while that round is still open. Once END ROUND
   * has been pressed the choice is gone — they start next round, and the message says so
   * rather than silently doing something other than what was asked.
   */
  select exists (
    select 1 from public.round_timers
    where event_id = p_event_id and round = v_published and ended_at is not null
  ) into v_ended;

  if p_join_current and v_published > 0 and not v_ended then
    v_from := v_published;
  else
    v_from := v_published + 1;
  end if;

  insert into public.roster_entries (
    organization_id, event_id, player_id, player_number, full_name, division, division_stated,
    checked_in_at, active_from_round, locked_by
  )
  values (
    v_org, p_event_id, p_registration_id,
    nullif(btrim(coalesce(v_rec.data ->> 'playerNumber', '')), ''),
    coalesce(nullif(btrim(coalesce(v_rec.data ->> 'fullName', '')), ''), 'Unnamed player'),
    public.division_for(public.stated_division(v_rec.data)),
    public.stated_division(v_rec.data) is not null,
    v_rec.checked_in_at, v_from, v_actor
  );

  update public.events
  set data = data || jsonb_build_object(
        'activePlayerIds',
        coalesce(data -> 'activePlayerIds', '[]'::jsonb) || to_jsonb(p_registration_id::text)
      ),
      updated_at = now()
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, v_actor, 'add-late-player',
    jsonb_build_object(
      'playerId', p_registration_id,
      'name', v_rec.data ->> 'fullName',
      'fromRound', v_from,
      'joinedCurrent', v_from = v_published,
      'roundsAlreadyPublished', v_published
    )
  );

  return query select v_from,
    case
      when p_join_current and v_ended then
        format('Round %s has already ended, so they start from round %s.', v_published, v_from)
      when v_from = v_published then
        format('Added to round %s. Waiting for an opponent.', v_from)
      else
        format('Added. They play from round %s.', v_from)
    end;
end $$;

revoke all on function public.staff_add_late_player(text, uuid, text, boolean) from public, anon;
grant execute on function public.staff_add_late_player(text, uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- The reader carries the two new facts back out.

drop function if exists public.staff_games(text);

create function public.staff_games(p_event_id text)
returns table (
  out_id uuid,
  out_round integer,
  out_board integer,
  out_division text,
  out_player_a uuid,
  out_player_b uuid,
  out_score_a integer,
  out_score_b integer,
  out_status text,
  out_verified_by text,
  out_verified_at timestamptz,
  out_note text,
  out_a_plays_first boolean,
  out_pairing_reason text,
  out_added_after_round_start boolean,
  out_started_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff('org-federation') then
    return;
  end if;

  return query
  select g.id, g.round, g.board, g.division, g.player_a, g.player_b,
         g.score_a, g.score_b, g.status, g.verified_by, g.verified_at, g.note,
         g.a_plays_first, g.pairing_reason, g.added_after_round_start, g.started_at
  from public.games g
  where g.event_id = p_event_id
  order by g.round, g.board;
end $$;

revoke all on function public.staff_games(text) from public, anon;
grant execute on function public.staff_games(text) to authenticated;
