-- Who plays first becomes a real, tracked thing — not just a setting that saves and does
-- nothing.
--
-- `PairingConstraints.balanceStarts` has existed in the domain types since before this
-- session and was never read by the pairing engine. Settings gained a "Track first / second"
-- toggle in Phase 1 (event_settings.first_second_enabled) that was left honestly disabled,
-- because nothing consumed it either: no score sheet asked who went first, no pairing rule
-- balanced it. This is that feature, built: the pairing engine now decides who plays first on
-- every board — balancing it across the tournament, the same idea `balanceStarts` always
-- named — and stores the decision so it can be shown, not just computed and discarded.
--
-- Going first is a real, if small, advantage in Scrabble: first move opens the board, and a
-- balanced tournament makes sure the same players are not disadvantaged by always going
-- second. This does not change any already-recorded result — it only decides seating going
-- forward, from whichever round is published after this migration runs.

alter table public.games add column if not exists a_plays_first boolean;

-- ---------------------------------------------------------------------------
-- staff_publish_round: carries `aPlaysFirst` from the plan into the new column.
-- ---------------------------------------------------------------------------

drop function if exists public.staff_publish_round(text, integer, jsonb, text);

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

  if p_round > 1 then
    perform public.staff_snapshot_round(p_event_id, p_round - 1, coalesce(p_by, 'system'));
  end if;

  delete from public.games where event_id = p_event_id and round = p_round;

  insert into public.games (
    organization_id, event_id, round, board, division, player_a, player_b, a_plays_first
  )
  select
    v_org,
    p_event_id,
    p_round,
    (b ->> 'board')::integer,
    b ->> 'division',
    (b ->> 'playerA')::uuid,
    nullif(b ->> 'playerB', '')::uuid,
    -- Absent on a bye (no opponent to go before) and on any plan built before this field
    -- existed — `(b ->> 'aPlaysFirst')::boolean` is null either way, which the column allows.
    (b ->> 'aPlaysFirst')::boolean
  from jsonb_array_elements(p_boards) as b;

  select count(*) into v_count
  from public.games where event_id = p_event_id and round = p_round;

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(trim(p_by), ''), 'unknown'), 'publish-round',
    jsonb_build_object('round', p_round, 'boards', v_count)
  );

  return v_count;
end $$;

revoke all on function public.staff_publish_round(text, integer, jsonb, text) from public, anon;
grant execute on function public.staff_publish_round(text, integer, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- staff_games and event_round_boards: read the new column back.
-- ---------------------------------------------------------------------------

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
  out_a_plays_first boolean
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
  select g.id, g.round, g.board, g.division, g.player_a, g.player_b,
         g.score_a, g.score_b, g.status, g.verified_by, g.verified_at, g.note, g.a_plays_first
  from public.games g
  where g.event_id = p_event_id
  order by g.round, g.board;
end $$;

revoke all on function public.staff_games(text) from public, anon;
grant execute on function public.staff_games(text) to authenticated;

drop function if exists public.event_round_boards(text, integer);

create function public.event_round_boards(p_event_id text, p_round integer)
returns table (
  out_board integer,
  out_division text,
  out_player_a text,
  out_player_b text,
  out_score_a integer,
  out_score_b integer,
  out_status text,
  out_a_plays_first boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return query
  select
    g.board,
    g.division,
    ra.data ->> 'fullName',
    case when g.player_b is null then null else rb.data ->> 'fullName' end,
    g.score_a,
    g.score_b,
    g.status,
    g.a_plays_first
  from public.games g
  join public.records ra on ra.id = g.player_a
  left join public.records rb on rb.id = g.player_b
  where g.event_id = p_event_id
    and g.round = p_round
  order by g.board;
end $$;

revoke all on function public.event_round_boards(text, integer) from public;
grant execute on function public.event_round_boards(text, integer) to anon, authenticated;

do $$
begin
  if (select count(*) from pg_proc where proname = 'staff_publish_round') <> 1 then
    raise exception 'expected exactly one staff_publish_round overload, found %',
      (select count(*) from pg_proc where proname = 'staff_publish_round');
  end if;
  raise notice 'first/second is a real, published field';
end $$;
