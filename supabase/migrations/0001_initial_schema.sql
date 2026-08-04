-- Tournament OS schema.
--
-- Two principles drive every policy below, the same two that govern the app.
--
-- 1. Registration is public and unauthenticated. Anyone with the link may
--    create an entry — that is the product. So *reads* are what is locked
--    down: a participant must never be able to enumerate other people's
--    entries, contact details or payments.
--
-- 2. Money and results are organizer-only. A payment becomes verified when a
--    named person says so, and a score becomes official the same way. No
--    client-supplied value can set either, because a client-side check is not
--    a security control.
--
-- Apply with:  supabase db push
-- Or paste into the SQL editor at
--   https://supabase.com/dashboard/project/_/sql

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

/*
 * Staff membership is read from a table rather than a JWT claim, so revoking
 * someone's access takes effect immediately instead of whenever their token
 * happens to refresh.
 */
create table if not exists public.staff (
  user_id uuid primary key references auth.users on delete cascade,
  organization_id text not null,
  role text not null default 'scorekeeper'
    check (role in ('director', 'scorekeeper', 'checkin', 'arbiter')),
  created_at timestamptz not null default now()
);

create or replace function public.is_staff(org text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.staff
    where user_id = auth.uid() and organization_id = org
  );
$$;

create or replace function public.is_director(org text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.staff
    where user_id = auth.uid() and organization_id = org and role = 'director'
  );
$$;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id text primary key,
  organization_id text not null,
  slug text not null unique,
  name text not null,
  subtitle text,
  data jsonb not null default '{}'::jsonb,
  -- Drafts stay internal so an unannounced event does not leak.
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  state text not null default 'draft',
  status text not null default 'active' check (status in ('active', 'archived', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_org_idx on public.events (organization_id, status);
create index if not exists events_slug_idx on public.events (slug);

-- ---------------------------------------------------------------------------
-- Event-owned records
-- ---------------------------------------------------------------------------

/*
 * One shape for every event-owned record. The domain payload lives in `data`
 * because these documents change shape as the product does, and a migration
 * per field change would be friction with no safety gain — the application
 * types are the contract, and they are checked at compile time.
 *
 * What is *not* in jsonb is anything a policy depends on. Scope, status and
 * kind are real columns so the database can enforce access without parsing
 * JSON.
 */
create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  collection text not null,
  organization_id text not null,
  event_id text not null references public.events (id) on delete restrict,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists records_scope_idx
  on public.records (organization_id, event_id, collection, status);
create index if not exists records_collection_idx on public.records (collection);

-- Keeps updated_at honest without trusting the client to send it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  -- created_at is written once. A rewritten creation time destroys the only
  -- record of when something happened.
  new.created_at = old.created_at;
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
  before update on public.records
  for each row execute function public.touch_updated_at();

drop trigger if exists events_touch on public.events;
create trigger events_touch
  before update on public.events
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.staff enable row level security;
alter table public.events enable row level security;
alter table public.records enable row level security;

-- ---- Staff ---------------------------------------------------------------

create policy "staff read own organization"
  on public.staff for select
  using (public.is_staff(organization_id));

create policy "directors manage staff"
  on public.staff for all
  using (public.is_director(organization_id))
  with check (public.is_director(organization_id));

-- ---- Events --------------------------------------------------------------

-- Published events are public; that is the point of a public event page.
create policy "published events are public"
  on public.events for select
  using (visibility = 'public' and status = 'active');

create policy "staff read their own events"
  on public.events for select
  using (public.is_staff(organization_id));

create policy "staff write their own events"
  on public.events for insert
  with check (public.is_staff(organization_id));

create policy "staff update their own events"
  on public.events for update
  using (public.is_staff(organization_id))
  with check (public.is_staff(organization_id));

-- No delete policy. Events are archived, never removed: results and
-- certificates outlive the event and must stay resolvable years later.

-- ---- Records -------------------------------------------------------------

/*
 * Collections a participant may write to without signing in. Registering,
 * uploading a receipt reference, submitting a score and checking in are all
 * things people do from a phone with no account.
 */
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
    'interestRegistrations'
  );
$$;

/*
 * Collections readable by anyone. Certificates resolve publicly by design —
 * that is what makes one checkable years later — and published results are
 * meant to be seen. Everything else, including every registration and payment,
 * is organizer-only.
 */
create or replace function public.is_public_readable(c text)
returns boolean
language sql
immutable
as $$
  select c in ('certificates', 'verifiedResults', 'standings', 'awards', 'registrationForms');
$$;

create policy "public reads open collections"
  on public.records for select
  using (status = 'active' and public.is_public_readable(collection));

create policy "staff read every record"
  on public.records for select
  using (public.is_staff(organization_id));

/*
 * Anyone may submit. What they may not do is decide their own outcome: a
 * client-supplied record cannot arrive already verified, confirmed, or
 * carrying a final placement.
 */
create policy "anyone may submit to open collections"
  on public.records for insert
  with check (
    public.is_public_writable(collection)
    and status = 'active'
    and not (data ? 'verifiedBy')
    and not (data ? 'verifiedAt')
    and not (data ? 'finalLevel')
    and coalesce((data ->> 'confirmed')::boolean, false) = false
    and coalesce(data ->> 'paymentStatus', 'not-submitted') in
        ('not-submitted', 'receipt-uploaded', 'cash-at-venue')
  );

create policy "staff insert any record"
  on public.records for insert
  with check (public.is_staff(organization_id));

-- Only staff may change a record after it is submitted.
create policy "staff update records"
  on public.records for update
  using (public.is_staff(organization_id))
  with check (public.is_staff(organization_id));

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

/*
 * Append-only. An audit log that can be edited or deleted after the fact
 * documents nothing, so there is no update or delete policy at all.
 */
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  event_id text,
  actor text not null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

create policy "directors read the audit log"
  on public.audit_logs for select
  using (public.is_director(organization_id));

create policy "staff append to the audit log"
  on public.audit_logs for insert
  with check (public.is_staff(organization_id));

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- Lets the organizer's dashboard update as registrations arrive, with no
-- polling and no manual refresh.
alter publication supabase_realtime add table public.records;
alter publication supabase_realtime add table public.events;
