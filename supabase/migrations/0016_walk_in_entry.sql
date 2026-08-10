-- Adding a player at the door.
--
-- The roster now comes from the database, which closed a hole and opened another:
-- the only way onto the roster was the public form. On the day people arrive who
-- never filled it in — a friend brought along, a sibling, someone who paid cash at
-- the table. Before this they could only be added to browser storage, where they
-- were invisible to every other device and gone on refresh.
--
-- A walk-in is physically standing at the desk, so they are recorded as arrived in
-- the same breath. Payment is not assumed: it is recorded unpaid and a human
-- verifies it, exactly like a bank transfer.

/**
 * Registers somebody at the door and checks them in.
 *
 * Staff only. Returns the check-in code, which is what the participant is given
 * so they can look themselves up later.
 *
 * The code is generated here rather than accepted from the browser, so a client
 * cannot choose a code that collides with somebody else's or guess at one that
 * already exists.
 */
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

  /*
   * Six digits, retried on collision. The unique index on (event_id,
   * check_in_code) is what actually guarantees uniqueness; this loop just keeps
   * the insert from failing on an unlucky draw. Giving up after 40 tries is
   * better than looping forever if the space somehow fills.
   */
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
      -- Recorded so a walk-in is never mistaken for a form registration.
      'source', 'walk-in',
      'addedBy', coalesce(p_by, 'staff')
    ),
    v_code,
    now(),
    'staff-walkin'
  )
  returning id into v_id;

  return query select v_id, v_code;
end $$;

revoke all on function public.staff_add_walkin(text, text, text, text, numeric, text) from public;
grant execute on function public.staff_add_walkin(text, text, text, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Checking somebody in from the roster
-- ---------------------------------------------------------------------------

/**
 * Marks a player present, by row rather than by code.
 *
 * Self check-in needs the participant's code or personal link, which is what keeps
 * one person from checking in another. Staff at the desk are looking at a list of
 * names and have no code to type, so they need a different door — this one, which
 * requires staff membership instead.
 *
 * Idempotent: checking in somebody who is already in leaves the original arrival
 * time alone. The first time they walked through the door is the true one, and an
 * accidental second tap must not rewrite it.
 */
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

  if v_existing is not null then
    return query select v_existing, true;
    return;
  end if;

  update public.records
  set checked_in_at = now(),
      check_in_method = 'staff',
      updated_at = now()
  where id = p_record_id
  returning checked_in_at into v_existing;

  return query select v_existing, false;
end $$;

/**
 * Undoes a check-in.
 *
 * Staff tap the wrong row; the fix has to exist or the arrival count is wrong for
 * the rest of the day. Separate from `staff_check_in` so it cannot happen by
 * accident, and staff-only for the obvious reason that a participant must not be
 * able to un-arrive somebody else.
 */
create or replace function public.staff_undo_check_in(p_record_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff('org-federation') then
    return false;
  end if;

  update public.records
  set checked_in_at = null,
      check_in_method = null,
      updated_at = now()
  where id = p_record_id and collection = 'registrations';

  return true;
end $$;

revoke all on function public.staff_check_in(uuid) from public;
revoke all on function public.staff_undo_check_in(uuid) from public;
grant execute on function public.staff_check_in(uuid) to authenticated;
grant execute on function public.staff_undo_check_in(uuid) to authenticated;
