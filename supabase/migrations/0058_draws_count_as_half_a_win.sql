-- A draw is worth half a win. The two SQL standings said it was worth nothing.
--
-- `event_standings` (the wall) and `event_final_summary` (the closing screen and every
-- certificate) both ordered by `count(*) filter (where mine > theirs)` — a raw count of
-- outright wins, with drawn games contributing nothing at all. The TypeScript engine has
-- always scored a draw as half a win (`standings.ts`: `wins + draws * 0.5`), which is the
-- Scrabble convention and the one the published 23 August results already use — they carry
-- records like "2.5 wins, 0.5 losses".
--
-- So a player who drew was ranked as though they had lost, on the wall and on their
-- certificate, while the engine that computes everything else said otherwise.
--
-- Proved before fixing, on a four-player field:
--
--   Alice  1 win + 2 draws = 2.0 points, spread +150
--   Bob    2 wins + 1 loss = 2.0 points, spread +100
--
-- Genuinely tied on points, and Alice ahead on spread — so Alice is first. Both functions
-- placed Bob first, and `event_final_summary` would have printed Alice a certificate saying
-- 2nd. Nobody in the 23 August event drew a game, so no certificate already issued is wrong;
-- this is a fix for every event from here.
--
-- Points, not wins, are what order a table. `wins` and `draws` stay separate in the output
-- because a record reads "3-1-1", not "3.5" — the change is to the ordering, not to what is
-- reported.

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
    /* Points: a win is one, a draw is half. This counted wins alone. */
    (count(*) filter (where s.mine > s.theirs)
      + count(*) filter (where s.mine = s.theirs) * 0.5) desc,
    coalesce(sum(s.mine - s.theirs), 0) desc,
    r.data ->> 'fullName';
$$;

revoke all on function public.event_standings(text) from public;
grant execute on function public.event_standings(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The closing screen and the certificates.
-- ---------------------------------------------------------------------------

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
      /* What orders the table. Reported separately from wins, which stays a win count. */
      (count(*) filter (where s.mine > s.theirs)
        + count(*) filter (where s.mine = s.theirs) * 0.5) as points,
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
   * Net margin against opponents level on points and spread within the same division — the
   * head-to-head tiebreak. Grouped on points rather than wins for the same reason as the
   * ordering: two players level at 2.0 are tied whether they got there by wins or by draws.
   */
  head_to_head as (
    select s.player, coalesce(sum(s.mine - s.theirs), 0)::integer as tie_signal
    from sides s
    join totals pt on pt.player = s.player
    join totals ot on ot.player = s.against
    where ot.division = pt.division and ot.points = pt.points and ot.spread = pt.spread
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
      order by t.points desc, t.spread desc, coalesce(h.tie_signal, 0) desc, btrim(r.data ->> 'fullName')
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
  order by t.division, t.points desc, t.spread desc, coalesce(h.tie_signal, 0) desc, btrim(r.data ->> 'fullName');
$$;

revoke all on function public.event_final_summary(text) from public, anon;
grant execute on function public.event_final_summary(text) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.event_final_summary(text)', 'execute') then
    raise exception 'the final summary carries email addresses and must not be public';
  end if;
  raise notice 'a draw is worth half a win, on the wall and on the certificate';
end $$;
