-- Give the organizer the whole registration, not a summary of it.
--
-- `organizer_registrations` returned fourteen named columns, chosen for the
-- participant list. The payment review screen needs more than that — the receipt
-- file, the transaction reference, the method, a claimed membership number — and
-- the finance and analytics screens will each want a different subset again.
--
-- Rather than adding four columns now and four more next week, this returns the
-- stored `data` document alongside the named columns. The named ones stay so
-- nothing that reads them breaks; anything needing a field that has no column can
-- read it from the document without another migration.
--
-- The return type changes, so the function has to be dropped first: `create or
-- replace` cannot alter a function's signature.

drop function if exists public.organizer_registrations(text);

create function public.organizer_registrations(p_event_id text)
returns table (
  out_id uuid,
  out_full_name text,
  out_email text,
  out_mobile text,
  out_area text,
  out_playing_level text,
  out_registration_status text,
  out_payment_status text,
  out_amount_due numeric,
  out_currency text,
  out_check_in_code text,
  out_checked_in_at timestamptz,
  out_check_in_method text,
  out_submitted_at timestamptz,
  -- Everything the form recorded, for screens that need a field with no column.
  out_data jsonb
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_staff('org-federation') then
    return;
  end if;

  return query
  select
    r.id,
    r.data ->> 'fullName',
    r.data ->> 'email',
    r.data ->> 'mobile',
    r.data #>> '{answers,area}',
    coalesce(r.data ->> 'confirmedDivision', r.data ->> 'preferredDivision'),
    r.data ->> 'status',
    r.data ->> 'paymentStatus',
    (r.data ->> 'amountDue')::numeric,
    r.data ->> 'currency',
    r.check_in_code,
    r.checked_in_at,
    r.check_in_method,
    r.created_at,
    r.data
  from public.records r
  where r.collection = 'registrations'
    and r.event_id = p_event_id
    and r.status = 'active'
  order by r.created_at desc;
end $$;

grant execute on function public.organizer_registrations(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Payment decisions
-- ---------------------------------------------------------------------------

/**
 * Records a payment decision, with the reason and the person who made it.
 *
 * `verify_payment` could only say yes. A reviewer also needs to reject a receipt,
 * mark an entry complimentary, or record a refund, and each of those is a judgement
 * somebody should be accountable for — so the note and the reviewer are stored
 * rather than being optional.
 *
 * The allowed statuses are checked here. A client that sent 'definitely-paid'
 * would otherwise write it straight into the document and every screen downstream
 * would quietly treat it as unpaid.
 */
create or replace function public.staff_decide_payment(
  p_record_id uuid,
  p_status text,
  p_by text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff('org-federation') then
    return false;
  end if;

  if p_status not in ('verified', 'rejected', 'complimentary', 'refunded', 'receipt-uploaded') then
    raise exception 'Unknown payment status %', p_status;
  end if;

  if coalesce(trim(p_by), '') = '' then
    raise exception 'A reviewer is required';
  end if;

  update public.records
  set data = data
             || jsonb_build_object(
                  'paymentStatus', p_status,
                  'verifiedBy', p_by,
                  'verifiedAt', now(),
                  'paymentNote', coalesce(p_note, '')
                ),
      updated_at = now()
  where id = p_record_id
    and collection = 'registrations';

  return true;
end $$;

revoke all on function public.staff_decide_payment(uuid, text, text, text) from public;
grant execute on function public.staff_decide_payment(uuid, text, text, text) to authenticated;
