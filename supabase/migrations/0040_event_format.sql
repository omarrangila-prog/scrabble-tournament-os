-- How long a round runs, and how many there are.
--
-- On the event rather than in a browser, for the same reason the table plan is: the wall,
-- the director's phone and every participant have to agree. A length held in one laptop
-- would put a twenty-minute clock on the television and a twenty-five-minute one on a phone.
--
-- Both are decisions the director makes in the room, on the morning, once they have seen how
-- many people turned up and how much of the hall they have — so they are settings and not
-- constants in a build.

create or replace function public.staff_set_event_format(
  p_event_id text,
  p_rounds integer,
  p_round_minutes integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  /*
   * Bounds rather than a free number. A round of nought minutes ends before it starts and a
   * tournament of nought rounds has no winner; both are typos, and both would only be found
   * with a room full of people waiting.
   */
  if p_rounds is null or p_rounds < 1 or p_rounds > 12 then
    raise exception 'A tournament has between 1 and 12 rounds, not %', p_rounds;
  end if;

  if p_round_minutes is null or p_round_minutes < 5 or p_round_minutes > 90 then
    raise exception 'A round runs between 5 and 90 minutes, not %', p_round_minutes;
  end if;

  update public.events
  set data = coalesce(data, '{}'::jsonb)
             || jsonb_build_object('rounds', p_rounds, 'roundMinutes', p_round_minutes),
      updated_at = now()
  where id = p_event_id;

  return true;
end $$;

revoke all on function public.staff_set_event_format(text, integer, integer) from public, anon;
grant execute on function public.staff_set_event_format(text, integer, integer) to authenticated;

/**
 * The format, readable by anyone — the wall needs it and has no account.
 */
create or replace function public.event_format(p_event_id text)
returns table (out_rounds integer, out_round_minutes integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((data ->> 'rounds')::integer, 5),
    coalesce((data ->> 'roundMinutes')::integer, 20)
  from public.events
  where id = p_event_id;
$$;

revoke all on function public.event_format(text) from public;
grant execute on function public.event_format(text) to anon, authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.staff_set_event_format(text, integer, integer)', 'execute') then
    raise exception 'a participant must not be able to change the round length';
  end if;
  raise notice 'event format is settable by staff and readable by the wall';
end $$;
