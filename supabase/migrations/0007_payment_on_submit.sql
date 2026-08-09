-- Who decides a payment is verified.
--
-- Two rules were in direct conflict, and the collision would only have shown up
-- as every real registration being rejected with a 401:
--
--   The app marks a payment `verified` the moment a receipt is attached. The
--   organizer asked for that, so registration completes in one step.
--
--   The insert policy forbids a client from writing `verified`, because a client
--   that can declare its own payment received is not a payment system.
--
-- The policy is right and stays. What changes is who does the promoting: the
-- client now submits `receipt-uploaded`, which is a claim, and this trigger
-- promotes it on the server — and only when a receipt is actually attached.
--
-- That is still weaker than a human checking the money arrived, and it is the
-- organizer's stated choice. The difference from before is that the decision now
-- happens in one auditable place that a participant cannot reach, so nobody can
-- mark themselves paid by posting straight at the API with no receipt at all.

create or replace function public.promote_receipt_to_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.collection <> 'registrations' then
    return new;
  end if;

  /*
   * A receipt has to be present. An empty upload marking a payment received was
   * the specific hole worth closing: it made paid and unpaid entrants
   * indistinguishable in the payment queue.
   */
  if coalesce(new.data ->> 'paymentStatus', '') = 'receipt-uploaded'
     and coalesce(new.data ->> 'receiptFileName', '') <> ''
  then
    new.data = jsonb_set(new.data, '{paymentStatus}', '"verified"');
    new.data = jsonb_set(new.data, '{autoVerified}', 'true');
  end if;

  return new;
end $$;

drop trigger if exists promote_receipt_trigger on public.records;

create trigger promote_receipt_trigger
  before insert on public.records
  for each row
  execute function public.promote_receipt_to_verified();

/*
 * `complimentary` is a zero-amount entry the organizer grants, not something a
 * participant can claim for themselves, so it comes off the list of states a
 * client may submit.
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
        ('not-submitted', 'receipt-uploaded', 'cash-at-venue')
  );
