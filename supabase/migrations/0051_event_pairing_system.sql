-- The pairing format becomes a real, saved per-event setting.
--
-- FormatPicker.tsx (src/components/forms/FormatPicker.tsx) has existed since before this
-- session, complete with recommendations and suitability warnings — and was imported nowhere
-- reachable. tournament.system was a constant baked into the seed file, "swiss", forever.
-- Round robin and King of the Hill now have real generators (Phase 2 unit 1); this is what
-- lets a director's choice of one actually reach them, the same way round count and round
-- length already do.
--
-- Same shape as 0040_event_format.sql: held in events.data, staff can set it, the wall (and
-- anyone else with no session) can read it back. `create or replace` cannot change the
-- return-table shape of an existing function — confirmed the hard way earlier this
-- session — so both functions are dropped by their old signature first.

drop function if exists public.staff_set_event_format(text, integer, integer);

create function public.staff_set_event_format(
  p_event_id text,
  p_rounds integer,
  p_round_minutes integer,
  p_pairing_system text default 'swiss'
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

  if p_rounds is null or p_rounds < 1 or p_rounds > 12 then
    raise exception 'A tournament has between 1 and 12 rounds, not %', p_rounds;
  end if;

  if p_round_minutes is null or p_round_minutes < 5 or p_round_minutes > 90 then
    raise exception 'A round runs between 5 and 90 minutes, not %', p_round_minutes;
  end if;

  if p_pairing_system not in ('swiss', 'round-robin', 'knockout', 'king-of-the-hill', 'manual') then
    raise exception 'Unknown pairing system %', p_pairing_system;
  end if;

  update public.events
  set data = coalesce(data, '{}'::jsonb)
             || jsonb_build_object('rounds', p_rounds, 'roundMinutes', p_round_minutes, 'pairingSystem', p_pairing_system),
      updated_at = now()
  where id = p_event_id;

  return true;
end $$;

revoke all on function public.staff_set_event_format(text, integer, integer, text) from public, anon;
grant execute on function public.staff_set_event_format(text, integer, integer, text) to authenticated;

drop function if exists public.event_format(text);

create function public.event_format(p_event_id text)
returns table (out_rounds integer, out_round_minutes integer, out_pairing_system text)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((data ->> 'rounds')::integer, 5),
    coalesce((data ->> 'roundMinutes')::integer, 20),
    coalesce(data ->> 'pairingSystem', 'swiss')
  from public.events
  where id = p_event_id;
$$;

revoke all on function public.event_format(text) from public;
grant execute on function public.event_format(text) to anon, authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.staff_set_event_format(text, integer, integer, text)', 'execute') then
    raise exception 'a participant must not be able to change the pairing system';
  end if;
  if (select count(*) from pg_proc where proname = 'staff_set_event_format') <> 1 then
    raise exception 'expected exactly one staff_set_event_format overload, found %',
      (select count(*) from pg_proc where proname = 'staff_set_event_format');
  end if;
  raise notice 'pairing system is settable by staff and readable by the wall';
end $$;
