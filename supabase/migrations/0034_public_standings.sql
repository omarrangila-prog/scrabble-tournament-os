-- Standings anybody can read, so the wall can show them.
--
-- The wall computed standings from the roster, and the roster needs a signed-in staff
-- session. A television is not signed in, so the final screen — the one the whole day builds
-- to — said "nothing to show yet" while the results sat in the database. The same mistake as
-- the arrival counter, in the same place, for the same reason.
--
-- Names are already public for the current round: the board list on every participant's
-- phone shows who is playing whom. This adds no disclosure that pairing has not already
-- made, and it deliberately returns nothing else — no contact details, no payment, no
-- player number.
--
-- Ordered by wins, then spread, which is how this tournament ranks. Head-to-head is not
-- applied here: it decides places the application's own engine settles for certificates, and
-- a wall showing a slightly different order from the certificate would be worse than a wall
-- showing none.

create or replace function public.event_standings(p_event_id text)
returns table (
  out_division text,
  out_name text,
  out_played integer,
  out_wins integer,
  out_losses integer,
  out_draws integer,
  out_spread integer
)
language sql
security definer
stable
set search_path = public
as $$
  with sides as (
    /* Each verified game seen from both players' points of view. */
    select g.division, g.player_a as player, g.score_a as mine, g.score_b as theirs
    from public.games g
    where g.event_id = p_event_id and g.status = 'verified'
      and g.score_a is not null and g.player_b is not null

    union all

    select g.division, g.player_b, g.score_b, g.score_a
    from public.games g
    where g.event_id = p_event_id and g.status = 'verified'
      and g.score_a is not null and g.player_b is not null
  )
  select
    s.division,
    r.data ->> 'fullName',
    count(*)::integer,
    count(*) filter (where s.mine > s.theirs)::integer,
    count(*) filter (where s.mine < s.theirs)::integer,
    count(*) filter (where s.mine = s.theirs)::integer,
    coalesce(sum(s.mine - s.theirs), 0)::integer
  from sides s
  join public.records r on r.id = s.player
  group by s.division, r.data ->> 'fullName'
  order by
    s.division,
    count(*) filter (where s.mine > s.theirs) desc,
    coalesce(sum(s.mine - s.theirs), 0) desc,
    r.data ->> 'fullName';
$$;

revoke all on function public.event_standings(text) from public;
grant execute on function public.event_standings(text) to anon, authenticated;

do $$
begin
  if not has_function_privilege('anon', 'public.event_standings(text)', 'execute') then
    raise exception 'the wall still cannot read standings';
  end if;

  raise notice 'standings are public: names, wins and spread, and nothing else';
end $$;
