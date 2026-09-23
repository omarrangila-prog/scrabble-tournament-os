-- Once a round has started, it is frozen.
--
-- The rule the organiser asked for, and the one that protects the tournament: pairings may
-- move freely while a round is being prepared, and not at all once people are playing it.
--
-- `staff_publish_round` already refused to overwrite a round that had results. That is not
-- the same guarantee. For the first several minutes of a round the clock is running and no
-- score has been entered yet — and that window is exactly when somebody walks in late and
-- somebody else is tempted to re-pair to fit them in. A late arrival joins the *next* round.
--
-- Also fixes a bug found while reading the late-arrival path: it filed every late player
-- under the category 'open'. Migration 0070 fixed the identical mistake in the roster lock
-- and missed this copy of it, because the two were written weeks apart. A player filed under
-- a category the event does not run is not paired and not reported — they simply never
-- appear in a round, which is the one failure nobody notices until somebody is standing in
-- the room with no table.
--
-- Both functions are the live definitions with those two additions and nothing else changed.

CREATE OR REPLACE FUNCTION public.staff_add_late_player(p_event_id text, p_registration_id uuid, p_by text DEFAULT NULL::text)
 RETURNS TABLE(out_from_round integer, out_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org text;
  v_published integer;
  v_from integer;
  v_rec public.records;
  v_existing integer;
  v_actor text;
  v_locked boolean;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  v_actor := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'unknown');

  /*
   * No lock, no roster to be late for. Writing a row here would turn "everybody checked in
   * is playing" into "this one person is playing", and publishing would then refuse the
   * rest of the room.
   */
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

  /* The first round nobody has been told about yet. */
  select coalesce(max(round), 0) into v_published from public.games where event_id = p_event_id;
  v_from := v_published + 1;

  insert into public.roster_entries (
    organization_id, event_id, player_id, player_number, full_name, division,
    checked_in_at, active_from_round, locked_by
  )
  values (
    v_org, p_event_id, p_registration_id,
    nullif(btrim(coalesce(v_rec.data ->> 'playerNumber', '')), ''),
    coalesce(nullif(btrim(coalesce(v_rec.data ->> 'fullName', '')), ''), 'Unnamed player'),
    /*
     * The category they are actually paired in.
     *
     * This read `data ->> 'division'` and fell back to 'open'. No registration has a
     * 'division' key — the form writes 'preferredDivision' and a director's correction
     * writes 'confirmedDivision' — so every late arrival was filed under a category no
     * event runs, and the engine, which pairs by walking the event's division list, would
     * have left them out of every round without saying so. Migration 0070 fixed the same
     * bug in the roster lock and missed this one, because they were written weeks apart.
     */
    public.division_for(public.stated_division(v_rec.data)),
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
      'roundsAlreadyPlayed', v_published
    )
  );

  return query select v_from, format('Added. They play from round %s.', v_from);
end $function$;

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
   * when a late arrival tempts somebody into re-pairing. A late arrival joins the next
   * round; that is what `staff_add_late_player` does, and this is what makes it the only
   * option.
   */
  if exists (
    select 1 from public.round_timers
    where event_id = p_event_id and round = p_round and started_at is not null
  ) then
    raise exception
      'Round % has already started and cannot be re-paired. A late arrival joins the next round.',
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

revoke all on function public.staff_add_late_player(text, uuid, text) from public, anon;
grant execute on function public.staff_add_late_player(text, uuid, text) to authenticated;

revoke all on function public.staff_publish_round(text, integer, jsonb, text) from public, anon;
grant execute on function public.staff_publish_round(text, integer, jsonb, text) to authenticated;
