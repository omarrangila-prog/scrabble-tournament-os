-- Which tables each division sits at.
--
-- Pairing numbers boards 1, 2, 3… in the order it makes them. In a room that is fine until
-- somebody has to find their seat: if the beginners are at tables 1 to 5 and the
-- recreational players at 6 to 12, then "Board 3" and "Table 3" are different places, and
-- the player is standing in the wrong one.
--
-- The plan is stored on the event so every screen reads the same one. It is a decision about
-- a room, not about a browser — the wall display, the director's phone and the participant
-- all have to agree about where table 7 is.
--
-- Held as JSON rather than as its own table. It is a handful of numbers per division, read
-- with the event and never queried on its own, and a table would mean a join on every screen
-- that shows a board.

/**
 * Sets the table plan.
 *
 * Given as `[{"division":"beginner","tables":[1,2,3,4,5]}, …]`. The whole plan is replaced
 * at once, because divisions are decided against each other — moving the beginners to 1–6
 * only makes sense alongside moving the recreational players off table 6.
 */
create or replace function public.staff_set_table_plan(p_event_id text, p_plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
begin
  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  if not public.is_staff(v_org) then
    raise exception 'Not authorised';
  end if;

  if jsonb_typeof(p_plan) <> 'array' then
    raise exception 'The table plan must be a list of divisions';
  end if;

  update public.events
  set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('tablePlan', p_plan),
      updated_at = now()
  where id = p_event_id;

  return p_plan;
end $$;

/**
 * The table plan, for anybody.
 *
 * Public because a participant's phone shows their table number, and the venue screen shows
 * the room. It says which numbered tables a division occupies and nothing about any person.
 */
create or replace function public.event_table_plan(p_event_id text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(data -> 'tablePlan', '[]'::jsonb)
  from public.events
  where id = p_event_id;
$$;

revoke all on function public.staff_set_table_plan(text, jsonb) from public, anon;
grant execute on function public.staff_set_table_plan(text, jsonb) to authenticated;

grant execute on function public.event_table_plan(text) to anon, authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.staff_set_table_plan(text, jsonb)', 'execute') then
    raise exception 'anon can rearrange the room';
  end if;

  if public.event_table_plan('no-such-event') is not null then
    raise exception 'an unknown event returned a table plan';
  end if;

  raise notice 'table plan: staff set it, anybody may read where a division sits';
end $$;
