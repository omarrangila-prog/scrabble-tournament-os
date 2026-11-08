-- Two players with the same name are two people on the public pages.
--
-- The public results, standings and board lists identify players by name, and the standings group
-- by it. Froebel High School has a Zoya in Section A and a Zoya in Section B, so the results page
-- added both girls' games together under one "Zoya" and counted 17 players instead of 18.
--
-- A name shared with somebody else in the same event now carries the player's section, or their
-- player number when there is no section: "Zoya (Section A)". A name nobody else has is unchanged.

create or replace function public.public_player_name(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select btrim(coalesce(r.data ->> 'fullName', ''))
    || case
         when exists (
           select 1 from public.records o
           where o.event_id = r.event_id and o.collection = r.collection and o.id <> r.id
             and o.status = 'active'
             and lower(btrim(coalesce(o.data ->> 'fullName', ''))) = lower(btrim(coalesce(r.data ->> 'fullName', '')))
         )
         then ' (' || coalesce(nullif(btrim(r.data -> 'answers' ->> 'section'), ''), '#' || coalesce(r.data ->> 'playerNumber', '?')) || ')'
         else ''
       end
  from public.records r
  where r.id = p_id;
$$;

revoke all on function public.public_player_name(uuid) from public;
grant execute on function public.public_player_name(uuid) to anon, authenticated;

do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.event_public_games(text)'::regprocedure);
  v_def := replace(v_def, $q$btrim(coalesce(ra.data ->> 'fullName', ''))$q$, 'public.public_player_name(ra.id)');
  v_def := replace(v_def, $q$btrim(coalesce(rb.data ->> 'fullName', ''))$q$, 'public.public_player_name(rb.id)');
  if v_def not like '%public_player_name(ra.id)%' or v_def not like '%public_player_name(rb.id)%' then
    raise exception 'event_public_games was not patched';
  end if;
  execute v_def;

  v_def := pg_get_functiondef('public.event_standings(text)'::regprocedure);
  v_def := replace(v_def, $q$r.data ->> 'fullName'$q$, 'public.public_player_name(r.id)');
  if v_def like '%fullName%' then
    raise exception 'event_standings was not patched';
  end if;
  execute v_def;

  v_def := pg_get_functiondef('public.event_round_boards(text,integer)'::regprocedure);
  v_def := replace(v_def, $q$ra.data ->> 'fullName'$q$, 'public.public_player_name(ra.id)');
  v_def := replace(v_def, $q$rb.data ->> 'fullName'$q$, 'public.public_player_name(rb.id)');
  if v_def like '%''fullName''%' then
    raise exception 'event_round_boards was not patched';
  end if;
  execute v_def;
end $$;

-- Proof: the two Zoyas come back as two different names, and a unique name is untouched.
do $$
declare
  v_names text[];
begin
  select array_agg(public.public_player_name(id) order by data ->> 'playerNumber') into v_names
  from public.records where event_id = 'evt-froebel-high-school' and data ->> 'fullName' in ('Zoya', 'Rania');
  if v_names is null then
    return;
  end if;
  if not ('Zoya (Section A)' = any(v_names) and 'Zoya (Section B)' = any(v_names) and 'Rania' = any(v_names)) then
    raise exception 'namesakes not told apart: %', v_names;
  end if;
end $$;
