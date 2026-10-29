-- Mafia Wars, and an account that sees one event and nothing else.
--
-- Two things in one migration because the second exists for the first.
--
-- 1. Mafia Wars is a social game night, not a Scrabble tournament. A sign-up is one person: name,
--    age, phone, an online payment, media consent. It has no category, rating or player number, so
--    it is stored under a collection of its own, `mafiaRegistrations`, for the reason 0087 gives
--    for training and 0094 for Pictionary: everything that answers "who is playing Scrabble"
--    filters on `collection = 'registrations'`, so nobody signed up here can be seated at a board.
--
-- 2. The person running the night should see who has signed up and nothing else. The existing
--    staff roles cannot do that. Every one of them reads all of an organisation's records and
--    every payment receipt in the bucket (`is_any_staff` is the storage policy), so even the
--    weakest — viewer — would see the Scrabble registrations' names and phone numbers, and every
--    child's. So a host is not staff at all: they are a row in `event_hosts`, and a handful of
--    functions below that answer for exactly the events on their row.
--
-- A host account therefore has no `staff` row. RLS gives it nothing; the only doors are the
-- functions in this file, and each one asks `is_event_host` for the event it is about.

-- ---------------------------------------------------------------------------
-- Who hosts which event.
create table if not exists public.event_hosts (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

alter table public.event_hosts enable row level security;
revoke all on public.event_hosts from public, anon, authenticated;

create or replace function public.is_event_host(p_event_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_hosts h
    where h.user_id = auth.uid() and h.event_id = p_event_id
  );
$$;

revoke all on function public.is_event_host(text) from public, anon;
grant execute on function public.is_event_host(text) to authenticated;

-- The events this account hosts. How the sign-in page knows where to send a host.
create or replace function public.host_events()
returns table(out_id text, out_slug text, out_name text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.slug, e.name
  from public.event_hosts h
  join public.events e on e.id = h.event_id
  where h.user_id = auth.uid() and e.status = 'active'
  order by e.name;
$$;

revoke all on function public.host_events() from public, anon;
grant execute on function public.host_events() to authenticated;

-- ---------------------------------------------------------------------------
-- The collection a stranger may write to (and not read).
create or replace function public.is_public_writable(c text)
returns boolean
language sql
immutable
as $$
  select c in (
    'registrations',
    'participants',
    'payments',
    'membershipVerifications',
    'checkIns',
    'scoreSubmissions',
    'interestRegistrations',
    'trainingSignups',
    'pictionaryTeams',
    'mafiaRegistrations'
  );
$$;

-- ---------------------------------------------------------------------------
-- A stored receipt marks its payment as paid, as for every other form (0088).
create or replace function public.promote_receipt_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
begin
  if new.collection not in ('registrations', 'trainingSignups', 'pictionaryTeams', 'mafiaRegistrations') then
    return null;
  end if;

  if coalesce(new.data ->> 'paymentStatus', '') <> 'receipt-uploaded' then
    return null;
  end if;

  v_path := btrim(coalesce(new.data -> 'paymentProof' ->> 'path', ''));
  if v_path = '' then
    return null;
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'payment-proofs' and o.name = v_path
  ) then
    return null;
  end if;

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
-- What a Mafia Wars sign-up must contain, enforced where it cannot be bypassed. The form checks
-- the same things; a form is a courtesy, and anybody can post to the API directly.
create or replace function public.enforce_mafia_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee numeric;
  v_age jsonb := new.data -> 'age';
begin
  if new.collection <> 'mafiaRegistrations' then
    return new;
  end if;

  if btrim(coalesce(new.data ->> 'fullName', '')) = '' or length(btrim(new.data ->> 'fullName')) < 2 then
    raise exception 'Please give your full name';
  end if;

  if v_age is null or jsonb_typeof(v_age) <> 'number'
     or (v_age #>> '{}')::numeric <> trunc((v_age #>> '{}')::numeric)
     or (v_age #>> '{}')::numeric < 5 or (v_age #>> '{}')::numeric > 99 then
    raise exception 'Please give a real age';
  end if;

  if length(regexp_replace(coalesce(new.data ->> 'phone', ''), '\D', '', 'g')) < 10 then
    raise exception 'Please give a mobile number';
  end if;

  /* Online only: there is no desk to take cash at, and a receipt is what settles it. */
  if coalesce(new.data ->> 'payment', '') <> 'online' then
    raise exception 'This event is paid online';
  end if;

  if jsonb_typeof(new.data -> 'mediaConsent') is distinct from 'boolean' then
    raise exception 'Please answer the photo and video question';
  end if;

  select nullif(e.data ->> 'fee', '')::numeric into v_fee from public.events e where e.id = new.event_id;
  if v_fee is not null and coalesce((new.data ->> 'amountDue')::numeric, -1) <> v_fee then
    raise exception 'The amount does not match the price';
  end if;

  return new;
end $$;

drop trigger if exists enforce_mafia_entry_trigger on public.records;
create trigger enforce_mafia_entry_trigger
  before insert on public.records
  for each row
  execute function public.enforce_mafia_entry();

-- ---------------------------------------------------------------------------
-- The event. `registration-open`, `public` and `active` are what the public insert policy (0027)
-- demands, all three; see 0087. Payment details are copied from the October event so the account
-- people are told to pay is the one the organiser already maintains.
insert into public.events (id, organization_id, slug, name, subtitle, data, visibility, state, status)
values (
  'evt-mafia-wars-22-nov-2026',
  'org-federation',
  'mafia-wars',
  'Mafia Wars',
  'Will you be joining us?',
  jsonb_build_object(
    'isMafia', true,
    'fee', 1400,
    'currency', 'PKR',
    'city', 'Karachi',
    'startDate', '2026-11-22',
    'startTime', '16:30',
    'endTime', '17:30',
    'venueName', 'The Social',
    'venueAddress', '44s Razi Rd, PECHS Block 6, Karachi',
    'mapsUrl', (select data ->> 'mapsUrl' from public.events where id = 'evt-alphabattle-november-2026'),
    'mapCoords', (select data ->> 'mapCoords' from public.events where id = 'evt-alphabattle-november-2026'),
    'paymentInstructions', coalesce(
      (select data ->> 'paymentInstructions' from public.events where id = 'evt-alphabattle-october-2026'), ''),
    'terms', E'• All confirmations and cancellations will be communicated no later than 48 hours before the event.\n• Cancellations received before the registration cut-off are entitled to an 80% refund, if prepaid. Cancellations received less than 48 hours before are not refunded.'
  ),
  'public',
  'registration-open',
  'active'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The sign-ups, for staff and for the event's host. Nobody else gets a row.
create or replace function public.mafia_registrations(p_event_id text)
returns table(
  out_id uuid,
  out_data jsonb,
  out_created_at timestamp with time zone
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.data, r.created_at
  from public.records r
  where r.event_id = p_event_id
    and r.collection = 'mafiaRegistrations'
    and r.status = 'active'
    and (public.is_any_staff() or public.is_event_host(p_event_id))
  order by r.created_at asc;
$$;

revoke all on function public.mafia_registrations(text) from public, anon;
grant execute on function public.mafia_registrations(text) to authenticated;

-- ---------------------------------------------------------------------------
-- A host may open the receipts of their own event, and no others. Receipt files are stored under
-- the event's id (see `proofPathFor`), so the first path segment is what scopes the read.
drop policy if exists "payment proofs: event hosts may read their own" on storage.objects;
create policy "payment proofs: event hosts may read their own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payment-proofs'
    and public.is_event_host(split_part(name, '/', 1))
  );

-- ---------------------------------------------------------------------------
-- Proof, rather than assumption. Each of these would make the form useless or the account unsafe.
do $$
declare
  v_ev text := 'evt-mafia-wars-22-nov-2026';
  v_path text := 'migration-probe/' || gen_random_uuid()::text || '.png';
  v_id uuid;
  v_refused text;
  v_status text;
  v_ok jsonb := jsonb_build_object(
    'fullName', 'Probe One', 'age', 17, 'phone', '03001234567', 'payment', 'online',
    'mediaConsent', true, 'amountDue', 1400, 'paymentStatus', 'receipt-uploaded');
begin
  if not public.is_public_writable('mafiaRegistrations') then
    raise exception 'mafiaRegistrations is not publicly writable, so nobody could sign up';
  end if;
  if public.is_public_readable('mafiaRegistrations') then
    raise exception 'mafiaRegistrations is publicly readable — phone numbers would be world readable';
  end if;
  if not public.is_public_writable('registrations') or not public.is_public_writable('pictionaryTeams')
     or not public.is_public_writable('trainingSignups') then
    raise exception 'widening the writable list dropped an existing collection';
  end if;

  if (select count(*) from public.records where collection = 'mafiaRegistrations') <> 0 then
    raise notice 'sign-ups already exist; skipping the write probes';
    return;
  end if;

  /* A stored receipt pays for the entry once; the same file cannot pay twice. */
  insert into storage.objects (bucket_id, name) values ('payment-proofs', v_path);

  set local role anon;
  insert into public.records (collection, organization_id, event_id, data, status)
  values ('mafiaRegistrations', 'org-federation', v_ev,
          v_ok || jsonb_build_object('paymentProof', jsonb_build_object('path', v_path)), 'active');
  reset role;

  select id, data ->> 'paymentStatus' into v_id, v_status
  from public.records where collection = 'mafiaRegistrations' and data ->> 'fullName' = 'Probe One';
  if v_id is null then raise exception 'an anonymous sign-up was refused'; end if;
  if v_status <> 'verified' then raise exception 'a stored receipt did not mark the entry paid: %', v_status; end if;

  insert into public.records (collection, organization_id, event_id, data, status)
  values ('mafiaRegistrations', 'org-federation', v_ev,
          (v_ok || jsonb_build_object('fullName', 'Probe Reuse', 'paymentProof', jsonb_build_object('path', v_path))), 'active');
  select data ->> 'paymentStatus' into v_status from public.records where data ->> 'fullName' = 'Probe Reuse';
  if v_status <> 'receipt-uploaded' then raise exception 'one receipt paid for two sign-ups: %', v_status; end if;

  /* Refusals. */
  set local role anon;
  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('mafiaRegistrations', 'org-federation', v_ev, v_ok || '{"amountDue": 10}', 'active');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like '%does not match the price%' then raise exception 'a wrong price was not refused: %', v_refused; end if;

  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('mafiaRegistrations', 'org-federation', v_ev, v_ok || '{"age": 400}', 'active');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like '%real age%' then raise exception 'age 400 was not refused: %', v_refused; end if;

  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('mafiaRegistrations', 'org-federation', v_ev, v_ok || '{"payment": "cash"}', 'active');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like '%paid online%' then raise exception 'cash was not refused: %', v_refused; end if;

  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('mafiaRegistrations', 'org-federation', v_ev, (v_ok - 'mediaConsent'), 'active');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like '%photo and video%' then raise exception 'a missing consent answer was not refused: %', v_refused; end if;

  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('mafiaRegistrations', 'org-federation', v_ev, v_ok || '{"phone": "123"}', 'active');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like '%mobile number%' then raise exception 'a short phone number was not refused: %', v_refused; end if;
  reset role;

  /* Nobody here is a Scrabble entrant. */
  if exists (select 1 from public.records where collection = 'registrations' and event_id = v_ev) then
    raise exception 'a sign-up is being counted as a Scrabble registration';
  end if;

  delete from public.records where collection = 'mafiaRegistrations' and event_id = v_ev;
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'payment-proofs' and name = v_path;
end $$;
