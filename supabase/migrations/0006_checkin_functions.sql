-- Registration and self check-in, done on the server.
--
-- Registrations are public-writable but deliberately not public-readable: a
-- participant must never be able to enumerate other people's entries, contact
-- details or payments. That policy is right, and it means the check-in page
-- cannot simply query the table.
--
-- These functions are the way through. Each one runs with SECURITY DEFINER, so
-- it can see the rows the caller cannot, and each returns only the handful of
-- fields the person in front of the screen already knows about themselves. The
-- six-digit code is the key: without it, nothing comes back.
--
-- Everything that decides an outcome happens here rather than in the browser.
-- A client-side check is a suggestion; this is the rule.

-- ---------------------------------------------------------------------------
-- Check-in columns
-- ---------------------------------------------------------------------------

/*
 * Held as real columns rather than inside the jsonb payload.
 *
 * The arrival time and the code are read on every check-in and counted on every
 * refresh of the venue display. They also carry the constraints that make the
 * feature correct, and a constraint cannot be placed on a key inside jsonb.
 */
alter table public.records
  add column if not exists check_in_code text,
  add column if not exists checked_in_at timestamptz,
  add column if not exists check_in_method text
    check (check_in_method in ('personal_link', 'venue_qr', 'staff_manual')),
  add column if not exists checked_in_by text;

/*
 * One code per participant per event.
 *
 * Two people sharing a code would check each other in, and the collision would
 * only surface when one of them was marked present twice. Scoped to the event so
 * digits may repeat across events, which they inevitably will.
 */
create unique index if not exists records_check_in_code_idx
  on public.records (event_id, check_in_code)
  where check_in_code is not null;

create index if not exists records_checked_in_idx
  on public.records (event_id, checked_in_at)
  where collection = 'registrations';

-- ---------------------------------------------------------------------------
-- Lookup
-- ---------------------------------------------------------------------------

/**
 * What a participant may be shown about themselves before checking in.
 *
 * Name, level and payment state — enough to confirm "yes, that is me", and
 * nothing that would be worth harvesting. No email, no phone, no receipt, and
 * never the record id.
 */
create or replace function public.find_registration_for_checkin(
  p_event_id text,
  p_code text
)
returns table (
  token text,
  full_name text,
  playing_level text,
  registration_status text,
  payment_status text,
  amount_due numeric,
  currency text,
  checked_in_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.data ->> 'token',
    r.data ->> 'fullName',
    coalesce(r.data ->> 'confirmedDivision', r.data ->> 'preferredDivision'),
    r.data ->> 'status',
    r.data ->> 'paymentStatus',
    (r.data ->> 'amountDue')::numeric,
    r.data ->> 'currency',
    r.checked_in_at
  from public.records r
  where r.collection = 'registrations'
    and r.event_id = p_event_id
    and r.status = 'active'
    -- Digits only, so a pasted "482 731" still matches.
    and r.check_in_code = regexp_replace(p_code, '\D', '', 'g')
  limit 1;
$$;

/** The same, by personal token, for a one-tap link. */
create or replace function public.find_registration_by_token(
  p_event_id text,
  p_token text
)
returns table (
  token text,
  full_name text,
  playing_level text,
  registration_status text,
  payment_status text,
  amount_due numeric,
  currency text,
  checked_in_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.data ->> 'token',
    r.data ->> 'fullName',
    coalesce(r.data ->> 'confirmedDivision', r.data ->> 'preferredDivision'),
    r.data ->> 'status',
    r.data ->> 'paymentStatus',
    (r.data ->> 'amountDue')::numeric,
    r.data ->> 'currency',
    r.checked_in_at
  from public.records r
  where r.collection = 'registrations'
    and r.event_id = p_event_id
    and r.status = 'active'
    and r.data ->> 'token' = btrim(p_token)
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Recording an arrival
-- ---------------------------------------------------------------------------

/**
 * Checks somebody in, once.
 *
 * The write is conditional on `checked_in_at is null`, so two taps cannot produce
 * two arrivals. The second call finds nothing to update and reports
 * `already_checked_in` with the original time — the arrival record is the moment
 * they actually arrived, and a later tap must not move it.
 *
 * This matters beyond tidiness: the arrivals figure is what the director lays
 * out tables from, and counting one person twice makes the room look fuller than
 * it is.
 *
 * The timestamp is the server's. A phone with a wrong clock must not be able to
 * write a wrong arrival time.
 *
 * Payment is checked here too. Cash at the venue is allowed through — arriving
 * and paying are separate things — while a rejected payment is refused with a
 * sentence a participant can act on rather than a status name.
 */
create or replace function public.check_in_registration(
  p_event_id text,
  p_code text,
  p_token text,
  p_method text
)
returns table (
  result text,
  full_name text,
  checked_in_at timestamptz,
  message text
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
    return query select 'blocked', null::text, null::timestamptz,
      'That check-in method is not recognised.';
    return;
  end if;

  -- Locked, so two simultaneous taps cannot both see "not yet arrived".
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

  pay := rec.data ->> 'paymentStatus';

  if pay in ('invalid-receipt', 'duplicate-transaction', 'amount-mismatch', 'refunded') then
    return query select 'blocked', rec.data ->> 'fullName', null::timestamptz,
      'Please see the event desk to complete your registration.';
    return;
  end if;

  if pay in ('not-submitted', 'receipt-uploaded', 'processing', 'review-required') then
    return query select 'blocked', rec.data ->> 'fullName', null::timestamptz,
      'Your payment is still being checked. Please see the desk.';
    return;
  end if;

  update public.records
  set checked_in_at = now(),
      check_in_method = p_method,
      updated_at = now()
  where id = rec.id
    -- Belt and braces: even with the lock, never overwrite an arrival.
    and checked_in_at is null;

  return query select 'checked_in', rec.data ->> 'fullName', now(),
    'You are checked in.';
end $$;

-- ---------------------------------------------------------------------------
-- Arrival counts for the venue display
-- ---------------------------------------------------------------------------

/**
 * The arrivals figure, without exposing who has arrived.
 *
 * The display needs a number on a wall; it must not need the participant list to
 * produce one. Rejected entrants are excluded from `expected` — counting somebody
 * who is not coming makes the room look emptier than it is.
 */
create or replace function public.checkin_counts(p_event_id text)
returns table (expected bigint, checked_in bigint)
language sql
security definer
stable
set search_path = public
as $$
  select
    count(*) filter (where coalesce(r.data ->> 'status', '') <> 'rejected'),
    count(*) filter (
      where coalesce(r.data ->> 'status', '') <> 'rejected'
        and r.checked_in_at is not null
    )
  from public.records r
  where r.collection = 'registrations'
    and r.event_id = p_event_id
    and r.status = 'active';
$$;

-- ---------------------------------------------------------------------------
-- Who may call these
-- ---------------------------------------------------------------------------

/*
 * Granted to anon because check-in happens on a stranger's phone with no
 * account. The protection is not the grant, it is that each function needs the
 * exact code or token and returns nothing without it.
 */
grant execute on function public.find_registration_for_checkin(text, text) to anon, authenticated;
grant execute on function public.find_registration_by_token(text, text) to anon, authenticated;
grant execute on function public.check_in_registration(text, text, text, text) to anon, authenticated;
grant execute on function public.checkin_counts(text) to anon, authenticated;

/*
 * A participant may set their own check-in code at registration, so the insert
 * policy has to allow the column. It may not set an arrival time: that is the
 * function's job, with the server's clock.
 */
drop policy if exists "anyone may submit to open collections" on public.records;

create policy "anyone may submit to open collections"
  on public.records for insert
  with check (
    public.is_public_writable(collection)
    and status = 'active'
    and checked_in_at is null
    and check_in_method is null
    and checked_in_by is null
    and not (data ? 'verifiedBy')
    and not (data ? 'verifiedAt')
    and not (data ? 'finalLevel')
    and coalesce((data ->> 'confirmed')::boolean, false) = false
    and coalesce(data ->> 'paymentStatus', 'not-submitted') in
        ('not-submitted', 'receipt-uploaded', 'cash-at-venue', 'complimentary')
  );
