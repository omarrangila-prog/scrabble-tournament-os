-- Changing a published board by hand, from the results table, while the round is on.
--
-- Three small operations a director needs in the room and had to leave the room to do:
-- swap two players between boards, move a board to another table, and change who goes
-- first. Each is one row changed, each is refused once a score is on the board, each is
-- audited with the before and the after.
--
-- The rule they all keep: a board with a result is history and is not edited here. A board
-- that has been played but not yet scored is a director's call — the room can see them make
-- it — and one that has not started is nobody's problem. What is never done is the thing
-- rolling entry forbids: re-drawing the round around a change. A swap touches exactly two
-- boards and leaves every other one where it was.

-- ---------------------------------------------------------------------------
-- Two players change places. Same category, same round, no scores on either board.

create or replace function public.staff_swap_players(
  p_event_id text,
  p_round integer,
  p_player_x uuid,
  p_player_y uuid,
  p_by text default null
)
returns table (out_ok boolean, out_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_actor text;
  v_gx public.games;
  v_gy public.games;
  v_div_x text;
  v_div_y text;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;
  v_actor := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'unknown');

  if p_player_x = p_player_y then
    return query select false, 'That is the same player twice.'::text;
    return;
  end if;

  select * into v_gx from public.games
  where event_id = p_event_id and round = p_round and (player_a = p_player_x or player_b = p_player_x);
  select * into v_gy from public.games
  where event_id = p_event_id and round = p_round and (player_a = p_player_y or player_b = p_player_y);

  if v_gx.id is null or v_gy.id is null then
    return query select false, 'One of these players is not on a board this round.'::text;
    return;
  end if;

  if v_gx.score_a is not null or v_gy.score_a is not null then
    return query select false, 'One of these boards already has a score. Clear it first if the result is wrong.'::text;
    return;
  end if;

  /* Same category, always — the one rule no manual edit relaxes. */
  select public.division_for(public.stated_division(data)) into v_div_x from public.records where id = p_player_x;
  select public.division_for(public.stated_division(data)) into v_div_y from public.records where id = p_player_y;
  if v_div_x is distinct from v_div_y then
    return query select false,
      format('%s and %s are different categories. Categories play separately.', v_div_x, v_div_y)::text;
    return;
  end if;

  /*
   * Two players on the same board swapping is just changing who goes first, so do that.
   * Otherwise, put each in the other's seat. The boards, tables and everybody else stay put.
   */
  if v_gx.id = v_gy.id then
    update public.games set a_plays_first = not coalesce(a_plays_first, true), updated_at = now()
    where id = v_gx.id;
  else
    /*
     * Both rows go out and come back in one statement each, seats exchanged.
     *
     * Updating them one after the other cannot work: the unique index on (round, player)
     * is checked as each row changes, and after the first update the player being moved is
     * on two boards for an instant. Deleting both and re-inserting both keeps every other
     * column — ids, tables, timestamps, the reason — and never has a player in two places.
     */
    delete from public.games where id in (v_gx.id, v_gy.id);

    insert into public.games (
      id, organization_id, event_id, round, board, division, player_a, player_b,
      score_a, score_b, status, verified_by, verified_at, note, created_at, updated_at,
      submitted_by, confirmed_by, confirmed_at, a_plays_first, pairing_reason,
      added_after_round_start, started_at
    )
    values
      (v_gx.id, v_gx.organization_id, v_gx.event_id, v_gx.round, v_gx.board, v_gx.division,
       case when v_gx.player_a = p_player_x then p_player_y else v_gx.player_a end,
       case when v_gx.player_b = p_player_x then p_player_y else v_gx.player_b end,
       v_gx.score_a, v_gx.score_b, v_gx.status, v_gx.verified_by, v_gx.verified_at, v_gx.note,
       v_gx.created_at, now(), v_gx.submitted_by, v_gx.confirmed_by, v_gx.confirmed_at,
       v_gx.a_plays_first, coalesce(v_gx.pairing_reason, '') || ' Swapped by hand.',
       v_gx.added_after_round_start, v_gx.started_at),
      (v_gy.id, v_gy.organization_id, v_gy.event_id, v_gy.round, v_gy.board, v_gy.division,
       case when v_gy.player_a = p_player_y then p_player_x else v_gy.player_a end,
       case when v_gy.player_b = p_player_y then p_player_x else v_gy.player_b end,
       v_gy.score_a, v_gy.score_b, v_gy.status, v_gy.verified_by, v_gy.verified_at, v_gy.note,
       v_gy.created_at, now(), v_gy.submitted_by, v_gy.confirmed_by, v_gy.confirmed_at,
       v_gy.a_plays_first, coalesce(v_gy.pairing_reason, '') || ' Swapped by hand.',
       v_gy.added_after_round_start, v_gy.started_at);
  end if;

  perform public.write_audit_log(
    v_org, p_event_id, v_actor, 'swap-players',
    jsonb_build_object(
      'round', p_round,
      'before', jsonb_build_array(
        jsonb_build_object('board', v_gx.board, 'a', v_gx.player_a, 'b', v_gx.player_b),
        jsonb_build_object('board', v_gy.board, 'a', v_gy.player_a, 'b', v_gy.player_b)),
      'swapped', jsonb_build_array(p_player_x, p_player_y)));

  return query select true, format('Swapped. Boards %s and %s.', v_gx.board, v_gy.board)::text;
end $$;

revoke all on function public.staff_swap_players(text, integer, uuid, uuid, text) from public, anon;
grant execute on function public.staff_swap_players(text, integer, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A board moves to another table. The players do not change.

create or replace function public.staff_move_table(
  p_game_id uuid,
  p_board integer,
  p_by text default null
)
returns table (out_ok boolean, out_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_g public.games;
  v_actor text;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select * into v_g from public.games where id = p_game_id;
  if v_g.id is null then
    return query select false, 'That board no longer exists.'::text;
    return;
  end if;
  v_actor := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'unknown');

  if p_board < 1 then
    return query select false, 'Table numbers start at 1.'::text;
    return;
  end if;

  if exists (
    select 1 from public.games
    where event_id = v_g.event_id and round = v_g.round and board = p_board and id <> p_game_id
      and player_b is not null
  ) then
    return query select false, format('Table %s already has a game at it.', p_board)::text;
    return;
  end if;

  update public.games set board = p_board, updated_at = now() where id = p_game_id;

  perform public.write_audit_log(
    v_g.organization_id, v_g.event_id, v_actor, 'move-table',
    jsonb_build_object('round', v_g.round, 'gameId', p_game_id, 'from', v_g.board, 'to', p_board));

  return query select true, format('Moved from table %s to table %s.', v_g.board, p_board)::text;
end $$;

revoke all on function public.staff_move_table(uuid, integer, text) from public, anon;
grant execute on function public.staff_move_table(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Who goes first, the other way round.

create or replace function public.staff_flip_first(p_game_id uuid, p_by text default null)
returns table (out_ok boolean, out_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_g public.games;
  v_actor text;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select * into v_g from public.games where id = p_game_id;
  if v_g.id is null then
    return query select false, 'That board no longer exists.'::text;
    return;
  end if;
  if v_g.player_b is null then
    return query select false, 'A bye has nobody to go first.'::text;
    return;
  end if;
  if v_g.score_a is not null then
    return query select false, 'This board already has a score.'::text;
    return;
  end if;
  v_actor := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'unknown');

  update public.games set a_plays_first = not coalesce(a_plays_first, true), updated_at = now()
  where id = p_game_id;

  perform public.write_audit_log(
    v_g.organization_id, v_g.event_id, v_actor, 'flip-first',
    jsonb_build_object('round', v_g.round, 'board', v_g.board, 'from', v_g.a_plays_first));

  return query select true, 'First and second swapped.'::text;
end $$;

revoke all on function public.staff_flip_first(uuid, text) from public, anon;
grant execute on function public.staff_flip_first(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The category change is `staff_set_division`, which the desk already calls and the results
-- table may now call too (0072). One thing it did not do: update the roster snapshot, so a
-- player confirmed as Advanced at the desk was still drawn as Recreational in the next round.
-- Live definition, that one update and one audit field added.

CREATE OR REPLACE FUNCTION public.staff_set_division(p_record_id uuid, p_division text, p_by text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event text;
  v_org text;
  v_before text;
begin
  if not (public.can_desk('org-federation') or public.can_results('org-federation')) then
    raise exception 'Not authorised';
  end if;

  select event_id, coalesce(data ->> 'confirmedDivision', data ->> 'preferredDivision')
  into v_event, v_before
  from public.records
  where id = p_record_id and collection = 'registrations';

  if v_event is null then
    raise exception 'No such registration';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(public.event_categories(v_event)) as c
    where c ->> 'id' = p_division
  ) then
    raise exception 'This event has no category %', p_division;
  end if;

  update public.records
  set data = data
             || jsonb_build_object(
                  'preferredDivision', p_division,
                  'confirmedDivision', p_division,
                  'divisionSetBy', coalesce(nullif(btrim(p_by), ''), 'Desk'),
                  'divisionSetAt', now()
                ),
      updated_at = now()
  where id = p_record_id;

  /*
   * The roster snapshot follows.
   *
   * Rounds are paired from `roster_entries`, and a category change that reached the
   * registration but not the snapshot would have the player confirmed as Advanced on the
   * desk and drawn as Recreational in the next round. Boards already published are left
   * alone — the change applies from the next draw, and the audit entry says which round.
   */
  update public.roster_entries
  set division = public.division_for(p_division), division_stated = true
  where player_id = p_record_id and event_id = v_event;

  select organization_id into v_org from public.events where id = v_event;
  perform public.write_audit_log(
    v_org, v_event, coalesce(nullif(btrim(p_by), ''), 'Desk'), 'set-division',
    jsonb_build_object('registration', p_record_id, 'before', v_before, 'after', p_division,
      'appliesFromRound', (select coalesce(max(round), 0) + 1 from public.games where event_id = v_event))
  );

  return true;
end $function$;

revoke all on function public.staff_set_division(uuid, text, text) from public, anon;
grant execute on function public.staff_set_division(uuid, text, text) to authenticated;
