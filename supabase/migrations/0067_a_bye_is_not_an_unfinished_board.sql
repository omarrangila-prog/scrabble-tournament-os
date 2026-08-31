-- Two fixes found by running a tournament that people walk into.
--
-- 1. A bye blocked the next round, forever.
--
-- `staff_publish_round` refuses to publish round N while round N-1 has boards that are not
-- verified. A bye is a row with one player, no opponent and no score, and it keeps the
-- status it was published with for the life of the tournament — so it counted as unfinished
-- every time, and the round after it could never be published.
--
-- Proved on three players: one board scored and verified, one bye, everything a director
-- could possibly do already done.
--
--     select staff_publish_round('evt-bye', 2, ...)
--     REFUSED -> Round 1 still has 1 board(s) not verified.
--
-- An odd number of players could not advance past round one. This stayed hidden because it
-- only bites on odd counts, and an event where everybody arrives on time and stays is even
-- more often than not. An event where people keep walking in is odd half the time.
--
-- The same mistake was fixed once already in the TypeScript round-progress helpers, where a
-- bye was treated as an unscored board. It survived here in SQL, which is the argument for
-- the shared engine the specification asks for rather than two implementations of one rule.
--
-- 2. Withdrawing somebody erased the round they had just played.
--
-- "Withdraw immediately" set the last round they count for to the current round minus one,
-- so a player who had finished round one and then left was recorded as having played
-- nothing. Round one was already on the wall with their score in it.
--
-- The two options differ in what they permit, not in what they erase. Withdrawing
-- immediately refuses while a board of theirs is unplayed, because somebody is sitting
-- opposite them and the director has to settle it. Withdrawing after the current round
-- allows it and lets them finish. Either way they keep every round they actually played.

CREATE OR REPLACE FUNCTION public.staff_publish_round(p_event_id text, p_round integer, p_boards jsonb, p_by text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    /*
     * A bye is not an unfinished board. It has no opponent, never receives a score, and
     * keeps the status it was published with for the life of the tournament — so counting
     * it here meant that any round with an odd number of players blocked the next one
     * forever. An event where people arrive late is exactly an event with odd counts, which
     * is how this stayed hidden: it only bites when somebody walks in.
     */
    select count(*) into v_unfinished
    from public.games
    where event_id = p_event_id
      and round = p_round - 1
      and player_b is not null
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

  /*
   * Eligibility is now asked per round rather than once for the tournament. A player who
   * arrived at round three is not on the round-one roster and never will be; a player who
   * withdrew after round two must not appear in round three. One flat list cannot say
   * either, which is why people arriving late had no route in at all.
   */
  v_active := public.staff_eligible_player_ids(p_event_id, p_round);
  if v_active is not null then
    select count(*) into v_stray
    from unnest(v_plan_players) as p
    where not (p = any(v_active));

    if v_stray > 0 then
      raise exception
        '% player(s) in round % are not eligible to play it.', v_stray, p_round;
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
end $function$;

-- ---------------------------------------------------------------------------

create or replace function public.staff_withdraw_player(
  p_event_id text,
  p_player_id uuid,
  p_immediately boolean default false,
  p_by text default null
)
returns table (out_after_round integer, out_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_current integer;
  v_after integer;
  v_board integer;
  v_actor text;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  v_actor := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'unknown');

  select coalesce(max(round), 0) into v_current from public.games where event_id = p_event_id;

  /*
   * Leaving immediately means not playing the round now on the wall. That round is
   * published, so somebody is sitting opposite them — the software must not quietly
   * regenerate a round the room has already read. It names the board and stops, and the
   * director settles it as a concession or a forfeit.
   */
  if p_immediately and v_current > 0 then
    select board into v_board
    from public.games
    where event_id = p_event_id and round = v_current
      and (player_a = p_player_id or player_b = p_player_id)
      and score_a is null
      and player_b is not null;

    if v_board is not null then
      return query select null::integer,
        format('They are on board %s of round %s, unplayed. Record that result first — a concession or a forfeit — then withdraw them.',
               v_board, v_current);
      return;
    end if;
  end if;

  /*
   * Every round they actually played is theirs, whichever option was chosen. This used to
   * subtract one for an immediate withdrawal, which erased a round already on the wall with
   * their score in it — the round they had just finished playing.
   */
  v_after := v_current;

  update public.roster_entries
  set withdrawn_after_round = v_after
  where event_id = p_event_id and player_id = p_player_id;

  if not found then
    return query select null::integer, 'That player is not on this event''s roster.';
    return;
  end if;

  update public.events
  set data = data || jsonb_build_object(
        'activePlayerIds',
        coalesce((
          select jsonb_agg(x) from jsonb_array_elements_text(coalesce(data -> 'activePlayerIds', '[]'::jsonb)) as t(x)
          where x <> p_player_id::text
        ), '[]'::jsonb)
      ),
      updated_at = now()
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, v_actor, 'withdraw-player',
    jsonb_build_object('playerId', p_player_id, 'afterRound', v_after, 'immediate', p_immediately)
  );

  return query select v_after,
    case
      when v_after = 0 then 'Withdrawn before playing any round.'
      else format('Withdrawn. They keep rounds 1 to %s and are not paired after that.', v_after)
    end;
end $$;

revoke all on function public.staff_withdraw_player(text, uuid, boolean, text) from public, anon;
grant execute on function public.staff_withdraw_player(text, uuid, boolean, text) to authenticated;

do $$
begin
  raise notice 'a bye no longer blocks the next round; a withdrawal keeps the rounds played';
end $$;
