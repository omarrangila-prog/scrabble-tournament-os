-- Make the staff check-in functions write a check-in method the table accepts.
--
-- `staff_check_in` wrote 'staff' and `staff_add_walkin` wrote 'staff-walkin'. The
-- column has carried a check constraint since 0006 allowing only 'personal_link',
-- 'venue_qr' and 'staff_manual', so both functions failed on every call with a
-- constraint violation.
--
-- Neither had ever been run. They were written, reviewed, typechecked, and their
-- signatures cross-checked against the client — and none of that touches a value
-- inside a function body against a constraint declared ten migrations earlier. It
-- took inserting four test registrations and actually checking them in.
--
-- What this would have cost: on the morning of the event, every attempt to check
-- somebody in from the roster and every walk-in added at the desk would have
-- failed. The self check-in path was unaffected — it passes 'personal_link' or
-- 'venue_qr' — so the failure would have looked like "the desk is broken but
-- people's phones work", which is a bad thing to be diagnosing at 09:00.
--
-- 'staff_manual' for both. A walk-in is still distinguishable: its document
-- carries `source: 'walk-in'`, which is where that belongs.

create or replace function public.staff_check_in(p_record_id uuid)
returns table (out_checked_in_at timestamptz, out_already boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing timestamptz;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select checked_in_at into v_existing
  from public.records
  where id = p_record_id and collection = 'registrations';

  if not found then
    raise exception 'No such registration';
  end if;

  -- Already in: keep the original arrival time. The first time they walked
  -- through the door is the true one, and a second tap must not rewrite it.
  if v_existing is not null then
    return query select v_existing, true;
    return;
  end if;

  update public.records
  set checked_in_at = now(),
      check_in_method = 'staff_manual',
      updated_at = now()
  where id = p_record_id
  returning checked_in_at into v_existing;

  return query select v_existing, false;
end $$;

create or replace function public.staff_add_walkin(
  p_event_id text,
  p_full_name text,
  p_mobile text,
  p_playing_level text,
  p_amount numeric default 0,
  p_by text default null
)
returns table (out_id uuid, out_check_in_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_code text;
  v_attempts integer := 0;
  v_id uuid;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'A name is required';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  loop
    v_code := lpad((floor(random() * 900000) + 100000)::text, 6, '0');
    exit when not exists (
      select 1 from public.records
      where event_id = p_event_id and check_in_code = v_code
    );

    v_attempts := v_attempts + 1;
    if v_attempts > 40 then
      raise exception 'Could not allocate a check-in code';
    end if;
  end loop;

  insert into public.records (
    collection, organization_id, event_id, data,
    check_in_code, checked_in_at, check_in_method
  )
  values (
    'registrations',
    v_org,
    p_event_id,
    jsonb_build_object(
      'fullName', trim(p_full_name),
      'mobile', coalesce(trim(p_mobile), ''),
      'email', '',
      'preferredDivision', p_playing_level,
      'confirmedDivision', p_playing_level,
      'status', 'approved',
      'paymentStatus', 'unpaid',
      'amountDue', coalesce(p_amount, 0),
      'currency', 'PKR',
      -- Where the distinction between a walk-in and a form entry belongs.
      'source', 'walk-in',
      'addedBy', coalesce(p_by, 'staff')
    ),
    v_code,
    now(),
    'staff_manual'
  )
  returning id into v_id;

  return query select v_id, v_code;
end $$;

revoke all on function public.staff_check_in(uuid) from public;
revoke all on function public.staff_check_in(uuid) from anon;
revoke all on function public.staff_add_walkin(text, text, text, text, numeric, text) from public;
revoke all on function public.staff_add_walkin(text, text, text, text, numeric, text) from anon;

grant execute on function public.staff_check_in(uuid) to authenticated;
grant execute on function public.staff_add_walkin(text, text, text, text, numeric, text) to authenticated;

/*
 * Assert the method values agree with the constraint.
 *
 * The original fault was a string inside a function body disagreeing with a
 * constraint declared elsewhere, which no amount of reading either one in
 * isolation would reveal. This compares them.
 */
do $$
declare
  allowed text;
begin
  select pg_get_constraintdef(oid) into allowed
  from pg_constraint where conname = 'records_check_in_method_check';

  if allowed is null then
    raise exception 'The check_in_method constraint is missing.';
  end if;

  if position('staff_manual' in allowed) = 0 then
    raise exception 'staff_manual is not an accepted check-in method: %', allowed;
  end if;

  raise notice 'check_in_method constraint accepts staff_manual';
end $$;
