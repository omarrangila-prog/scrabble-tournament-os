-- Everything one participant needs about their own tournament, from their own phone.
--
-- Two reads. Neither is reachable without knowing something already public, and neither
-- returns a phone number or an email address to anybody.

/**
 * Finding yourself by name.
 *
 * A player number is three digits on a badge and people lose it. Typing a name is the
 * fallback, and it has to forgive the way names are actually written: the roster holds
 * "Muhammad Wajahat Nazeer" and the man himself will type "Wajahat Nazeer", or "wajahat",
 * or his name with the middle one missing.
 *
 * So the match is on words rather than on the whole string: every word typed must appear at
 * the start of some word in the stored name, in any order. "wajahat nazeer" finds
 * "Muhammad Wajahat Nazeer"; "naz" finds it too. That is deliberately generous, because the
 * cost of a near-miss is a person standing at a desk, and the cost of an extra row is one
 * more line to look at — the player picks from the list, so nothing is decided by guessing.
 *
 * What it will not do is behave like a directory. Two characters minimum, at most eight
 * rows, and it returns a name and a number and nothing else — both of which are already on
 * the pairing list on the wall. Everything that identifies a person rather than naming them
 * still needs the last four digits of their mobile, through `claim_player_number`.
 */
create or replace function public.player_search(p_event_id text, p_query text)
returns table (out_number text, out_name text, out_division text)
language sql
stable
security definer
set search_path = public
as $$
  with needle as (
    select
      btrim(regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9 ]', ' ', 'g')) as q
  ),
  words as (
    select nullif(w, '') as w
    from needle, unnest(string_to_array(needle.q, ' ')) as w
  )
  select
    r.data ->> 'playerNumber',
    btrim(r.data ->> 'fullName'),
    coalesce(r.data ->> 'preferredDivision', '')
  from public.records r, needle
  where r.collection = 'registrations'
    and r.event_id = p_event_id
    and r.status = 'active'
    and r.data ->> 'playerNumber' is not null
    and length(needle.q) >= 2
    and (
      /* Typed the number itself. */
      r.data ->> 'playerNumber' = needle.q
      or not exists (
        select 1 from words
        where words.w is not null
          and not exists (
            select 1
            from unnest(
              string_to_array(
                btrim(regexp_replace(lower(r.data ->> 'fullName'), '[^a-z0-9 ]', ' ', 'g')),
                ' '
              )
            ) as part
            where part like words.w || '%'
          )
      )
    )
  order by
    /* A whole-name match first, then shorter names, so the closest thing is at the top. */
    (lower(btrim(r.data ->> 'fullName')) = needle.q) desc,
    length(r.data ->> 'fullName'),
    (r.data ->> 'playerNumber')::int
  limit 8;
$$;

revoke all on function public.player_search(text, text) from public;
grant execute on function public.player_search(text, text) to anon, authenticated;

/**
 * One player's whole tournament: every round they have been paired for, in order.
 *
 * The page this feeds is the only thing a participant is asked to use all day, so it answers
 * every question at once — which table, which seat, who against, what was the score, is it
 * settled — rather than making them find a different screen per round.
 *
 * Seat is not stored and does not need to be: a board has a player A and a player B, and
 * which of the two you are is your seat.
 *
 * Behind the token issued at check-in, so this is the player's own tournament and not
 * anybody's. It still returns no contact details for the opponent — a name and a number,
 * which the wall shows anyway.
 */
create or replace function public.player_rounds(p_event_id text, p_token text)
returns table (
  out_round integer,
  out_board integer,
  out_seat text,
  out_opponent text,
  out_opponent_number text,
  out_status text,
  out_my_score integer,
  out_their_score integer,
  out_i_submitted boolean,
  out_confirmed boolean,
  out_is_bye boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid;
begin
  select id into v_me
  from public.records
  where collection = 'registrations'
    and event_id = p_event_id
    and status = 'active'
    and data ->> 'token' = btrim(p_token)
  limit 1;

  if v_me is null then
    return;
  end if;

  return query
  select
    g.round,
    g.board,
    case when g.player_a = v_me then 'A' else 'B' end,
    btrim(o.data ->> 'fullName'),
    o.data ->> 'playerNumber',
    g.status,
    case when g.player_a = v_me then g.score_a else g.score_b end,
    case when g.player_a = v_me then g.score_b else g.score_a end,
    g.submitted_by = v_me,
    g.confirmed_by is not null,
    g.player_b is null
  from public.games g
  left join public.records o
    on o.id = case when g.player_a = v_me then g.player_b else g.player_a end
  where g.event_id = p_event_id
    and (g.player_a = v_me or g.player_b = v_me)
  order by g.round;
end $$;

revoke all on function public.player_rounds(text, text) from public;
grant execute on function public.player_rounds(text, text) to anon, authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.player_search(text, text)', 'execute') is not true then
    raise exception 'player_search is not reachable from a participant phone';
  end if;
  -- A one-character query must return nothing: this is not a way to list the roster.
  if exists (select 1 from public.player_search('evt-alphabattle-23-august', 'a')) then
    raise exception 'player_search answered a one-character query';
  end if;
  raise notice 'player self-service reads are in place';
end $$;
