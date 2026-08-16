-- Whether a break is a break or lunch.
--
-- Both are the same phase: the room stops, the clock is not running, and the next round is
-- being prepared. Making lunch its own phase would mean teaching every screen in the
-- application about a state that behaves identically to one it already knows — and one more
-- branch for the pairing, the participant view and the phase machine to get wrong.
--
-- What differs is only what the wall says, and a room reads a screen very differently when
-- it says "lunch" rather than "back shortly". So this is a label on the event, not a state.

create or replace function public.staff_set_break_kind(p_event_id text, p_kind text)
returns text
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

  if p_kind not in ('break', 'lunch') then
    raise exception 'A break is either a break or lunch';
  end if;

  update public.events
  set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('breakKind', p_kind),
      updated_at = now()
  where id = p_event_id;

  return p_kind;
end $$;

/** Readable by the wall, which has no session. */
create or replace function public.event_break_kind(p_event_id text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(data ->> 'breakKind', 'break')
  from public.events
  where id = p_event_id;
$$;

revoke all on function public.staff_set_break_kind(text, text) from public, anon;
grant execute on function public.staff_set_break_kind(text, text) to authenticated;

grant execute on function public.event_break_kind(text) to anon, authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.staff_set_break_kind(text, text)', 'execute') then
    raise exception 'anon can call lunch';
  end if;

  if public.event_break_kind('evt-alphabattle-23-august') <> 'break' then
    raise exception 'a break should default to a break';
  end if;

  raise notice 'break or lunch: staff choose, the wall reads';
end $$;
