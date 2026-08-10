-- Organizer access to the participant list.
--
-- Registrations are deliberately unreadable by an anonymous caller, which is why
-- nobody can enumerate who is attending. The consequence is that the organizer
-- could not see them either: the dashboard had no way in.
--
-- This adds the way in, and it is real authentication rather than a client-side
-- check. Removing the sign-in password earlier left the dashboard open to anyone
-- who found the URL; a password field that the browser validates would be no
-- better, because a browser can be told to skip it. The gate has to be the
-- database.
--
-- How it works:
--
--   1. The organizer signs in with email and password through Supabase Auth.
--   2. A trigger puts them in `staff` — but only if their address is on the
--      allowlist below. Anyone else who signs up gets an account that can see
--      exactly what an anonymous visitor sees.
--   3. `is_staff` then passes, and the existing read policies let them through.
--
-- The allowlist is in the database, not in the app. A list shipped in JavaScript
-- can be read and edited by whoever opens the page.

create table if not exists public.staff_allowlist (
  email text primary key,
  organization_id text not null,
  role text not null default 'director'
    check (role in ('director', 'scorekeeper', 'checkin', 'arbiter')),
  added_at timestamptz not null default now()
);

alter table public.staff_allowlist enable row level security;

/*
 * Nobody may read the allowlist. Knowing which addresses grant access is the
 * first thing an attacker would want, and no screen needs to display it.
 */
create policy "allowlist is not readable"
  on public.staff_allowlist for select
  using (false);

insert into public.staff_allowlist (email, organization_id, role)
values ('mahmedrangila@gmail.com', 'org-federation', 'director')
on conflict (email) do update set role = excluded.role;

/**
 * Grants staff membership on sign-up, to allowlisted addresses only.
 *
 * Runs on the auth user rather than at sign-in, so access is decided once when
 * the account is created and not re-evaluated by anything the client sends.
 */
create or replace function public.grant_staff_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed public.staff_allowlist;
begin
  select * into allowed
  from public.staff_allowlist
  where lower(email) = lower(new.email);

  if found then
    insert into public.staff (user_id, organization_id, role)
    values (new.id, allowed.organization_id, allowed.role)
    on conflict (user_id) do update
      set organization_id = excluded.organization_id,
          role = excluded.role;
  end if;

  return new;
end $$;

drop trigger if exists grant_staff_trigger on auth.users;

create trigger grant_staff_trigger
  after insert on auth.users
  for each row
  execute function public.grant_staff_on_signup();

-- ---------------------------------------------------------------------------
-- The participant list
-- ---------------------------------------------------------------------------

/**
 * Every registration for one event, for staff only.
 *
 * Returns contact details, which is exactly why it checks `is_staff` first and
 * returns nothing otherwise. An unauthenticated caller gets an empty list rather
 * than an error, so this cannot be used to probe whether an event exists.
 */
create or replace function public.organizer_registrations(p_event_id text)
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
  out_submitted_at timestamptz
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
    r.created_at
  from public.records r
  where r.collection = 'registrations'
    and r.event_id = p_event_id
    and r.status = 'active'
  order by r.created_at desc;
end $$;

/**
 * Marks a payment verified, by a named person.
 *
 * `verifiedBy` records who decided, because "verified" with nobody attached is
 * not an audit trail. Staff only, checked here rather than in the browser.
 */
create or replace function public.verify_payment(p_record_id uuid, p_by text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff('org-federation') then
    return false;
  end if;

  update public.records
  set data = jsonb_set(
               jsonb_set(
                 jsonb_set(data, '{paymentStatus}', '"verified"'),
                 '{verifiedBy}', to_jsonb(p_by)
               ),
               '{verifiedAt}', to_jsonb(now())
             ),
      updated_at = now()
  where id = p_record_id
    and collection = 'registrations';

  return true;
end $$;

grant execute on function public.organizer_registrations(text) to authenticated;
grant execute on function public.verify_payment(uuid, text) to authenticated;
