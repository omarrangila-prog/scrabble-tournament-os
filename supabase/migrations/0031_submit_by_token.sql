-- Let a phone that already knows who it belongs to submit without typing anything.
--
-- A player proves themselves once, at check-in, with their player number and the last four
-- digits of their mobile. Their phone keeps the token that comes back. From then on the
-- result page should know who they are and which board they are on — asking for a code
-- again, between rounds, at a table, is the friction the whole design is trying to remove.
--
-- These are the token versions of `board_for_code` and `submit_result_by_code`. Same rules,
-- same refusals, same silence about anybody else: only the proof of identity differs, and a
-- token is the stronger of the two.

/**
 * The board this phone's owner is playing, from their session token.
 *
 * Returns nothing for a token that does not resolve, for somebody not checked in, and for a
 * player with no board this round — one behaviour for all three, as elsewhere.
 */
create or replace function public.board_for_token(p_event_id text, p_token text)
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
    and data ->> 'token' = btrim(p_token);

  if not found then
    return;
  end if;

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
 * Records a result from a phone that has already proved who it belongs to.
 *
 * Every refusal `submit_result_by_code` makes, this makes too — a recorded board is never
 * overwritten, a bye has nothing to submit, and the scores have to be sensible whole
 * numbers. The token only replaces the typing.
 */
create or replace function public.submit_result_by_token(
  p_event_id text,
  p_token text,
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
    and data ->> 'token' = btrim(p_token);

  if not found then
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

  if v_game.player_b is null then
    return 'bye';
  end if;

  if v_game.score_a is not null then
    return 'already-recorded';
  end if;

  if p_my_score is null or p_their_score is null then
    return 'missing-score';
  end if;

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

revoke all on function public.board_for_token(text, text) from public;
revoke all on function public.submit_result_by_token(text, text, integer, integer) from public;

grant execute on function public.board_for_token(text, text) to anon, authenticated;
grant execute on function public.submit_result_by_token(text, text, integer, integer) to anon, authenticated;

do $$
begin
  if public.submit_result_by_token('evt-alphabattle-23-august', 'not-a-real-token', 100, 90) <> 'not-found' then
    raise exception 'an unknown token was accepted';
  end if;

  if exists (select 1 from public.board_for_token('evt-alphabattle-23-august', 'not-a-real-token')) then
    raise exception 'an unknown token returned a board';
  end if;

  raise notice 'a remembered phone can submit without typing; an unknown token still cannot';
end $$;
