-- Stop the receipt promotion for real this time.
--
-- 0037 neutered `promote_receipt_to_verified` and said the job was done. It was not: 0008
-- had already moved the work into a second function, `promote_receipt_after_insert`, and
-- repointed the trigger at it. The function 0037 rewrote has not been called since 0008, so
-- the change was to dead code and every uploaded receipt carried on marking itself paid.
--
-- Two more people were auto-verified the evening it was supposedly fixed.
--
-- The test that "proved" 0037 could not have caught this. It inserted a row inside a
-- transaction and read the `returning` clause — but this trigger fires AFTER insert and
-- issues its own UPDATE, so the returned row is the row as written, before the promotion.
-- A test has to read the row back afterwards, which is what the check at the bottom does.

create or replace function public.promote_receipt_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  /*
   * Nothing is promoted. A receipt is a claim until a person says otherwise.
   *
   * The image behind it was never stored — the form keeps `file.name` and drops the file —
   * so "verified" here meant a string a phone produced, with nothing for anybody to open.
   *
   * Left as a no-op rather than dropped, so the trigger and its name stay where 0007 and
   * 0008 put them and re-enabling this later is one edit with this reasoning attached.
   */
  return null;
end $$;

/*
 * Prove it, by reading the row back rather than trusting what the insert returned.
 */
do $$
declare
  v_id uuid;
  v_status text;
  v_auto text;
begin
  insert into public.records (collection, organization_id, event_id, data, status)
  values ('registrations', 'org-federation', 'evt-alphabattle-23-august',
          jsonb_build_object(
            'fullName', 'Trigger Probe',
            'paymentStatus', 'receipt-uploaded',
            'receiptFileName', 'probe.jpg'
          ),
          'active')
  returning id into v_id;

  select data ->> 'paymentStatus', data ->> 'autoVerified'
  into v_status, v_auto
  from public.records where id = v_id;

  delete from public.records where id = v_id;

  if v_status <> 'receipt-uploaded' or v_auto is not null then
    raise exception 'a receipt still promotes itself: status % autoVerified %', v_status, v_auto;
  end if;

  raise notice 'an uploaded receipt stays a claim: %', v_status;
end $$;
