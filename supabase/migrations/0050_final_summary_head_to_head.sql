-- Closes the last gap from the Phase 1 audit: three rankings of the same tournament that
-- could disagree.
--
-- `event_standings` (the wall, `0034_public_standings.sql`) orders by wins, spread, name —
-- deliberately, and says so in its own comment: a wall showing a slightly different order
-- from the certificate would be worse than a wall showing none, so it stays simple on
-- purpose. That is not touched here.
--
-- `event_final_summary` is not the wall. It is what names a winner — it drives the closing
-- screen and the certificates — and its own comment claimed to copy the wall's rule exactly,
-- which meant it was missing the one criterion the TypeScript engine's `compareByRules`
-- actually applies before falling back to name: head-to-head. Two players level on wins and
-- spread within a division would have been ordered by name here and by who beat whom there.
--
-- `compareByRules` breaks that specific tie by score in the one game the two players played
-- against each other. SQL orders by a single key per row, not a pairwise comparison, so a
-- single number is computed per player instead: their net score margin against opponents who
-- share their exact (division, wins, spread) — which is exactly the pairwise comparison when
-- two players are tied, and the standard head-to-head-within-the-group generalisation when
-- three or more are.
--
-- For the 23 August event this changes nothing: no division has two players level on both
-- wins and spread, so the criterion this adds was never reached and every certificate already
-- issued still ranks exactly as it does today. It matters for the next tie.

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
  ),
  /*
   * Net margin against opponents level on wins and spread within the same division — the
   * head-to-head tiebreak. Zero for anybody with no tied opponent, which is every player in
   * a tournament with no ties at all, and leaves the wins/spread order exactly as it was.
   */
  head_to_head as (
    select s.player, coalesce(sum(s.mine - s.theirs), 0)::integer as tie_signal
    from sides s
    join totals pt on pt.player = s.player
    join totals ot on ot.player = s.against
    where ot.division = pt.division and ot.wins = pt.wins and ot.spread = pt.spread
    group by s.player
  )
  select
    r.id,
    r.data ->> 'playerNumber',
    btrim(r.data ->> 'fullName'),
    coalesce(r.data ->> 'email', ''),
    t.division,
    rank() over (
      partition by t.division
      order by t.wins desc, t.spread desc, coalesce(h.tie_signal, 0) desc, btrim(r.data ->> 'fullName')
    )::integer,
    t.played, t.wins, t.losses, t.draws, t.spread,
    t.best_score, t.best_margin,
    btrim(o.data ->> 'fullName')
  from totals t
  join public.records r on r.id = t.player
  left join head_to_head h on h.player = t.player
  left join best b on b.player = t.player
  left join public.records o on o.id = b.against
  where public.is_staff('org-federation')
  order by t.division, t.wins desc, t.spread desc, coalesce(h.tie_signal, 0) desc, btrim(r.data ->> 'fullName');
$$;

revoke all on function public.event_final_summary(text) from public, anon;
grant execute on function public.event_final_summary(text) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.event_final_summary(text)', 'execute') then
    raise exception 'the final summary carries email addresses and must not be public';
  end if;
  raise notice 'final summary is staff-only, head-to-head tiebreak applied';
end $$;
