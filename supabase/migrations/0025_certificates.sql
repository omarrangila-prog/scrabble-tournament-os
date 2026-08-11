-- Certificates in the database, so the QR on a printed one resolves.
--
-- They were held in browser storage. The director issued them on their laptop, and the
-- verification page read whatever was in the browser it happened to be opened in — so a
-- participant scanning the code on their own certificate was told it did not exist. The
-- QR, the code and the "anyone can check this" promise all pointed at nothing.
--
-- A verification that only works on the machine that issued it is not a verification.

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  event_id text not null references public.events (id) on delete restrict,

  /* Printed on the certificate and typed by anyone checking it. */
  code text not null,

  kind text not null
    check (kind in ('champion', 'placement', 'participation', 'special')),

  /* The registration this belongs to, and the name as printed. */
  recipient_id uuid references public.records (id) on delete set null,
  recipient_name text not null,
  division text,

  /* The claim, its supporting detail, and the line about this person. */
  statement text not null,
  detail text,
  personal_note text,

  status text not null default 'draft'
    check (status in ('draft', 'issued', 'revoked')),

  issued_at timestamptz,
  issued_by text,

  revoked_at timestamptz,
  revoked_by text,
  revoked_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /*
   * An issued certificate must say who issued it. A signature with nobody behind it is
   * the thing a verification page exists to rule out.
   */
  constraint issued_certificates_have_an_issuer check (
    status <> 'issued' or (issued_at is not null and issued_by is not null)
  ),

  /* A withdrawal has to give a reason, or nobody can answer "why is this void?". */
  constraint revoked_certificates_have_a_reason check (
    status <> 'revoked' or (revoked_at is not null and revoked_reason is not null)
  )
);

/* The code is what anyone checking types, so it must identify exactly one certificate. */
create unique index if not exists certificates_code_idx on public.certificates (code);
create index if not exists certificates_event_idx on public.certificates (event_id, status);

drop trigger if exists certificates_touch on public.certificates;
create trigger certificates_touch
  before update on public.certificates
  for each row
  execute function public.touch_updated_at();

alter table public.certificates enable row level security;

/*
 * Staff only, directly. Verification goes through the function below, which returns one
 * certificate by code and nothing else — a public read of this table would let anyone
 * download the whole prize list, including drafts that are still being decided.
 */
drop policy if exists "certificates are staff-read" on public.certificates;
create policy "certificates are staff-read"
  on public.certificates for select
  using (public.is_staff('org-federation'));

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------

/**
 * Saves a prepared certificate, or updates one that already exists.
 *
 * Keyed on the code, which the studio generates once per recipient, so preparing twice
 * does not produce two certificates for one person.
 */
create or replace function public.staff_save_certificate(
  p_event_id text,
  p_code text,
  p_kind text,
  p_recipient_id uuid,
  p_recipient_name text,
  p_division text,
  p_statement text,
  p_detail text,
  p_personal_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_id uuid;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  insert into public.certificates (
    organization_id, event_id, code, kind, recipient_id, recipient_name,
    division, statement, detail, personal_note
  )
  values (
    v_org, p_event_id, p_code, p_kind, p_recipient_id, p_recipient_name,
    nullif(p_division, ''), p_statement, nullif(p_detail, ''), nullif(p_personal_note, '')
  )
  on conflict (code) do update set
    kind = excluded.kind,
    recipient_name = excluded.recipient_name,
    division = excluded.division,
    statement = excluded.statement,
    detail = excluded.detail,
    personal_note = excluded.personal_note,
    updated_at = now()
  returning id into v_id;

  return v_id;
end $$;

/**
 * Issues a certificate: the point at which it becomes checkable by anyone.
 *
 * Refuses to re-issue one that is already issued, so a second press cannot rewrite the
 * date and the name of whoever signed it. Refuses a withdrawn one outright — bringing a
 * void certificate back has to be a deliberate act, not a mis-click.
 */
create or replace function public.staff_issue_certificate(p_code text, p_by text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  if coalesce(trim(p_by), '') = '' then
    raise exception 'The person issuing it is required';
  end if;

  select status into v_status from public.certificates where code = p_code;
  if v_status is null then
    raise exception 'No certificate with that code';
  end if;

  if v_status = 'issued' then
    return 'already-issued';
  end if;

  if v_status = 'revoked' then
    raise exception 'That certificate was withdrawn';
  end if;

  update public.certificates
  set status = 'issued', issued_at = now(), issued_by = p_by
  where code = p_code;

  return 'issued';
end $$;

/** Withdraws a certificate, with the reason a checker will be shown. */
create or replace function public.staff_revoke_certificate(
  p_code text,
  p_by text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required';
  end if;

  update public.certificates
  set status = 'revoked', revoked_at = now(), revoked_by = p_by, revoked_reason = p_reason
  where code = p_code;

  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

/** Every certificate for an event, for the studio. Staff only. */
create or replace function public.staff_certificates(p_event_id text)
returns table (
  out_code text,
  out_kind text,
  out_recipient_id uuid,
  out_recipient_name text,
  out_division text,
  out_statement text,
  out_detail text,
  out_personal_note text,
  out_status text,
  out_issued_at timestamptz,
  out_issued_by text,
  out_revoked_reason text
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
  select c.code, c.kind, c.recipient_id, c.recipient_name, c.division, c.statement,
         c.detail, c.personal_note, c.status, c.issued_at, c.issued_by, c.revoked_reason
  from public.certificates c
  where c.event_id = p_event_id
  order by c.created_at;
end $$;

/**
 * One certificate, by the code printed on it. Readable by anyone.
 *
 * This is the whole point of the QR: somebody holding a certificate, or somebody shown
 * one, can confirm it against the record without an account.
 *
 * A draft returns nothing. Until it is issued there is nothing to confirm, and answering
 * "this exists but is not issued" would leak what is still being decided.
 *
 * No ids and no contact details — a name, a claim, and whether it stands.
 */
create or replace function public.certificate_by_code(p_code text)
returns table (
  out_code text,
  out_recipient_name text,
  out_statement text,
  out_detail text,
  out_personal_note text,
  out_division text,
  out_kind text,
  out_status text,
  out_issued_at timestamptz,
  out_issued_by text,
  out_revoked_reason text,
  out_event_name text,
  out_event_date text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return query
  select c.code, c.recipient_name, c.statement, c.detail, c.personal_note, c.division,
         c.kind, c.status, c.issued_at, c.issued_by, c.revoked_reason,
         e.name, e.data ->> 'startDate'
  from public.certificates c
  join public.events e on e.id = c.event_id
  where upper(btrim(c.code)) = upper(btrim(p_code))
    and c.status <> 'draft';
end $$;

revoke all on function public.staff_save_certificate(text, text, text, uuid, text, text, text, text, text) from public, anon;
revoke all on function public.staff_issue_certificate(text, text) from public, anon;
revoke all on function public.staff_revoke_certificate(text, text, text) from public, anon;
revoke all on function public.staff_certificates(text) from public, anon;

grant execute on function public.staff_save_certificate(text, text, text, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.staff_issue_certificate(text, text) to authenticated;
grant execute on function public.staff_revoke_certificate(text, text, text) to authenticated;
grant execute on function public.staff_certificates(text) to authenticated;

-- The verification page is meant to work for anybody holding a certificate.
grant execute on function public.certificate_by_code(text) to anon, authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.staff_issue_certificate(text, text)', 'execute') then
    raise exception 'anon can issue certificates';
  end if;

  if not has_function_privilege('anon', 'public.certificate_by_code(text)', 'execute') then
    raise exception 'anon cannot verify a certificate, which is the whole point of the code';
  end if;

  if exists (select 1 from public.certificate_by_code('no-such-code')) then
    raise exception 'An unknown code returned a certificate';
  end if;

  raise notice 'certificates: staff write, anyone verifies, unknown codes return nothing';
end $$;
