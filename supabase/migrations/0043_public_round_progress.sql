-- What round it is, and how many boards are in — readable by a television.
--
-- The wall read this through `staff_games`, which requires a signed-in staff session. On the
-- director's laptop that works, because the browser already holds one; on an actual
-- television, which has never signed in to anything, it returns nothing. The wall therefore
-- announced "Round 0 complete" and "0 / 0 boards in" during result entry — the one moment it
-- is telling a room what to do.
--
-- This is the third time a screen meant for people with no account has been built on a
-- staff-only read. The pattern is always the same and always invisible in testing, because
-- the browser doing the testing is signed in.
--
-- Names are not returned here. The board list already has its own public read; this is two
-- numbers and a round.

create or replace function public.event_round_progress(p_event_id text)
returns table (out_round integer, out_boards integer, out_verified integer)
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select coalesce(max(round), 0) as round
    from public.games
    where event_id = p_event_id
  )
  select
    latest.round,
    (select count(*)::integer from public.games g
      where g.event_id = p_event_id and g.round = latest.round),
    (select count(*)::integer from public.games g
      where g.event_id = p_event_id and g.round = latest.round
        and g.score_a is not null and g.score_b is not null)
  from latest;
$$;

revoke all on function public.event_round_progress(text) from public;
grant execute on function public.event_round_progress(text) to anon, authenticated;

do $$
begin
  if not has_function_privilege('anon', 'public.event_round_progress(text)', 'execute') then
    raise exception 'the wall still cannot tell which round it is';
  end if;
  raise notice 'the wall can read the round without signing in';
end $$;
