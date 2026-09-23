-- Payment proof: the file itself, not just its name.
--
-- The form has asked for a receipt since the beginning and stored `receiptFileName` — the
-- name of a file that went nowhere. A desk trying to check a PKR 1,000 online payment had
-- "screenshot_20260919.jpg" and nothing to look at, so every online payment was settled by
-- asking the participant to send the screenshot again on WhatsApp.
--
-- This gives the upload somewhere to land: a private bucket that an anonymous registrant may
-- write to and may not read back. Nobody without a staff session can list it, open a file or
-- guess their way to somebody else's bank receipt — which matters, because a payment
-- screenshot carries an account title, a number and an amount.

-- ---------------------------------------------------------------------------
-- Whether the caller is staff anywhere.
--
-- `is_staff(org)` answers for one organisation. A storage policy has no event and no
-- organisation to hand it — the object is a file in a bucket — so the question it can ask is
-- this one. Deliberately not a weaker check: it is still membership of the staff table, not
-- merely holding a signed-in session.
create or replace function public.is_any_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

revoke all on function public.is_any_staff() from public, anon;
grant execute on function public.is_any_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- The bucket.
--
-- Private. 10 MB, which is a generous phone screenshot and a short bank PDF, and small
-- enough that a stalled upload on venue wifi fails in seconds rather than minutes. The mime
-- list is enforced by the storage service itself, so a renamed .exe is refused before any
-- policy runs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  10485760,
  array['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The storage API reads the bucket row as the caller before it accepts an upload, so a
-- registrant needs to be able to see that this one bucket exists. Nothing else about it.
drop policy if exists "payment proofs: the bucket is visible" on storage.buckets;
create policy "payment proofs: the bucket is visible"
  on storage.buckets for select
  to anon, authenticated
  using (id = 'payment-proofs');

-- ---------------------------------------------------------------------------
-- Who may do what with the files.

-- Anyone registering may add one. They are filling in a public form with no account, so this
-- has to be open to `anon` — the protection is that writing is all they may do.
drop policy if exists "payment proofs: anyone registering may upload" on storage.objects;
create policy "payment proofs: anyone registering may upload"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'payment-proofs');

-- Staff may look. This is the whole point of storing it: the desk opens the receipt beside
-- the registration instead of asking for it again.
drop policy if exists "payment proofs: staff may read" on storage.objects;
create policy "payment proofs: staff may read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'payment-proofs' and public.is_any_staff());

-- Staff may remove one — a duplicate, or something uploaded by mistake. Nobody else may, and
-- nothing may be overwritten by anyone: there is no update policy, so an upload to a path
-- that already exists is refused rather than replacing what is there. A receipt that can be
-- swapped after the desk has seen it is not evidence of anything.
drop policy if exists "payment proofs: staff may delete" on storage.objects;
create policy "payment proofs: staff may delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'payment-proofs' and public.is_any_staff());
