-- Player check-in has never worked. Two defects, one cause.
--
-- `check_in_registration` is the only table-returning function in this schema whose output
-- columns are not prefixed `out_`. That single slip breaks it twice over:
--
--   1. It returns a column named `checked_in_at`, and `records` has a column named
--      `checked_in_at`. The final UPDATE says `where id = rec.id and checked_in_at is null`,
--      and Postgres cannot tell which one is meant:
--
--        ERROR:  column reference "checked_in_at" is ambiguous
--        CONTEXT: PL/pgSQL function check_in_registration(text,text,text,text) line 42
--
--      Not conditional. It fires whenever the function reaches its update, which is every
--      check-in that would otherwise have succeeded.
--
--   2. `checkInParticipant` in src/lib/supabase/registrations.ts reads `out_result`,
--      `out_full_name`, `out_checked_in_at` and `out_message` — the convention every other
--      RPC follows. Those keys are undefined here, so even with the SQL fixed the success
--      branch never runs and the call falls through to the blocked branch.
--
-- The two failures hide each other. The thrown error is caught and shown to the player as
-- "We could not check you in. Please see the event desk." That reads like a policy rather
-- than a fault, so it has most likely been absorbed as normal on event day instead of
-- reported as a bug. Staff check-in uses `staff_check_in`, a different function, which
-- works — which is why the tournament has run at all.
--
-- Renaming the output columns fixes both at once: the client's keys start matching, and the
-- bare `checked_in_at` in the UPDATE resolves unambiguously to the table column.
--
-- The body is otherwise unchanged. `for update` still takes the row lock, the guard against
-- a second arrival still holds, and the database still stamps its own clock.

-- The return shape changes, so `create or replace` cannot do it.
drop function if exists public.check_in_registration(text, text, text, text);

create function public.check_in_registration(
  p_event_id text,
  p_code text,
  p_token text,
  p_method text
)
returns table (
  out_result text,
  out_full_name text,
  out_checked_in_at timestamptz,
  out_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.records;
  v_block text;
begin
  if p_method not in ('personal_link', 'venue_qr', 'staff_manual') then
    return query select 'blocked', null::text, null::timestamptz,
      'That check-in method is not recognised.';
    return;
  end if;

  select * into rec
  from public.records r
  where r.collection = 'registrations'
    and r.event_id = p_event_id
    and r.status = 'active'
    and (
      (p_code is not null and r.check_in_code = regexp_replace(p_code, '\D', '', 'g'))
      or (p_token is not null and r.data ->> 'token' = btrim(p_token))
    )
  limit 1
  for update;

  if not found then
    return query select 'not_found', null::text, null::timestamptz,
      'We could not find that code. Please check and try again.';
    return;
  end if;

  if rec.checked_in_at is not null then
    return query select 'already_checked_in', rec.data ->> 'fullName', rec.checked_in_at,
      'You are already checked in.';
    return;
  end if;

  v_block := public.checkin_payment_gate(rec.data ->> 'paymentStatus');
  if v_block is not null then
    return query select 'blocked', rec.data ->> 'fullName', null::timestamptz, v_block;
    return;
  end if;

  /*
   * `checked_in_at` here is now unambiguously the table's column, because the only other
   * thing that carried the name was this function's own output.
   */
  update public.records
  set checked_in_at = now(),
      check_in_method = p_method,
      updated_at = now()
  where id = rec.id
    and checked_in_at is null;

  return query select 'checked_in', rec.data ->> 'fullName', now(),
    'You are checked in.';
end $$;

revoke all on function public.check_in_registration(text, text, text, text) from public;
grant execute on function public.check_in_registration(text, text, text, text)
  to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'check_in_registration'
      and pg_get_function_result(p.oid) like '%out_checked_in_at%'
  ) then
    raise exception 'check_in_registration did not take the out_ column names';
  end if;
  raise notice 'player check-in returns out_ columns and no longer raises on its own update';
end $$;
