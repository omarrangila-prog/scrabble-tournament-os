-- The night-before draw survives the night.
--
-- A preliminary Round 1 is worth making the evening before, and worth nothing if it lives in
-- the browser that made it — the laptop at midnight is not always the laptop at nine. So it
-- is stored on the event, beside the categories and the table plan, as the one draft the
-- morning reconciles against.
--
-- It is never a round. `games` holds published rounds, and this is explicitly not one: it is
-- a guess made before anybody arrived, and the morning decides which parts of it stand. Kept
-- in `events.data` rather than in `games` so that nothing which reads rounds — the wall, the
-- score desk, the standings — can ever mistake it for one.

create or replace function public.event_preliminary_draw(p_event_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select data -> 'preliminaryDraw' from public.events where id = p_event_id;
$$;

revoke all on function public.event_preliminary_draw(text) from public, anon;
grant execute on function public.event_preliminary_draw(text) to authenticated;

-- ---------------------------------------------------------------------------

create or replace function public.staff_save_preliminary_draw(
  p_event_id text,
  p_draw jsonb,
  p_by text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_pairs integer;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  /*
   * Refused once Round 1 exists. A preliminary draw is for a round that has not been made;
   * saving one over a published round would put two versions of Round 1 on the same event.
   */
  if exists (select 1 from public.games where event_id = p_event_id and round = 1) then
    raise exception 'Round 1 has already been published. A preliminary draw is no longer needed.';
  end if;

  /* Null clears it, which is how a director throws the sheet away and starts again. */
  if p_draw is null or jsonb_typeof(p_draw) = 'null' then
    update public.events
    set data = data - 'preliminaryDraw', updated_at = now()
    where id = p_event_id;

    perform public.write_audit_log(
      v_org, p_event_id, coalesce(nullif(btrim(coalesce(p_by, '')), ''), 'unknown'),
      'clear-preliminary-draw', '{}'::jsonb);
    return true;
  end if;

  if jsonb_typeof(p_draw -> 'pairs') <> 'array' then
    raise exception 'A preliminary draw needs a list of pairs';
  end if;

  v_pairs := jsonb_array_length(p_draw -> 'pairs');

  update public.events
  set data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
        'preliminaryDraw', p_draw || jsonb_build_object(
          'savedAt', now(),
          'savedBy', coalesce(nullif(btrim(coalesce(p_by, '')), ''), 'unknown'))),
      updated_at = now()
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(btrim(coalesce(p_by, '')), ''), 'unknown'),
    'save-preliminary-draw',
    jsonb_build_object('pairs', v_pairs, 'unpaired', jsonb_array_length(coalesce(p_draw -> 'unpaired', '[]'::jsonb))));

  return true;
end $$;

revoke all on function public.staff_save_preliminary_draw(text, jsonb, text) from public, anon;
grant execute on function public.staff_save_preliminary_draw(text, jsonb, text) to authenticated;
