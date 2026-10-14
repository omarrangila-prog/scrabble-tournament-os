-- A receipt that is really in the bucket marks its own payment as paid.
--
-- The organiser's instruction: when somebody uploads their payment screenshot, count it as
-- paid and add the amount, with nobody having to verify it.
--
-- This reverses 0037 and 0041, which switched the same behaviour off — and it is worth being
-- plain about why that was done, because the reason matters to what this must and must not do.
-- 0007 promoted a receipt to "verified" on the server. The receipt image was not stored
-- anywhere: the form kept `file.name` and threw the file away, so "paid" rested on a filename.
-- Eleven entrants and PKR 10,900 were counted that way, and the organiser later said some of
-- them had not paid.
--
-- That objection no longer holds in its original form. Since 0084 the file is uploaded to a
-- private bucket before the registration is saved, and the desk can open it. So this brings
-- the promotion back, with the conditions that the first version lacked:
--
--   1. The file must actually exist in the bucket. The registration carries a path, and a
--      path is only text — a client posting straight at the API could name any string. The
--      first version checked for a non-empty filename, which is how an empty claim got
--      through. This checks storage.objects itself.
--   2. One file can mark only one payment. Each upload gets a fresh name, so two honest
--      registrations never share a path; a path appearing twice means somebody pointed a
--      second registration at a receipt that already paid for the first.
--
-- What it cannot do is read the image. A blank screenshot, or last month's receipt, still
-- counts as paid — that is the trade being made, and it is the organiser's to make. What stays
-- honest is the record: the entry is marked `autoVerified`, with the reviewer recorded as
-- "Receipt upload (automatic)" and a note saying it was not checked against the account, so
-- anybody reading the payments screen can tell a machine-marked payment from one a person
-- checked, and can still open the receipt and reject it.
--
-- Covers training signups as well as tournament registrations: both upload to the same bucket
-- the same way, and one rule is easier to hold in the head than two.

create or replace function public.promote_receipt_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
begin
  if new.collection not in ('registrations', 'trainingSignups') then
    return null;
  end if;

  -- Only a claim that says it paid online. Cash at the venue is money still owed, and is
  -- never promoted by anything the browser sent.
  if coalesce(new.data ->> 'paymentStatus', '') <> 'receipt-uploaded' then
    return null;
  end if;

  v_path := btrim(coalesce(new.data -> 'paymentProof' ->> 'path', ''));
  if v_path = '' then
    return null;
  end if;

  -- (1) The file is really there.
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'payment-proofs' and o.name = v_path
  ) then
    return null;
  end if;

  -- (2) One receipt, one payment.
  if exists (
    select 1 from public.records r
    where r.id <> new.id
      and r.status <> 'deleted'
      and r.data -> 'paymentProof' ->> 'path' = v_path
  ) then
    return null;
  end if;

  update public.records
  set data = data || jsonb_build_object(
        'paymentStatus', 'verified',
        'autoVerified', true,
        'verifiedBy', 'Receipt upload (automatic)',
        'verifiedAt', now(),
        'paymentNote', 'Marked paid automatically when the receipt was uploaded. Not checked against the account.'
      ),
      updated_at = now()
  where id = new.id;

  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Proof, by reading the rows back. 0041 documents why the readback matters: this trigger fires
-- AFTER insert and issues its own UPDATE, so the row an INSERT ... RETURNING hands back is the
-- row as written, before the promotion. A test that reads RETURNING would pass either way.
do $$
declare
  v_ok uuid; v_none uuid; v_fake uuid; v_cash uuid; v_dup uuid; v_train uuid;
  v_path text := 'migration-probe/' || gen_random_uuid()::text || '.png';
  v_status text; v_auto text;
begin
  -- A real object, standing in for an uploaded receipt.
  insert into storage.objects (bucket_id, name) values ('payment-proofs', v_path);

  -- 1. A stored receipt is promoted, and the amount is kept for the totals.
  insert into public.records (collection, organization_id, event_id, data, status)
  values ('registrations', 'org-federation', 'evt-desk-practice',
          jsonb_build_object('fullName', 'Probe Paid', 'paymentStatus', 'receipt-uploaded',
                             'amountDue', 1250, 'paymentProof', jsonb_build_object('path', v_path)),
          'active') returning id into v_ok;
  select data ->> 'paymentStatus', data ->> 'autoVerified' into v_status, v_auto
    from public.records where id = v_ok;
  if v_status <> 'verified' or v_auto <> 'true' then
    raise exception 'a stored receipt was not promoted: status % auto %', v_status, v_auto;
  end if;
  if (select (data ->> 'amountDue')::numeric from public.records where id = v_ok) <> 1250 then
    raise exception 'promotion altered the amount due';
  end if;

  -- 2. The same file cannot pay for a second person.
  insert into public.records (collection, organization_id, event_id, data, status)
  values ('registrations', 'org-federation', 'evt-desk-practice',
          jsonb_build_object('fullName', 'Probe Reuse', 'paymentStatus', 'receipt-uploaded',
                             'amountDue', 1250, 'paymentProof', jsonb_build_object('path', v_path)),
          'active') returning id into v_dup;
  select data ->> 'paymentStatus' into v_status from public.records where id = v_dup;
  if v_status <> 'receipt-uploaded' then
    raise exception 'one receipt paid for two registrations: %', v_status;
  end if;

  -- 3. A path to a file that does not exist is only text.
  insert into public.records (collection, organization_id, event_id, data, status)
  values ('registrations', 'org-federation', 'evt-desk-practice',
          jsonb_build_object('fullName', 'Probe Fake', 'paymentStatus', 'receipt-uploaded',
                             'amountDue', 1250,
                             'paymentProof', jsonb_build_object('path', 'migration-probe/nothing-here.png')),
          'active') returning id into v_fake;
  select data ->> 'paymentStatus' into v_status from public.records where id = v_fake;
  if v_status <> 'receipt-uploaded' then
    raise exception 'a receipt that is not in the bucket was promoted: %', v_status;
  end if;

  -- 4. A claim with no proof at all stays a claim.
  insert into public.records (collection, organization_id, event_id, data, status)
  values ('registrations', 'org-federation', 'evt-desk-practice',
          jsonb_build_object('fullName', 'Probe None', 'paymentStatus', 'receipt-uploaded', 'amountDue', 1250),
          'active') returning id into v_none;
  select data ->> 'paymentStatus' into v_status from public.records where id = v_none;
  if v_status <> 'receipt-uploaded' then
    raise exception 'a claim with no proof was promoted: %', v_status;
  end if;

  -- 5. Cash owed is never promoted, even with a proof path attached.
  insert into public.records (collection, organization_id, event_id, data, status)
  values ('registrations', 'org-federation', 'evt-desk-practice',
          jsonb_build_object('fullName', 'Probe Cash', 'paymentStatus', 'cash-at-venue', 'amountDue', 1250,
                             'paymentProof', jsonb_build_object('path', v_path)),
          'active') returning id into v_cash;
  select data ->> 'paymentStatus' into v_status from public.records where id = v_cash;
  if v_status <> 'cash-at-venue' then
    raise exception 'cash owed was promoted: %', v_status;
  end if;

  -- Cleanup. The storage service guards direct deletes; the documented switch lifts that for
  -- this transaction only.
  delete from public.records where id in (v_ok, v_dup, v_fake, v_none, v_cash);
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'payment-proofs' and name = v_path;
end $$;
