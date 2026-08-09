-- Resolve an ambiguous column reference in the check-in function.
--
-- `check_in_registration` declared an output column named `checked_in_at`, which
-- is also a real column on public.records. Inside the function body Postgres
-- could not tell which one `checked_in_at is null` meant, and refused to run:
--
--   42702  column reference "checked_in_at" is ambiguous
--
-- The whole function failed, so nobody could check in at all — and the error text
-- is the kind that reaches a participant as a raw database message if the client
-- passes it through. Worth catching here rather than at a venue door.
--
-- The output columns are renamed with an `out_` prefix so they can never collide
-- with the table's own names. The client reads these keys, so they are part of
-- the contract now.

/*
 * Dropped first: `create or replace` cannot change a function's return type, so
 * renaming the output columns needs the old signature gone.
 */
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
  pay text;
begin
  if p_method not in ('personal_link', 'venue_qr', 'staff_manual') then
    return query select 'blocked'::text, null::text, null::timestamptz,
      'That check-in method is not recognised.'::text;
    return;
  end if;

  -- Locked, so two simultaneous taps cannot both read "not yet arrived".
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
    return query select 'not_found'::text, null::text, null::timestamptz,
      'We could not find that code. Please check and try again.'::text;
    return;
  end if;

  /*
   * Already arrived. The original time is returned rather than a new one: this is
   * the arrival record, and a second tap must not move it. Returning the existing
   * time also lets the page show "already checked in at 12:14" instead of
   * pretending it just happened.
   */
  if rec.checked_in_at is not null then
    return query select 'already_checked_in'::text, rec.data ->> 'fullName',
      rec.checked_in_at, 'You are already checked in.'::text;
    return;
  end if;

  pay := coalesce(rec.data ->> 'paymentStatus', 'not-submitted');

  -- Never quote an internal state at somebody standing in a doorway.
  if pay in ('invalid-receipt', 'duplicate-transaction', 'amount-mismatch', 'refunded') then
    return query select 'blocked'::text, rec.data ->> 'fullName', null::timestamptz,
      'Please see the event desk to complete your registration.'::text;
    return;
  end if;

  if pay in ('not-submitted', 'receipt-uploaded', 'processing', 'review-required') then
    return query select 'blocked'::text, rec.data ->> 'fullName', null::timestamptz,
      'Your payment is still being checked. Please see the desk.'::text;
    return;
  end if;

  update public.records
  set checked_in_at = now(),
      check_in_method = p_method,
      updated_at = now()
  where id = rec.id
    -- Belt and braces alongside the lock: never overwrite an arrival.
    and public.records.checked_in_at is null;

  return query select 'checked_in'::text, rec.data ->> 'fullName', now(),
    'You are checked in.'::text;
end $$;

grant execute on function public.check_in_registration(text, text, text, text) to anon, authenticated;
