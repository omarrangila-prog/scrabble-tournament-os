-- One set of check-in rules, asked the same question by both paths.
--
-- The two paths were closer than the specification assumes — both already called
-- `checkin_payment_gate`, so payment was never the thing that diverged. What diverged was
-- everything around it, and one rule was missing from both.
--
-- Neither path looked at the event's state. A player holding last month's link could check
-- in to a completed tournament, and the desk could check somebody in to a draft. Nothing
-- refused, because nothing asked.
--
-- The payment rules move to what §13 asks for, and one of those changes real behaviour:
--
--   verified, complimentary          eligible, either path
--   cash at venue                    staff only — somebody has to take the money, and a
--                                    player checking themselves in walks past that moment
--   awaiting checking                staff may override with a reason
--   invalid, refunded, duplicate     director only, with a reason
--
-- Cash at venue used to fall through to eligible, so a self check-in skipped the payment
-- entirely. Requiring staff is the point of paying at the venue.
--
-- The service answers rather than decides: it says whether somebody may check in, what would
-- unblock it, and who would have to do it. Both callers ask the same question, so the two
-- paths cannot drift into different rules again.

drop function if exists public.check_in_eligibility(text, uuid, text);

create function public.check_in_eligibility(
  p_event_id text,
  p_registration_id uuid,
  p_actor text          -- 'self' or 'staff'
)
returns table (
  out_eligible boolean,
  out_reason text,
  out_requires_staff boolean,
  out_requires_director boolean,
  out_requires_payment boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_state text;
  v_payment text;
  v_already timestamptz;
begin
  select e.state into v_state from public.events e where e.id = p_event_id;
  if v_state is null then
    return query select false, 'We could not find that event.', false, false, false;
    return;
  end if;

  select r.data ->> 'paymentStatus', r.checked_in_at
  into v_payment, v_already
  from public.records r
  where r.id = p_registration_id and r.collection = 'registrations' and r.status = 'active';

  if not found then
    return query select false, 'We could not find that registration.', false, false, false;
    return;
  end if;

  if v_already is not null then
    /* Not an error, and not eligible either — there is nothing left to do. */
    return query select false, 'Already checked in.', false, false, false;
    return;
  end if;

  /*
   * State. Staff are blocked only where check-in is meaningless, because a desk refusing to
   * admit somebody who is standing in front of it is the worst failure this software has.
   * A player checking themselves in may only do so while check-in is actually open.
   */
  if p_actor = 'staff' then
    if v_state in ('draft', 'completed', 'archived') then
      return query select false,
        format('This event is %s. Check-in is closed.', v_state), false, false, false;
      return;
    end if;
  else
    if v_state <> 'check-in-open' then
      return query select false,
        'Check-in is not open yet. Please see the desk when it is.', true, false, false;
      return;
    end if;
  end if;

  -- Payment. -----------------------------------------------------------------

  if v_payment in ('verified', 'complimentary') then
    return query select true, null::text, false, false, false;
    return;
  end if;

  if v_payment = 'cash-at-venue' then
    if p_actor = 'staff' then
      /* Staff confirm collection as they check somebody in. That is the arrangement. */
      return query select true, null::text, false, false, true;
      return;
    end if;
    return query select false,
      'Please pay at the desk — a member of staff will check you in.', true, false, true;
    return;
  end if;

  if v_payment in ('invalid-receipt', 'duplicate-transaction', 'amount-mismatch', 'refunded') then
    return query select false,
      'Please see the event desk to complete your registration.', true, true, true;
    return;
  end if;

  if v_payment in ('not-submitted', 'receipt-uploaded', 'processing', 'review-required')
     or v_payment is null then
    return query select false,
      'Your payment is still being checked. Please see the desk.', true, false, true;
    return;
  end if;

  /* An unrecognised payment status must send somebody to a person, never wave them through. */
  return query select false,
    'Please see the event desk to complete your registration.', true, false, true;
end $$;

revoke all on function public.check_in_eligibility(text, uuid, text) from public;
grant execute on function public.check_in_eligibility(text, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Both paths ask it.
-- ---------------------------------------------------------------------------

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
  v_actor text;
  v_ok boolean;
  v_reason text;
begin
  if p_method not in ('personal_link', 'venue_qr', 'staff_manual') then
    return query select 'blocked', null::text, null::timestamptz,
      'That check-in method is not recognised.';
    return;
  end if;

  v_actor := case when p_method = 'staff_manual' then 'staff' else 'self' end;

  /*
   * `staff_manual` is a member of staff at the desk, and the desk is never closed to itself.
   * The two player-driven methods are what the flags govern.
   */
  if v_actor = 'self' and not public.event_flag(p_event_id, 'self_checkin_enabled') then
    return query select 'blocked', null::text, null::timestamptz,
      'Please check in at the desk — a member of staff will mark you as arrived.';
    return;
  end if;

  if p_method = 'venue_qr' and not public.event_flag(p_event_id, 'qr_enabled') then
    return query select 'blocked', null::text, null::timestamptz,
      'Please check in at the desk — a member of staff will mark you as arrived.';
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

  select out_eligible, out_reason into v_ok, v_reason
  from public.check_in_eligibility(p_event_id, rec.id, v_actor);

  if not v_ok then
    return query select 'blocked', rec.data ->> 'fullName', null::timestamptz, v_reason;
    return;
  end if;

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

-- ---------------------------------------------------------------------------

drop function if exists public.staff_check_in(uuid, text);

create function public.staff_check_in(p_record_id uuid, p_override_reason text default null)
returns table (
  out_checked_in_at timestamptz,
  out_already boolean,
  out_blocked_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing timestamptz;
  v_org text;
  v_event text;
  v_payment text;
  v_ok boolean;
  v_reason text;
  v_needs_director boolean;
  v_reason_given boolean;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select checked_in_at, organization_id, event_id, data ->> 'paymentStatus'
    into v_existing, v_org, v_event, v_payment
  from public.records
  where id = p_record_id and collection = 'registrations';

  if not found then
    raise exception 'No such registration';
  end if;

  if v_existing is not null then
    return query select v_existing, true, null::text;
    return;
  end if;

  select out_eligible, out_reason, out_requires_director
  into v_ok, v_reason, v_needs_director
  from public.check_in_eligibility(v_event, p_record_id, 'staff');

  v_reason_given := coalesce(btrim(coalesce(p_override_reason, '')), '') <> '';

  if not v_ok then
    if not v_reason_given then
      return query select null::timestamptz, false, v_reason;
      return;
    end if;

    /*
     * A reason is enough for a payment still being checked. It is not enough for one the
     * organiser has already judged invalid, refunded or duplicated — that is money, and it
     * is the director's call.
     */
    if v_needs_director and not public.is_director(v_org) then
      return query select null::timestamptz, false,
        'Only the tournament director can check in a player with this payment status.';
      return;
    end if;
  end if;

  update public.records
  set checked_in_at = now(),
      check_in_method = 'staff_manual',
      updated_at = now()
  where id = p_record_id
  returning checked_in_at into v_existing;

  perform public.write_audit_log(
    v_org, v_event, coalesce(public.current_staff_email(), 'unknown'), 'check-in',
    case
      when not v_ok then
        jsonb_build_object('recordId', p_record_id, 'paymentOverride', v_payment,
                           'overrideReason', p_override_reason, 'blocked', v_reason)
      else jsonb_build_object('recordId', p_record_id)
    end
  );

  return query select v_existing, false, null::text;
end $$;

revoke all on function public.staff_check_in(uuid, text) from public, anon;
grant execute on function public.staff_check_in(uuid, text) to authenticated;

do $$
begin
  raise notice 'both check-in paths now ask one set of rules';
end $$;
