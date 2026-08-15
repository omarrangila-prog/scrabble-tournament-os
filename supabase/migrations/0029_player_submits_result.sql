-- Let a player submit their own board's result from their phone.
--
-- After each round a QR goes up on the screen. One player from each board scans it, enters
-- the six-digit check-in code they already have, and types the two scores. The result is
-- official at once and the standings move — the organizer chose that over a desk
-- confirmation step, and can still correct any board afterwards with a reason recorded.
--
-- These two functions are callable by anybody, which is the point: a player has no account.
-- Everything that follows is about making that safe.
--
-- The code is what proves identity, and it does more than that — it tells the system which
-- board the person is on. So nobody types a table number, an opponent's name or their own
-- name, and nobody can submit against the wrong board by mistake.
--
-- What an anonymous caller cannot do here:
--
--   * submit for a board they are not playing on — the game is looked up from their code;
--   * submit at all without being checked in — a code alone is not enough;
--   * overwrite a score already recorded — a second submission is refused and sent to the
--     desk, so a result cannot be quietly changed later;
--   * read anything about anybody else — the lookup returns their own board, their
--     opponent's name, and nothing more;
--   * submit for a bye, or scores that are not sensible whole numbers.
--
-- The submitting player's name goes into `verified_by`, so the score table shows at a glance
-- which results came from a phone and which from the desk.

/**
 * What board this code is on, so the page can say "Board 4 — you v Bilal" before anybody
 * types a number.
 *
 * Returns nothing at all for an unknown code, a person who has not checked in, or a player
 * with no board in the latest round. "Nothing" rather than a reason: this is reachable by
 * anyone with the link, and a message distinguishing "no such code" from "that person has
 * not arrived" would answer questions about other people's attendance.
 */
create or replace function public.board_for_code(p_event_id text, p_code text)
returns table (
  out_game_id uuid,
  out_round integer,
  out_board integer,
  out_you text,
  out_opponent text,
  out_already_recorded boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_record public.records;
  v_round integer;
begin
  select * into v_record
  from public.records
  where event_id = p_event_id
    and collection = 'registrations'
    and status = 'active'
    and checked_in_at is not null
    and check_in_code = btrim(p_code);

  if not found then
    return;
  end if;

  /* The round being played is the highest one with boards, not a stored counter. */
  select max(g.round) into v_round from public.games g where g.event_id = p_event_id;
  if v_round is null then
    return;
  end if;

  return query
  select
    g.id,
    g.round,
    g.board,
    v_record.data ->> 'fullName',
    case
      when g.player_b is null then null
      when g.player_a = v_record.id then rb.data ->> 'fullName'
      else ra.data ->> 'fullName'
    end,
    g.score_a is not null
  from public.games g
  left join public.records ra on ra.id = g.player_a
  left join public.records rb on rb.id = g.player_b
  where g.event_id = p_event_id
    and g.round = v_round
    and (g.player_a = v_record.id or g.player_b = v_record.id);
end $$;

/**
 * Records a result, submitted by one of the two people who played it.
 *
 * The scores are given as "mine" and "theirs" rather than as A and B. The caller does not
 * know which side of the board they are stored on, and asking them to work it out is how a
 * result gets entered backwards — so the function maps them.
 */
create or replace function public.submit_result_by_code(
  p_event_id text,
  p_code text,
  p_my_score integer,
  p_their_score integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.records;
  v_game public.games;
  v_round integer;
  v_name text;
begin
  select * into v_record
  from public.records
  where event_id = p_event_id
    and collection = 'registrations'
    and status = 'active'
    and checked_in_at is not null
    and check_in_code = btrim(p_code);

  if not found then
    /*
     * One message for an unknown code and for somebody not checked in. Telling them apart
     * would turn this into a way to test whether a given code exists, or whether a
     * particular person has arrived.
     */
    return 'not-found';
  end if;

  v_name := coalesce(v_record.data ->> 'fullName', 'A player');

  select max(g.round) into v_round from public.games g where g.event_id = p_event_id;
  if v_round is null then
    return 'no-round';
  end if;

  select * into v_game
  from public.games g
  where g.event_id = p_event_id
    and g.round = v_round
    and (g.player_a = v_record.id or g.player_b = v_record.id);

  if not found then
    return 'no-board';
  end if;

  /* A bye has no opponent and no score to agree on. */
  if v_game.player_b is null then
    return 'bye';
  end if;

  /*
   * Refused rather than overwritten. If a recorded result could be replaced from a phone,
   * anybody could change a finished game later — and the person who played it would have no
   * way of knowing. Corrections go through the desk, where they carry a reason and a name.
   */
  if v_game.score_a is not null then
    return 'already-recorded';
  end if;

  if p_my_score is null or p_their_score is null then
    return 'missing-score';
  end if;

  /*
   * Sanity, not judgement. A Scrabble game really can end at 250 or at 700, so the bounds
   * are wide — they exist to stop a typo like 4120 or a negative, not to decide what a
   * plausible game looks like.
   */
  if p_my_score < 0 or p_their_score < 0 or p_my_score > 1500 or p_their_score > 1500 then
    return 'out-of-range';
  end if;

  update public.games
  set score_a = case when v_game.player_a = v_record.id then p_my_score else p_their_score end,
      score_b = case when v_game.player_a = v_record.id then p_their_score else p_my_score end,
      status = 'verified',
      verified_by = v_name || ' (from their phone)',
      verified_at = now()
  where id = v_game.id;

  return 'recorded';
end $$;

/*
 * Anonymous execution is the whole point — a player has no account. The functions are
 * `security definer` and every check above is inside them, so the table itself stays closed.
 */
revoke all on function public.board_for_code(text, text) from public;
revoke all on function public.submit_result_by_code(text, text, integer, integer) from public;

grant execute on function public.board_for_code(text, text) to anon, authenticated;
grant execute on function public.submit_result_by_code(text, text, integer, integer) to anon, authenticated;

do $$
begin
  if not has_function_privilege('anon', 'public.submit_result_by_code(text, text, integer, integer)', 'execute') then
    raise exception 'players cannot submit, which is the point of this migration';
  end if;

  if public.submit_result_by_code('evt-alphabattle-23-august', '000000', 100, 90) <> 'not-found' then
    raise exception 'an unknown code was accepted';
  end if;

  if exists (select 1 from public.board_for_code('evt-alphabattle-23-august', '000000')) then
    raise exception 'an unknown code returned a board';
  end if;

  raise notice 'players can submit their own board, only their own, and only once';
end $$;
