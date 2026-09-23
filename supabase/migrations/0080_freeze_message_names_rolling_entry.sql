-- The freeze message says what is now true.
--
-- Migration 0075 refused to re-draw a started round and told the caller that a late arrival
-- joins the next round. Since 0078 that is only half the story: a late arrival can be added
-- to the running round as a new match. The refusal is unchanged — a started round's boards
-- are never re-drawn — and the sentence that explains it now names both options. Live
-- definition, one string and one comment changed.

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
  if not public.can_results('org-federation') then
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

  /*
   * Two players on one board must be in the same category.
   *
   * Enforced here and not only in the browser. The engine has always paired within a
   * category and has never produced a round this refuses — which is exactly why it costs
   * nothing to insist. What it stops is everything that does not come from the engine: a
   * hand-built round, a stale second tab, a swap made against an older roster. A tester
   * reported categories mixed together and was looking at a screen that never named them;
   * this makes the claim impossible rather than merely unfounded.
   */
  if exists (
    select 1
    from jsonb_array_elements(p_boards) as b
    join public.records ra on ra.id = (b ->> 'playerA')::uuid
    join public.records rb on rb.id = nullif(b ->> 'playerB', '')::uuid
    where public.division_for(public.stated_division(ra.data))
       <> public.division_for(public.stated_division(rb.data))
  ) then
    raise exception 'A board pairs two different categories. Categories play separately.';
  end if;

  if p_round > 1 then
    perform public.staff_snapshot_round(p_event_id, p_round - 1, coalesce(p_by, 'system'));
  end if;

  /*
   * A round that has started is frozen.
   *
   * People are sitting at boards playing the game on them. Re-pairing at that point moves
   * somebody mid-game, and the round they were in the middle of stops existing — which is
   * exactly the pairing chaos this tournament has already lived through once.
   *
   * The result check above is not enough on its own: for the first several minutes of a
   * round the clock is running and no score has been entered, and that window is precisely
   * when a late arrival tempts somebody into re-drawing. Under rolling entry a late arrival
   * is *appended* — `staff_append_match` adds one board and touches no other — or joins the
   * next round. What is refused here is only the re-draw.
   */
  if exists (
    select 1 from public.round_timers
    where event_id = p_event_id and round = p_round and started_at is not null
  ) then
    raise exception
      'Round % has already started, so its boards cannot be re-drawn. A late arrival is added as a new match alongside them, or joins the next round.',
      p_round;
  end if;

  delete from public.games where event_id = p_event_id and round = p_round;

  insert into public.games (
    organization_id, event_id, round, board, division, player_a, player_b, a_plays_first,
    pairing_reason
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
    (b ->> 'aPlaysFirst')::boolean,
    -- Absent on any plan built before this column existed, which is null and shows nothing.
    nullif(btrim(coalesce(b ->> 'reason', '')), '')
  from jsonb_array_elements(p_boards) as b;

  select count(*) into v_count
  from public.games where event_id = p_event_id and round = p_round;

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(trim(p_by), ''), 'unknown'), 'publish-round',
    jsonb_build_object(
      'round', p_round,
      'boards', v_count,
      /* Per category, so the audit answers "how many beginners played round three". */
      'byDivision', (
        select jsonb_object_agg(division, n)
        from (
          select division, count(*) as n
          from public.games
          where event_id = p_event_id and round = p_round
          group by division
        ) d
      ))
  );

  return v_count;
end $function$;
