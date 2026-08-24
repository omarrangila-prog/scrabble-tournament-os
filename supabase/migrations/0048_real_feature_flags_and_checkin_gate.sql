-- Phase 1, unit B: real, server-backed event settings, and one shared check-in eligibility
-- rule instead of two that can drift.
--
-- Today there is no feature-flag mechanism anywhere in this codebase — confirmed by a full
-- grep for every plausible name. The only things that look like toggles are on the Settings
-- page, and two of the four are `<Toggle checked onChange={() => undefined}>` — hardcoded on,
-- with no effect. The other two write to a Zustand/localStorage model that no Supabase-backed
-- screen ever reads. This is the real thing: one row per event, real columns, read from the
-- same place by every screen that cares.
--
-- Separately: staff check-in and self check-in have always enforced different rules. Self
-- check-in blocks on an unverified/rejected payment; staff check-in has never once looked at
-- payment status. A staffer could check in someone whose payment was rejected; the same
-- person could not check themselves in. This adds one shared eligibility function both paths
-- call, and gives staff what they're actually supposed to have — the ability to override,
-- deliberately, with a reason, rather than an invisible gap.

-- ---------------------------------------------------------------------------
-- 1. event_settings — one row per event, real booleans
-- ---------------------------------------------------------------------------
create table if not exists public.event_settings (
  event_id text primary key references public.events (id) on delete cascade,
  qr_enabled boolean not null default true,
  self_checkin_enabled boolean not null default true,
  player_score_entry_enabled boolean not null default true,
  opponent_confirmation_enabled boolean not null default true,
  certificates_enabled boolean not null default true,
  email_enabled boolean not null default true,
  whatsapp_enabled boolean not null default true,
  first_second_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.event_settings enable row level security;

drop policy if exists "staff read event settings" on public.event_settings;
create policy "staff read event settings"
  on public.event_settings for select
  using (public.is_staff((select organization_id from public.events where id = event_id)));

-- No insert/update policy: written only through `staff_set_event_settings`, which runs as
-- this table's owner — the same pattern every other staff-only mutation in this file uses.

/**
 * Every setting, for staff. A missing row (an event created before this migration, or one
 * nobody has touched settings on yet) reads as every default above — the same as if the row
 * existed with defaults, so a caller never has to special-case "no row yet".
 */
create or replace function public.staff_get_event_settings(p_event_id text)
returns public.event_settings
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select s from public.event_settings s where s.event_id = p_event_id),
    row(p_event_id, true, true, true, true, true, true, true, false, now(), null)::public.event_settings
  )
  where public.is_staff((select organization_id from public.events where id = p_event_id));
$$;

revoke all on function public.staff_get_event_settings(text) from public, anon;
grant execute on function public.staff_get_event_settings(text) to authenticated;

/**
 * The subset a participant's own phone needs to decide whether to show a QR code or a
 * self-check-in button — public because the pages that read it have no session. Nothing
 * here is sensitive: four booleans, nothing else.
 */
create or replace function public.event_public_settings(p_event_id text)
returns table (
  out_qr_enabled boolean,
  out_self_checkin_enabled boolean,
  out_player_score_entry_enabled boolean,
  out_opponent_confirmation_enabled boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    coalesce(s.qr_enabled, true),
    coalesce(s.self_checkin_enabled, true),
    coalesce(s.player_score_entry_enabled, true),
    coalesce(s.opponent_confirmation_enabled, true)
  from (select p_event_id as event_id) e
  left join public.event_settings s on s.event_id = e.event_id;
$$;

grant execute on function public.event_public_settings(text) to anon, authenticated;

/** Updates one or more settings. Only the keys present in `p_patch` change; the rest hold. */
create or replace function public.staff_set_event_settings(
  p_event_id text,
  p_patch jsonb,
  p_by text
)
returns public.event_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_before public.event_settings;
  v_after public.event_settings;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  select * into v_before from public.event_settings where event_id = p_event_id;

  insert into public.event_settings (event_id)
  values (p_event_id)
  on conflict (event_id) do nothing;

  update public.event_settings set
    qr_enabled = coalesce((p_patch ->> 'qrEnabled')::boolean, qr_enabled),
    self_checkin_enabled = coalesce((p_patch ->> 'selfCheckinEnabled')::boolean, self_checkin_enabled),
    player_score_entry_enabled = coalesce((p_patch ->> 'playerScoreEntryEnabled')::boolean, player_score_entry_enabled),
    opponent_confirmation_enabled = coalesce((p_patch ->> 'opponentConfirmationEnabled')::boolean, opponent_confirmation_enabled),
    certificates_enabled = coalesce((p_patch ->> 'certificatesEnabled')::boolean, certificates_enabled),
    email_enabled = coalesce((p_patch ->> 'emailEnabled')::boolean, email_enabled),
    whatsapp_enabled = coalesce((p_patch ->> 'whatsappEnabled')::boolean, whatsapp_enabled),
    first_second_enabled = coalesce((p_patch ->> 'firstSecondEnabled')::boolean, first_second_enabled),
    updated_at = now(),
    updated_by = coalesce(nullif(trim(p_by), ''), 'unknown')
  where event_id = p_event_id
  returning * into v_after;

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(trim(p_by), ''), 'unknown'), 'set-event-settings',
    jsonb_build_object('before', to_jsonb(v_before), 'after', to_jsonb(v_after))
  );

  return v_after;
end $$;

revoke all on function public.staff_set_event_settings(text, jsonb, text) from public, anon;
grant execute on function public.staff_set_event_settings(text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. One shared check-in eligibility rule
-- ---------------------------------------------------------------------------

/**
 * Whether a payment status permits check-in at all, and why not if it doesn't. Both the
 * self-service and staff check-in paths call this — previously self-service had these two
 * lists inline and staff check-in had no payment awareness whatsoever.
 */
create or replace function public.checkin_payment_gate(p_payment_status text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_payment_status in ('invalid-receipt', 'duplicate-transaction', 'amount-mismatch', 'refunded')
      then 'Please see the event desk to complete your registration.'
    when p_payment_status in ('not-submitted', 'receipt-uploaded', 'processing', 'review-required')
      then 'Your payment is still being checked. Please see the desk.'
    else null
  end;
$$;

drop function if exists public.check_in_registration(text, text, text, text);
create function public.check_in_registration(
  p_event_id text,
  p_code text,
  p_token text,
  p_method text
)
returns table (
  result text,
  full_name text,
  checked_in_at timestamptz,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.records;
  v_block text;
begin
  if p_method not in ('personal_link', 'venue_qr', 'staff_manual') then
    return query select 'blocked', null::text, null::timestamptz,
      'That check-in method is not recognised.';
    return;
  end if;

  select * into rec
  from public.records r
  where r.collection = 'registrations'
    and r.event_id = p_event_id
    and r.status = 'active'
    and (
      (p_code is not null and r.check_in_code = regexp_replace(p_code, '\D', '', 'g'))
      or (p_token is not null and r.data ->> 'token' = btrim(p_token))
    )
  limit 1
  for update;

  if not found then
    return query select 'not_found', null::text, null::timestamptz,
      'We could not find that code. Please check and try again.';
    return;
  end if;

  if rec.checked_in_at is not null then
    return query select 'already_checked_in', rec.data ->> 'fullName', rec.checked_in_at,
      'You are already checked in.';
    return;
  end if;

  v_block := public.checkin_payment_gate(rec.data ->> 'paymentStatus');
  if v_block is not null then
    return query select 'blocked', rec.data ->> 'fullName', null::timestamptz, v_block;
    return;
  end if;

  update public.records
  set checked_in_at = now(),
      check_in_method = p_method,
      updated_at = now()
  where id = rec.id
    and checked_in_at is null;

  return query select 'checked_in', rec.data ->> 'fullName', now(),
    'You are checked in.';
end $$;

-- Dropping the function for its signature-preserving rebuild above also dropped its grants —
-- this is public self-service check-in, so `anon` needs it back.
grant execute on function public.check_in_registration(text, text, text, text) to anon, authenticated;

/**
 * Staff check-in, now payment-aware — matching the audit's finding that this was the one
 * check-in path with no awareness of payment status at all.
 *
 * Unlike self check-in, staff does not get silently blocked: a blocking payment status is
 * reported back (`out_blocked_reason`) and check-in is refused *unless* `p_override_reason`
 * is given, in which case it proceeds and the override — and why — is written to the audit
 * log alongside the payment status it overrode. The default (no reason) behaves like
 * self-service: refuse and explain. The override is what staff actually needed, done visibly
 * rather than by the check simply not existing.
 */
-- The old 1-argument signature has no payment awareness at all — it is the exact bug this
-- unit fixes. If it were left standing alongside the new 2-argument version, a caller that
-- omits `p_override_reason` would still resolve to this old exact-arity match, not the new
-- one with a defaultable parameter, and the payment gate below would never run.
drop function if exists public.staff_check_in(uuid);
create or replace function public.staff_check_in(
  p_record_id uuid,
  p_override_reason text default null
)
returns table (
  out_checked_in_at timestamptz,
  out_already boolean,
  out_blocked_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing timestamptz;
  v_org text;
  v_event text;
  v_payment text;
  v_block text;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select checked_in_at, organization_id, event_id, data ->> 'paymentStatus'
    into v_existing, v_org, v_event, v_payment
  from public.records
  where id = p_record_id and collection = 'registrations';

  if not found then
    raise exception 'No such registration';
  end if;

  if v_existing is not null then
    return query select v_existing, true, null::text;
    return;
  end if;

  v_block := public.checkin_payment_gate(v_payment);
  if v_block is not null and coalesce(trim(p_override_reason), '') = '' then
    return query select null::timestamptz, false, v_block;
    return;
  end if;

  update public.records
  set checked_in_at = now(),
      check_in_method = 'staff_manual',
      updated_at = now()
  where id = p_record_id
  returning checked_in_at into v_existing;

  perform public.write_audit_log(
    v_org, v_event, coalesce(public.current_staff_email(), 'unknown'), 'check-in',
    case
      when v_block is not null then
        jsonb_build_object('recordId', p_record_id, 'paymentOverride', v_payment, 'overrideReason', p_override_reason)
      else jsonb_build_object('recordId', p_record_id)
    end
  );

  return query select v_existing, false, null::text;
end $$;

revoke all on function public.staff_check_in(uuid, text) from public, anon;
grant execute on function public.staff_check_in(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------
do $$
begin
  if not has_function_privilege('anon', 'public.event_public_settings(text)', 'execute') then
    raise exception 'a participant''s phone cannot read event settings — QR gating would break';
  end if;
  if has_function_privilege('anon', 'public.staff_set_event_settings(text, jsonb, text)', 'execute') then
    raise exception 'anon can change event settings';
  end if;
  raise notice 'Phase 1 unit B applied: event_settings table + shared check-in eligibility rule.';
end $$;
