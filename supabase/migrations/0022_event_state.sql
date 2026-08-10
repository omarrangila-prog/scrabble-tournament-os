-- Put the event's phase in the database, where every device can see it.
--
-- The phase decides what a participant's phone shows: register, check in, find your
-- board, or final results. It was held in browser storage, which means it was held
-- once per device — the director's "Open check-in" wrote to the director's laptop
-- and nothing else. Every participant's phone had its own copy, seeded to
-- `registration-open` and never changed by anything.
--
-- So the venue QR and the personal link showed "Registration is open — Register
-- now" on the morning of the event, and would have kept showing it all day, no
-- matter what the director pressed. Somebody scanning the code to find their board
-- would have been sent to fill in the form they had already filled in.
--
-- The `events` table has carried a `state` column since the first migration and
-- nothing read or wrote it. This is the read and the write.

/**
 * The event's current phase, readable by anybody.
 *
 * Public because it has to be: a participant with no account needs to know whether
 * to register, check in, or look for their board. It returns one word and nothing
 * else — no capacity, no counts, no names.
 *
 * Returns 'draft' for an unknown event rather than raising, so a mistyped link
 * shows "nothing to do here yet" instead of an error.
 */
create or replace function public.event_public_state(p_event_id text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select state from public.events where id = p_event_id),
    'draft'
  );
$$;

/**
 * Moves the event to a new phase. Staff only.
 *
 * The phase list is checked here rather than trusted from the client. A browser
 * that sent 'everything-is-fine' would otherwise write it to the column, and every
 * participant's phone would fall through to whatever the app does with a state it
 * does not recognise.
 */
create or replace function public.staff_set_event_state(p_event_id text, p_state text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state text;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  if p_state not in (
    'draft', 'registration-open', 'registration-closed', 'preparing',
    'check-in-open', 'check-in-closed', 'round-published', 'round-active',
    'result-entry', 'break', 'final-review', 'completed', 'archived'
  ) then
    raise exception 'Unknown event state %', p_state;
  end if;

  update public.events
  set state = p_state,
      updated_at = now()
  where id = p_event_id
  returning state into v_state;

  if v_state is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  return v_state;
end $$;

revoke all on function public.staff_set_event_state(text, text) from public;
revoke all on function public.staff_set_event_state(text, text) from anon;
grant execute on function public.staff_set_event_state(text, text) to authenticated;

-- Anyone may ask what phase the event is in. That is the whole point.
grant execute on function public.event_public_state(text) to anon, authenticated;

do $$
declare
  v_state text;
begin
  select public.event_public_state('evt-alphabattle-23-august') into v_state;
  if v_state is null or v_state = 'draft' then
    raise exception 'The 23 August event has no readable state (got %)', v_state;
  end if;

  if has_function_privilege('anon', 'public.staff_set_event_state(text, text)', 'execute') then
    raise exception 'anon can change the event phase';
  end if;

  if not has_function_privilege('anon', 'public.event_public_state(text)', 'execute') then
    raise exception 'anon cannot read the event phase, so no phone can follow the day';
  end if;

  raise notice 'event phase is readable by anon (%) and writable only by staff', v_state;
end $$;
