-- Standings published by the tournament software, kept as published.
--
-- The 20 September event was paired and scored in tsh, and tsh produced the final standings.
-- Those are the official figures: they are what was read out, what the ratings were computed
-- from, and what a player will compare any screen against.
--
-- This application derives standings from the games it holds, which is right when it is the
-- thing running the tournament and wrong here — it holds one unscored round. A derived table
-- built from that would disagree with the published one, and of the two, the published one is
-- correct. So an event may carry an official table, and every public surface prefers it.
--
-- The same reasoning the static August results page already follows: "nothing here is
-- recomputed, so this page and the ranking report cannot disagree."
--
-- Stored on the event rather than in `games`, because these are not games. No board, no
-- table, no pairing — a row here is a final position and the record behind it.

create or replace function public.event_official_standings(p_event_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select data -> 'officialStandings' from public.events where id = p_event_id;
$$;

revoke all on function public.event_official_standings(text) from public, anon;
grant execute on function public.event_official_standings(text) to authenticated, anon;

-- ---------------------------------------------------------------------------

create or replace function public.staff_set_official_standings(
  p_event_id text,
  p_standings jsonb,
  p_source text default null,
  p_by text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_count integer;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  /* Null clears it, and the event goes back to standings derived from its own games. */
  if p_standings is null or jsonb_typeof(p_standings) = 'null' then
    update public.events set data = data - 'officialStandings', updated_at = now()
    where id = p_event_id;

    perform public.write_audit_log(
      v_org, p_event_id, coalesce(nullif(btrim(coalesce(p_by, '')), ''), 'unknown'),
      'clear-official-standings', '{}'::jsonb);
    return 0;
  end if;

  if jsonb_typeof(p_standings) <> 'array' then
    raise exception 'Official standings must be a JSON array';
  end if;

  /*
   * Every row needs a name, a category and a placing. A table missing any of those cannot be
   * read out, and a half-filled row is worse than a refusal because it looks complete.
   */
  if exists (
    select 1 from jsonb_array_elements(p_standings) as r
    where coalesce(btrim(r ->> 'name'), '') = ''
       or coalesce(btrim(r ->> 'division'), '') = ''
       or (r ->> 'rank') is null
  ) then
    raise exception 'Every standings row needs a name, a division and a rank';
  end if;

  v_count := jsonb_array_length(p_standings);

  update public.events
  set data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
        'officialStandings', jsonb_build_object(
          'source', coalesce(nullif(btrim(coalesce(p_source, '')), ''), 'entered by hand'),
          'recordedAt', now(),
          'recordedBy', coalesce(nullif(btrim(coalesce(p_by, '')), ''), 'unknown'),
          'rows', p_standings)),
      updated_at = now()
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(btrim(coalesce(p_by, '')), ''), 'unknown'),
    'set-official-standings',
    jsonb_build_object('rows', v_count, 'source', p_source));

  return v_count;
end $$;

revoke all on function public.staff_set_official_standings(text, jsonb, text, text) from public, anon;
grant execute on function public.staff_set_official_standings(text, jsonb, text, text) to authenticated;
