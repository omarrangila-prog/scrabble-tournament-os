-- A walk-in gets everything a registration gets.
--
-- `staff_add_walkin` created a record, a check-in code and an arrival time, and stopped
-- there. It never assigned a player number — so the desk added somebody at the door and
-- handed them a badge with nothing on it, while every other player had a number that the
-- pairing sheet, the wall and the score desk all refer to them by.
--
-- It also hardcoded `paymentStatus` to 'unpaid' whatever the desk had just been handed. A
-- walk-in paying cash at the door is the ordinary case, and recording it as unpaid means the
-- desk's own takings do not add up at the end of the day.
--
-- And it asked for four things where the desk needs seven. Age, rating and a note are not
-- decoration: age decides eligibility for some sections, a rating is what seeds a player, and
-- the note is where "paid Ahmed, will settle later" goes. Without somewhere to put them the
-- desk writes them on paper, which is where the last tournament's roster came from.
--
-- The old signature is dropped rather than overloaded: two functions differing only by
-- defaulted arguments make a six-argument call ambiguous, and the error appears at the desk.

drop function if exists public.staff_add_walkin(text, text, text, text, numeric, text);

create function public.staff_add_walkin(
  p_event_id text,
  p_full_name text,
  p_mobile text,
  p_playing_level text,
  p_amount numeric default 0,
  p_by text default null,
  p_age text default null,
  p_rating text default null,
  p_payment_status text default 'cash-at-venue',
  p_note text default null
)
returns table (out_id uuid, out_check_in_code text, out_player_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_code text;
  v_attempts integer := 0;
  v_id uuid;
  v_number text;
  v_division text;
  v_payment text;
begin
  if not public.can_desk('org-federation') then
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
   * Normalised the same way every other path normalises it, so a walk-in entered as
   * "Regular / Advanced" is paired in the same division as somebody who chose it on the form.
   */
  v_division := public.division_for(p_playing_level);

  /*
   * What the desk was actually handed. An unrecognised value becomes a review rather than a
   * guess: money the desk is unsure about should stop at somebody's attention, not be
   * silently recorded as received or as owed.
   */
  v_payment := case
    when p_payment_status in ('verified', 'cash-at-venue', 'complimentary', 'not-submitted', 'review-required')
      then p_payment_status
    else 'review-required'
  end;

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

  /* The number on the badge, from the same sequence every other player draws from. */
  v_number := public.next_player_number(p_event_id);

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
      'playerNumber', v_number,
      'checkInCode', v_code,
      'preferredDivision', v_division,
      'confirmedDivision', v_division,
      'status', 'approved',
      'paymentStatus', v_payment,
      'paymentMethod', case when v_payment = 'complimentary' then 'complimentary' else 'cash' end,
      'amountDue', case when v_payment = 'complimentary' then 0 else coalesce(p_amount, 0) end,
      'discountAmount', 0,
      'currency', 'PKR',
      'answers', jsonb_strip_nulls(jsonb_build_object(
        'age', nullif(btrim(coalesce(p_age, '')), ''),
        'rating', nullif(btrim(coalesce(p_rating, '')), ''))),
      'selfRating', nullif(btrim(coalesce(p_rating, '')), ''),
      'deskNote', nullif(btrim(coalesce(p_note, '')), ''),
      'timeline', jsonb_build_array(jsonb_build_object(
        'at', now(),
        'by', coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'desk'),
        'entry', 'Added at the desk as a walk-in and checked in.')),
      -- Where the distinction between a walk-in and a form entry belongs.
      'source', 'walk-in',
      'addedBy', coalesce(p_by, 'staff')
    ),
    v_code,
    now(),
    'staff_manual'
  )
  returning id into v_id;

  perform public.write_audit_log(
    v_org,
    p_event_id,
    coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'unknown'),
    'add-walkin',
    jsonb_build_object(
      'name', btrim(p_full_name), 'mobile', p_mobile,
      'division', v_division, 'playerNumber', v_number,
      'payment', v_payment, 'amount', p_amount, 'code', v_code)
  );

  return query select v_id, v_code, v_number;
end $$;

revoke all on function public.staff_add_walkin(text, text, text, text, numeric, text, text, text, text, text)
  from public, anon;
grant execute on function public.staff_add_walkin(text, text, text, text, numeric, text, text, text, text, text)
  to authenticated;
