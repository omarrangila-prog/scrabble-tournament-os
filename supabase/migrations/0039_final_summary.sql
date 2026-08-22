-- Everything the closing needs about each player, computed from verified games.
--
-- The ranking rule is copied from `event_standings` exactly — division, then wins, then
-- spread, then name — because two orderings of the same tournament is how a wall and a
-- certificate end up disagreeing about who came second.
--
-- Byes are excluded here as they are there: a bye has no opponent and no score, so counting
-- it would give somebody a game they did not play and a spread of zero they did not earn.
--
-- Staff only. It carries the email address, which is what the closing sends to.

create or replace function public.event_final_summary(p_event_id text)
returns table (
  out_id uuid,
  out_number text,
  out_name text,
  out_email text,
  out_division text,
  out_rank integer,
  out_played integer,
  out_wins integer,
  out_losses integer,
  out_draws integer,
  out_spread integer,
  out_best_score integer,
  out_best_margin integer,
  out_best_against text
)
language sql
stable
security definer
set search_path = public
as $$
  with sides as (
    select g.division, g.player_a as player, g.player_b as against,
           g.score_a as mine, g.score_b as theirs
    from public.games g
    where g.event_id = p_event_id and g.status = 'verified'
      and g.score_a is not null and g.player_b is not null

    union all

    select g.division, g.player_b, g.player_a, g.score_b, g.score_a
    from public.games g
    where g.event_id = p_event_id and g.status = 'verified'
      and g.score_a is not null and g.player_b is not null
  ),
  totals as (
    select
      s.player,
      s.division,
      count(*)::integer as played,
      count(*) filter (where s.mine > s.theirs)::integer as wins,
      count(*) filter (where s.mine < s.theirs)::integer as losses,
      count(*) filter (where s.mine = s.theirs)::integer as draws,
      coalesce(sum(s.mine - s.theirs), 0)::integer as spread,
      max(s.mine)::integer as best_score,
      max(s.mine - s.theirs)::integer as best_margin
    from sides s
    group by s.player, s.division
  ),
  /* Who the best game was against, chosen by the same margin that named it. */
  best as (
    select distinct on (s.player) s.player, s.against
    from sides s
    order by s.player, (s.mine - s.theirs) desc, s.mine desc
  )
  select
    r.id,
    r.data ->> 'playerNumber',
    btrim(r.data ->> 'fullName'),
    coalesce(r.data ->> 'email', ''),
    t.division,
    rank() over (
      partition by t.division
      order by t.wins desc, t.spread desc, btrim(r.data ->> 'fullName')
    )::integer,
    t.played, t.wins, t.losses, t.draws, t.spread,
    t.best_score, t.best_margin,
    btrim(o.data ->> 'fullName')
  from totals t
  join public.records r on r.id = t.player
  left join best b on b.player = t.player
  left join public.records o on o.id = b.against
  where public.is_staff('org-federation')
  order by t.division, t.wins desc, t.spread desc, btrim(r.data ->> 'fullName');
$$;

revoke all on function public.event_final_summary(text) from public, anon;
grant execute on function public.event_final_summary(text) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.event_final_summary(text)', 'execute') then
    raise exception 'the final summary carries email addresses and must not be public';
  end if;
  raise notice 'final summary is staff-only';
end $$;
