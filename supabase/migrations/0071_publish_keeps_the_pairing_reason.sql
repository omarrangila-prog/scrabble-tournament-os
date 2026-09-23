-- Why these two were paired survives being published.
--
-- The engine works out a justification for every board — same score group, nearest rating, a
-- repeat it could not avoid, the bye going to whoever had the fewest — and shows it on the
-- pairing card. Publishing threw all of it away. `pairingsFromGames` then filled the gap with
-- "Published round, read from the database.", which is true and answers nothing.
--
-- A tester reported that the pairings "appeared random and did not follow proper Scrabble
-- tournament logic". They followed it exactly; the software just had nothing to say when
-- asked why, because the reasoning lived for as long as the preview was open and was then
-- dropped. An organiser who cannot answer "why am I playing him again?" has to take the draw
-- on trust, and taking it on trust was the one thing this tester would not do.
--
-- Its own column rather than `note`: `note` carries what a staff member wrote when recording
-- or correcting a score, and burying somebody's explanation of a correction under a sentence
-- about pairing would lose the more important of the two.
--
-- The function bodies below are the live definitions with the additions marked in their own
-- comments. Rewriting them from the migration history instead would have dropped the
-- round-snapshot call that 0058 added, which is how a "small" change loses a feature.

alter table public.games
  add column if not exists pairing_reason text;

comment on column public.games.pairing_reason is
  'The engine''s justification for this board, captured at publish. Never touched by score entry.';

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

revoke all on function public.staff_publish_round(text, integer, jsonb, text) from public, anon;
grant execute on function public.staff_publish_round(text, integer, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The reader carries it back out, so a published board can still say why.
--
-- Dropped first: `create or replace` cannot add an OUT parameter. The existing columns keep
-- their order and the new one goes last, so nothing that reads this by position moves. It
-- stays STABLE, and it still returns nothing rather than raising for a non-staff caller —
-- the organizer screens rely on an empty read to show their "not staff" state.

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
  out_pairing_reason text
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
         g.a_plays_first, g.pairing_reason
  from public.games g
  where g.event_id = p_event_id
  order by g.round, g.board;
end $$;

revoke all on function public.staff_games(text) from public, anon;
grant execute on function public.staff_games(text) to authenticated;
