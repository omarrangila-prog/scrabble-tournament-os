-- People keep arriving after the roster is locked, and the software had no answer.
--
-- The lock is right to be a lock: pairings must come from a roster that does not change
-- underneath them, and `staff_lock_active_players` correctly refuses to re-run once a round
-- exists. But that left the most ordinary thing that happens at a tournament — somebody
-- walking in during round one — with no route in at all. The only options were to do nothing
-- or to edit the database by hand.
--
-- The missing idea is that eligibility is a question about a round, not about a tournament.
-- A player who arrives at round three was never eligible for round one and never will be. A
-- player who withdraws after round two must not appear in round three, but keeps the two
-- rounds they played. One flat list of ids cannot express either.
--
-- `roster_entries` already carries `active_from_round` and `withdrawn_after_round`, added in
-- 0063 for exactly this. They stop being unused here.
--
-- Two decisions worth stating, because both are tournament rules rather than engineering.
--
-- A late arrival joins from the first round that has not been published. If the current
-- round is still being prepared they are in it; if it has already gone up on the wall they
-- start next round. Published pairings are never rewritten to fit somebody in — the room has
-- already read them, and boards people are sitting at are not a draft.
--
-- A late arrival simply plays fewer games. Standings are derived from verified results, so
-- somebody who joins at round three has three results and everybody else has five, and the
-- ranking follows from that without any special case. They are not given losses for the
-- rounds they missed. That is the honest reading of what happened, and it means a late
-- arrival cannot overtake somebody who played the whole tournament — which is the right
-- outcome, and worth saying out loud because the alternative (forfeit-losses for missed
-- rounds) is a different tournament rule that some events do use. If this event wants that,
-- it is a change to make deliberately, not a default to inherit.

-- ---------------------------------------------------------------------------
-- Who may play a given round.
-- ---------------------------------------------------------------------------

drop function if exists public.staff_eligible_player_ids(text, integer);

create function public.staff_eligible_player_ids(p_event_id text, p_round integer)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if not public.is_staff('org-federation') then
    return null;
  end if;

  select array_agg(player_id) into v_ids
  from public.roster_entries
  where event_id = p_event_id
    and active_from_round <= p_round
    and (withdrawn_after_round is null or withdrawn_after_round >= p_round);

  if v_ids is not null then
    return v_ids;
  end if;

  /*
   * No roster snapshot for this event. Null means "no restriction", which is what publishing
   * has always done for an event whose roster was never locked — an event can still be run
   * without locking, and this must not change that.
   */
  return public.staff_active_player_ids(p_event_id);
end $$;

revoke all on function public.staff_eligible_player_ids(text, integer) from public, anon;
grant execute on function public.staff_eligible_player_ids(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Somebody walks in.
-- ---------------------------------------------------------------------------

drop function if exists public.staff_add_late_player(text, uuid, text);

create function public.staff_add_late_player(
  p_event_id text,
  p_registration_id uuid,
  p_by text default null
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
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  v_actor := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'unknown');

  select * into v_rec
  from public.records
  where id = p_registration_id and event_id = p_event_id
    and collection = 'registrations' and status = 'active';

  if not found then
    return query select null::integer, 'That registration is not on this event.';
    return;
  end if;

  if v_rec.checked_in_at is null then
    /* Check-in is where payment and identity are settled. Adding somebody who has not been
       through it would put them on a board without either. */
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
    coalesce(nullif(btrim(coalesce(v_rec.data ->> 'division', '')), ''), 'open'),
    v_rec.checked_in_at, v_from, v_actor
  );

  /* The flat array is still what an unlocked event falls back to, so it is kept in step. */
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

  return query select v_from,
    format('Added. They play from round %s.', v_from);
end $$;

revoke all on function public.staff_add_late_player(text, uuid, text) from public, anon;
grant execute on function public.staff_add_late_player(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Somebody leaves.
-- ---------------------------------------------------------------------------

drop function if exists public.staff_withdraw_player(text, uuid, boolean, text);

create function public.staff_withdraw_player(
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
   * Leaving immediately means they do not play the round now on the wall. That round is
   * published, so somebody is sitting opposite them — the software must not quietly
   * regenerate a round the room has already read. It names the board and stops, and the
   * director settles it as a concession or a forfeit.
   */
  if p_immediately and v_current > 0 then
    select board into v_board
    from public.games
    where event_id = p_event_id and round = v_current
      and (player_a = p_player_id or player_b = p_player_id)
      and score_a is null;

    if v_board is not null then
      return query select null::integer,
        format('They are on board %s of round %s, unplayed. Record that result first — a concession or a forfeit — then withdraw them.',
               v_board, v_current);
      return;
    end if;
  end if;

  v_after := case when p_immediately then greatest(v_current - 1, 0) else v_current end;

  update public.roster_entries
  set withdrawn_after_round = v_after
  where event_id = p_event_id and player_id = p_player_id;

  if not found then
    return query select null::integer, 'That player is not on this event''s roster.';
    return;
  end if;

  /* Out of the fallback list too, so an unlocked event stops pairing them as well. */
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
    format('Withdrawn. They keep rounds 1 to %s and are not paired after that.', v_after);
end $$;

revoke all on function public.staff_withdraw_player(text, uuid, boolean, text) from public, anon;
grant execute on function public.staff_withdraw_player(text, uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Publishing asks per round.
-- ---------------------------------------------------------------------------

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

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'staff_publish_round'
      and p.prosrc like '%staff_eligible_player_ids%'
  ) then
    raise exception 'publishing is still asking the flat active list';
  end if;
  raise notice 'late arrivals and withdrawals have a route; eligibility is per round';
end $$;
