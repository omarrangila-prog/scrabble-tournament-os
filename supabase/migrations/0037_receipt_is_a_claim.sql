-- A receipt stops declaring itself paid.
--
-- Migration 0007 promoted `receipt-uploaded` to `verified` on the server, on the
-- organizer's stated preference: registration finishes in one step, and the price
-- is revenue that includes money nobody checked. That was a real trade and it was
-- theirs to make.
--
-- The trade was never actually on offer. The receipt image is not stored anywhere
-- — the form keeps `file.name` and discards the file, and the project has no
-- storage bucket — so what promoted a payment to `verified` was a filename, and
-- there has never been anything behind it for a person to open. Not on the day,
-- not afterwards.
--
-- That is not an unchecked receipt. An unchecked receipt can be checked later.
-- This marked eleven entrants and PKR 10,900 as paid on the strength of a string
-- a phone produced, and the organizer has since said some of them had not paid at
-- all.
--
-- So the promotion goes. `receipt-uploaded` stays exactly what it is — a claim —
-- and a person settles it at the desk or on the payments screen, where the
-- decision is recorded against their name.
--
-- The trigger itself stays in place rather than being dropped, because it is also
-- the guard that stops a client posting straight at the API and declaring itself
-- verified with no receipt at all. That still matters.

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
   * Nothing is promoted. A receipt is a claim until a person says otherwise.
   *
   * Kept as a no-op with its name intact so the audit trail through 0007 reads in
   * order, and so re-enabling it later — once receipts are actually stored — is a
   * change in one place with this reasoning attached.
   */
  return new;
end $$;

/*
 * Nothing has ever been able to write `verified` from a browser: the insert policy
 * forbids it and this function was the only path to it. With the promotion gone,
 * `verified` can now be reached only through `staff_decide_payment`, which requires
 * a signed-in staff session and records who decided.
 */
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'records'
      and policyname = 'anyone may submit to open collections'
      and with_check like '%verified%'
  ) then
    raise notice 'check the insert policy: it mentions verified';
  end if;
end $$;
