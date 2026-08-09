-- Promote the payment after the insert, not during it.
--
-- 0007 did this in a BEFORE INSERT trigger, which is wrong in a way that only
-- shows up against a real database: Postgres fires BEFORE triggers first and
-- then evaluates the RLS WITH CHECK against the resulting row. The trigger set
-- `paymentStatus` to `verified`, the policy saw `verified` from what it believed
-- was the client, and refused the insert.
--
-- Every legitimate registration was rejected with a 401 — the same status a
-- genuine policy violation returns — so from the outside it would have looked
-- like "registration is broken" with nothing to explain why.
--
-- AFTER INSERT fixes the order: the row is checked exactly as the client
-- submitted it, admitted, and only then promoted by a function the client cannot
-- reach.

drop trigger if exists promote_receipt_trigger on public.records;
drop function if exists public.promote_receipt_to_verified();
drop function if exists public.promote_receipt_to_verified_after();
drop function if exists public.promote_receipt_after_insert();

create function public.promote_receipt_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.collection <> 'registrations' then
    return null;
  end if;

  /*
   * A receipt must actually be attached. An empty upload marking a payment
   * received was the hole worth closing: it left paid and unpaid entrants
   * indistinguishable in the payment queue.
   *
   * `autoVerified` is recorded so a reviewer can tell a machine-promoted payment
   * from one a person checked against the account.
   */
  if coalesce(new.data ->> 'paymentStatus', '') = 'receipt-uploaded'
     and coalesce(new.data ->> 'receiptFileName', '') <> ''
  then
    update public.records
    set data = jsonb_set(
                 jsonb_set(data, '{paymentStatus}', '"verified"'),
                 '{autoVerified}', 'true'
               ),
        updated_at = now()
    where id = new.id;
  end if;

  return null;
end $$;

create trigger promote_receipt_trigger
  after insert on public.records
  for each row
  execute function public.promote_receipt_after_insert();
