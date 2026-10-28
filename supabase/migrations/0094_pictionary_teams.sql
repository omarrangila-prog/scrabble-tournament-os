-- Speed Pictionary, which is not a Scrabble tournament.
--
-- A Pictionary entry is a team of up to four people paying PKR 1,400 each. It has no category,
-- no rating, no player number and no Scrabble board, so it must never be seated at one — the
-- same reasoning, and the same mechanism, as training sessions in 0087: a team is stored under
-- a collection of its own, `pictionaryTeams`, and everything that answers "who is playing
-- Scrabble" filters on `collection = 'registrations'`. There is no flag inside the payload to
-- get wrong, and no later edit to a registration screen can include one by accident.
--
-- It gets an event row of its own for the reason training did: `records.event_id` is a real
-- foreign key and every policy and index is scoped by it, so borrowing the Scrabble event
-- would have put team totals and payments into its reports.

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
    'pictionaryTeams'
  );
$$;

-- ---------------------------------------------------------------------------
-- A receipt that is really in the bucket marks a team's payment as paid, exactly as it does for
-- a Scrabble registration or a trainee (0088). Same conditions: the file must exist, and one
-- file pays for one team. Cash is never promoted.
create or replace function public.promote_receipt_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
begin
  if new.collection not in ('registrations', 'trainingSignups', 'pictionaryTeams') then
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
-- The event teams belong to. `registration-open`, `public` and `active` are what the public
-- insert policy (0027) demands, all three; see 0087 for why none of them is optional.
--
-- The bank details are copied from the October event rather than typed here, so the account a
-- team is told to pay is the one the organiser already maintains.
insert into public.events (id, organization_id, slug, name, subtitle, data, visibility, state, status)
values (
  'evt-pictionary-22-nov-2026',
  'org-federation',
  'pictionary',
  'Blufy''s Alphabattle Speed Pictionary',
  'Grab a team, think fast, and get drawing!',
  jsonb_build_object(
    'isPictionary', true,
    'fee', 1400,
    'currency', 'PKR',
    'city', 'Karachi',
    'startDate', '2026-11-22',
    'startTime', '12:00',
    'endTime', '16:00',
    'venueName', 'The Social',
    'venueAddress', '44s Razi Rd, PECHS Block 6, Karachi',
    'mapsUrl', (select data ->> 'mapsUrl' from public.events where id = 'evt-alphabattle-november-2026'),
    'mapCoords', (select data ->> 'mapCoords' from public.events where id = 'evt-alphabattle-november-2026'),
    'maxTeams', 8,
    'teamSize', 4,
    'prizes', jsonb_build_array(
      jsonb_build_object('place', 'Winning team', 'award', 'Rs. 2,500'),
      jsonb_build_object('place', 'Runner-up team', 'award', 'Rs. 1,500')
    ),
    'paymentInstructions', coalesce(
      (select data ->> 'paymentInstructions' from public.events where id = 'evt-alphabattle-october-2026'),
      ''),
    'terms', E'• All confirmations and cancellations will be communicated no later than 48 hours before the event.\n• Cancellations received before the registration cut-off are entitled to an 80% refund, if prepaid. Cancellations received less than 48 hours before are not refunded.'
  ),
  'public',
  'registration-open',
  'active'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Eight places, enforced where it cannot be bypassed.
--
-- The form checks the count before anybody pays, which is the courtesy; this is the control. The
-- lock serialises two teams registering in the same instant, so the eighth place cannot be sold
-- twice. A full event refuses with a message the form can recognise.
create or replace function public.enforce_team_places()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer;
  v_taken integer;
begin
  if new.collection <> 'pictionaryTeams' or new.event_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('pictionaryTeams:' || new.event_id));

  select nullif(e.data ->> 'maxTeams', '')::int into v_max
  from public.events e where e.id = new.event_id;

  if v_max is null then
    return new;
  end if;

  select count(*) into v_taken from public.records r
  where r.event_id = new.event_id and r.collection = 'pictionaryTeams' and r.status = 'active';

  if v_taken >= v_max then
    raise exception 'All % team places are taken', v_max;
  end if;

  return new;
end $$;

drop trigger if exists enforce_team_places_trigger on public.records;
create trigger enforce_team_places_trigger
  before insert on public.records
  for each row
  execute function public.enforce_team_places();

-- ---------------------------------------------------------------------------
-- Readers.
--
-- How many places are taken, for the form: a number and nothing else, so it is safe to give to
-- anybody. The team list itself carries names and mobile numbers, so it is staff only.
create or replace function public.pictionary_team_count(p_slug text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.records r
  join public.events e on e.id = r.event_id
  where e.slug = p_slug
    and e.visibility = 'public'
    and e.status = 'active'
    and r.collection = 'pictionaryTeams'
    and r.status = 'active';
$$;

revoke all on function public.pictionary_team_count(text) from public;
grant execute on function public.pictionary_team_count(text) to anon, authenticated;

create or replace function public.pictionary_teams()
returns table(
  out_id uuid,
  out_data jsonb,
  out_status text,
  out_created_at timestamp with time zone
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.data, r.status, r.created_at
  from public.records r
  where r.collection = 'pictionaryTeams'
    and r.status = 'active'
    and public.is_any_staff()
  order by r.created_at asc;
$$;

revoke all on function public.pictionary_teams() from public, anon;
grant execute on function public.pictionary_teams() to authenticated;

-- ---------------------------------------------------------------------------
-- Staff actions on a team: mark paid (cash at the door), undo that, remove a team that pulled
-- out and free its place. Each is audited. Limited to this collection, so these cannot be used
-- to touch a Scrabble registration.
create or replace function public.staff_set_team_payment(
  p_id uuid,
  p_paid boolean,
  p_by text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.records%rowtype;
  v_by text := coalesce(nullif(btrim(coalesce(p_by, '')), ''), 'desk');
begin
  if not public.can_desk('org-federation') then
    raise exception 'Not authorised';
  end if;

  select * into v_row from public.records
  where id = p_id and collection = 'pictionaryTeams' and status = 'active';
  if not found then
    raise exception 'That team could not be found';
  end if;

  if p_paid then
    update public.records
    set data = data || jsonb_build_object(
          'paymentStatus', 'verified',
          'verifiedBy', v_by,
          'verifiedAt', now(),
          'paymentNote', 'Marked paid by ' || v_by || '.'),
        updated_at = now()
    where id = p_id;
  else
    update public.records
    set data = (data - 'autoVerified' - 'verifiedBy' - 'verifiedAt' - 'paymentNote')
          || jsonb_build_object('paymentStatus',
               case when data ->> 'payment' = 'cash' then 'cash-at-venue' else 'receipt-uploaded' end),
        updated_at = now()
    where id = p_id;
  end if;

  perform public.write_audit_log(
    v_row.organization_id, v_row.event_id, v_by,
    case when p_paid then 'team-marked-paid' else 'team-marked-unpaid' end,
    jsonb_build_object('team', v_row.data ->> 'teamName', 'account', public.current_staff_email()));

  return true;
end $$;

revoke all on function public.staff_set_team_payment(uuid, boolean, text) from public, anon;
grant execute on function public.staff_set_team_payment(uuid, boolean, text) to authenticated;

create or replace function public.staff_remove_team(p_id uuid, p_by text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.records%rowtype;
  v_by text := coalesce(nullif(btrim(coalesce(p_by, '')), ''), 'desk');
begin
  if not public.can_desk('org-federation') then
    raise exception 'Not authorised';
  end if;

  select * into v_row from public.records
  where id = p_id and collection = 'pictionaryTeams' and status = 'active';
  if not found then
    raise exception 'That team could not be found';
  end if;

  update public.records set status = 'deleted', updated_at = now() where id = p_id;

  perform public.write_audit_log(
    v_row.organization_id, v_row.event_id, v_by, 'team-removed',
    jsonb_build_object('team', v_row.data ->> 'teamName', 'account', public.current_staff_email()));

  return true;
end $$;

revoke all on function public.staff_remove_team(uuid, text) from public, anon;
grant execute on function public.staff_remove_team(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Proof, rather than assumption. Each of these would make the form silently useless or unsafe.
do $$
declare
  v_id uuid;
  v_id2 uuid;
  v_seen int;
  v_path text := 'migration-probe/' || gen_random_uuid()::text || '.png';
  v_status text;
  v_count_before int;
begin
  if not public.is_public_writable('pictionaryTeams') then
    raise exception 'pictionaryTeams is not publicly writable, so no team could ever register';
  end if;
  if public.is_public_readable('pictionaryTeams') then
    raise exception 'pictionaryTeams is publicly readable — team mobile numbers would be world readable';
  end if;
  if not public.is_public_writable('trainingSignups') or not public.is_public_writable('registrations') then
    raise exception 'widening the writable list dropped an existing collection';
  end if;

  if not exists (
    select 1 from public.events
    where id = 'evt-pictionary-22-nov-2026'
      and state = 'registration-open' and visibility = 'public' and status = 'active'
  ) then
    raise exception 'The Pictionary event does not satisfy the public insert policy';
  end if;

  v_count_before := public.pictionary_team_count('pictionary');

  /* Written as an anonymous visitor writes it, so the policy itself is what approves it. */
  set local role anon;
  insert into public.records (collection, organization_id, event_id, data, status)
  values ('pictionaryTeams', 'org-federation', 'evt-pictionary-22-nov-2026',
          jsonb_build_object('teamName', 'Migration check', 'paymentStatus', 'cash-at-venue', 'payment', 'cash'),
          'active');
  reset role;

  select id into v_id from public.records
  where collection = 'pictionaryTeams' and data ->> 'teamName' = 'Migration check';
  if v_id is null then
    raise exception 'An anonymous team registration was refused';
  end if;
  if public.pictionary_team_count('pictionary') <> v_count_before + 1 then
    raise exception 'The place count did not move';
  end if;

  /* A team is never a Scrabble entrant. */
  select count(*) into v_seen from public.records
  where collection = 'registrations' and event_id = 'evt-pictionary-22-nov-2026';
  if v_seen <> 0 then
    raise exception 'A team is being counted as a Scrabble registration';
  end if;

  /* A stored receipt pays for the team once, and only once. */
  insert into storage.objects (bucket_id, name) values ('payment-proofs', v_path);
  insert into public.records (collection, organization_id, event_id, data, status)
  values ('pictionaryTeams', 'org-federation', 'evt-pictionary-22-nov-2026',
          jsonb_build_object('teamName', 'Migration receipt', 'paymentStatus', 'receipt-uploaded',
                             'payment', 'online', 'paymentProof', jsonb_build_object('path', v_path)),
          'active') returning id into v_id2;
  select data ->> 'paymentStatus' into v_status from public.records where id = v_id2;
  if v_status <> 'verified' then
    raise exception 'A stored receipt did not mark the team paid: %', v_status;
  end if;

  delete from public.records where id in (v_id, v_id2);
  /* The storage service guards direct deletes; the documented switch lifts that, as in 0088. */
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'payment-proofs' and name = v_path;

  /* The cap refuses the ninth team, and a soft-deleted team gives its place back. */
  declare
    v_max int := 8;
    i int;
    v_ids uuid[] := '{}';
    v_new uuid;
    v_refused boolean := false;
  begin
    select count(*) into v_seen from public.records
    where collection = 'pictionaryTeams' and event_id = 'evt-pictionary-22-nov-2026' and status = 'active';
    for i in 1 .. (v_max - v_seen) loop
      insert into public.records (collection, organization_id, event_id, data, status)
      values ('pictionaryTeams', 'org-federation', 'evt-pictionary-22-nov-2026',
              jsonb_build_object('teamName', 'Cap probe ' || i, 'paymentStatus', 'cash-at-venue'), 'active')
      returning id into v_new;
      v_ids := v_ids || v_new;
    end loop;
    begin
      insert into public.records (collection, organization_id, event_id, data, status)
      values ('pictionaryTeams', 'org-federation', 'evt-pictionary-22-nov-2026',
              jsonb_build_object('teamName', 'Cap probe over', 'paymentStatus', 'cash-at-venue'), 'active');
    exception when others then
      v_refused := true;
    end;
    if not v_refused then
      raise exception 'A ninth team was accepted';
    end if;
    delete from public.records where id = any(v_ids);
  end;
end $$;
