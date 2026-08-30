-- Every staff mutation now leaves a trace.
--
-- `audit_logs` has existed since the first migration with correct append-only RLS, and
-- sixteen of the twenty-seven mutating staff functions write to it. Eleven did not. Two of
-- those eleven are named in the specification's own list of actions that must be audited:
-- adding a walk-in, which is how a late arrival enters a tournament, and setting the table
-- plan, which is how a match moves board. The rest change tournament rules, who can see the
-- event, or what has been issued to a player.
--
-- The gap mattered most where it was quietest. A director could change the number of rounds
-- or the pairing system mid-event, or make a draft event public, and nothing recorded that
-- it had happened or who did it. When something goes wrong on the day, the audit log is the
-- only account of what was actually done — a gap in it is not a missing feature, it is a
-- missing answer.
--
-- The bodies below are carried forward exactly as deployed. The only new statement in each
-- is one `perform public.write_audit_log(...)` immediately before its final return, so a
-- failed call still writes nothing and a successful one always writes.
--
-- Certificate actions look their organisation and event up from the certificate itself,
-- since those functions are addressed by code and never carried an event id.

-- staff_add_walkin: writes a 'add-walkin' entry. Body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.staff_add_walkin(p_event_id text, p_full_name text, p_mobile text, p_playing_level text, p_amount numeric DEFAULT 0, p_by text DEFAULT NULL::text)
 RETURNS TABLE(out_id uuid, out_check_in_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org text;
  v_code text;
  v_attempts integer := 0;
  v_id uuid;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'A name is required';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  loop
    v_code := lpad((floor(random() * 900000) + 100000)::text, 6, '0');
    exit when not exists (
      select 1 from public.records
      where event_id = p_event_id and check_in_code = v_code
    );

    v_attempts := v_attempts + 1;
    if v_attempts > 40 then
      raise exception 'Could not allocate a check-in code';
    end if;
  end loop;

  insert into public.records (
    collection, organization_id, event_id, data,
    check_in_code, checked_in_at, check_in_method
  )
  values (
    'registrations',
    v_org,
    p_event_id,
    jsonb_build_object(
      'fullName', trim(p_full_name),
      'mobile', coalesce(trim(p_mobile), ''),
      'email', '',
      'preferredDivision', p_playing_level,
      'confirmedDivision', p_playing_level,
      'status', 'approved',
      'paymentStatus', 'unpaid',
      'amountDue', coalesce(p_amount, 0),
      'currency', 'PKR',
      -- Where the distinction between a walk-in and a form entry belongs.
      'source', 'walk-in',
      'addedBy', coalesce(p_by, 'staff')
    ),
    v_code,
    now(),
    'staff_manual'
  )
  returning id into v_id;

  perform public.write_audit_log(
    v_org,
    p_event_id,
    coalesce(public.current_staff_email(), 'unknown'),
    'add-walkin',
    jsonb_build_object('name', btrim(p_full_name), 'mobile', p_mobile, 'level', p_playing_level, 'code', v_code)
  );

  return query select v_id, v_code;
end $function$;

-- staff_create_event: writes a 'create-event' entry. Body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.staff_create_event(p_slug text, p_name text, p_subtitle text, p_data jsonb)
 RETURNS TABLE(out_id text, out_slug text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_slug text;
  v_id text;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'The event needs a name';
  end if;

  /*
   * The slug is normalised here rather than trusted.
   *
   * It becomes part of a public URL, so "Blufy's AlphaBattle 2027" has to become
   * something that survives being typed, shared and put in a QR code. Doing it in the
   * database means every route in — a form now, an import later — gets the same answer.
   */
  v_slug := lower(trim(coalesce(nullif(trim(p_slug), ''), p_name)));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);

  if v_slug = '' then
    raise exception 'The name has no letters or numbers to make a link from';
  end if;

  if exists (select 1 from public.events where slug = v_slug) then
    raise exception 'An event already uses the link /events/%', v_slug;
  end if;

  v_id := 'evt-' || v_slug;

  if exists (select 1 from public.events where id = v_id) then
    raise exception 'An event with that identifier already exists';
  end if;

  /*
   * Created as a draft and private.
   *
   * A new event must not appear on the public site the moment it is named. The
   * organizer opens registration deliberately, once the date, fee and payment details
   * are right — the same reason the phase is a separate control rather than a side
   * effect.
   */
  insert into public.events (
    id, organization_id, slug, name, subtitle, data, visibility, state, status
  )
  values (
    v_id,
    'org-federation',
    v_slug,
    trim(p_name),
    nullif(trim(coalesce(p_subtitle, '')), ''),
    coalesce(p_data, '{}'::jsonb),
    'private',
    'draft',
    'active'
  );

  perform public.write_audit_log(
    'org-federation',
    v_id,
    coalesce(public.current_staff_email(), 'unknown'),
    'create-event',
    jsonb_build_object('slug', v_slug, 'name', trim(p_name))
  );

  return query select v_id, v_slug;
end $function$;

-- staff_issue_certificate: writes a 'issue-certificate' entry. Body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.staff_issue_certificate(p_code text, p_by text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  perform public.write_audit_log(
    (select c.organization_id from public.certificates c where c.code = p_code),
    (select c.event_id from public.certificates c where c.code = p_code),
    p_by,
    'issue-certificate',
    jsonb_build_object('code', p_code)
  );

  return 'issued';
end $function$;

-- staff_revoke_certificate: writes a 'revoke-certificate' entry. Body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.staff_revoke_certificate(p_code text, p_by text, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  perform public.write_audit_log(
    (select c.organization_id from public.certificates c where c.code = p_code),
    (select c.event_id from public.certificates c where c.code = p_code),
    p_by,
    'revoke-certificate',
    jsonb_build_object('code', p_code, 'reason', p_reason)
  );

  return true;
end $function$;

-- staff_save_certificate: writes a 'save-certificate' entry. Body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.staff_save_certificate(p_event_id text, p_code text, p_kind text, p_recipient_id uuid, p_recipient_name text, p_division text, p_statement text, p_detail text, p_personal_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  perform public.write_audit_log(
    v_org,
    p_event_id,
    coalesce(public.current_staff_email(), 'unknown'),
    'save-certificate',
    jsonb_build_object('code', p_code, 'kind', p_kind, 'recipient', p_recipient_id)
  );

  return v_id;
end $function$;

-- staff_mark_confirmation_sent: writes a 'mark-confirmation-sent' entry. Body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.staff_mark_confirmation_sent(p_event_id text, p_number text, p_channel text, p_ok boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  if p_channel not in ('email', 'whatsapp') then
    raise exception 'Unknown channel %', p_channel;
  end if;

  update public.records
  set data = data
      || jsonb_build_object(
           'confirmationSentAt', now(),
           case when p_channel = 'email' then 'confirmationEmailStatus'
                else 'confirmationWhatsAppStatus' end,
           case when p_ok then 'sent' else 'delivery-failed' end
         )
      || jsonb_build_object(
           'detailsConfirmationStatus',
           case
             when coalesce(data ->> 'detailsConfirmationStatus', 'not-sent')
                  in ('confirmed', 'correction-requested')
               then data ->> 'detailsConfirmationStatus'
             when p_ok then 'sent'
             else 'delivery-failed'
           end
         ),
      updated_at = now()
  where collection = 'registrations'
    and event_id = p_event_id
    and status = 'active'
    and data ->> 'playerNumber' = btrim(p_number);

  perform public.write_audit_log(
    (select e.organization_id from public.events e where e.id = p_event_id),
    p_event_id,
    coalesce(public.current_staff_email(), 'unknown'),
    'mark-confirmation-sent',
    jsonb_build_object('playerNumber', btrim(p_number), 'channel', p_channel, 'delivered', p_ok)
  );

  return true;
end $function$;

-- staff_save_round_timer: writes a 'save-round-timer' entry. Body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.staff_save_round_timer(p_event_id text, p_round integer, p_planned_minutes integer, p_extensions jsonb, p_started_at timestamp with time zone, p_paused_at timestamp with time zone, p_paused_ms bigint, p_ended_at timestamp with time zone, p_by text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  insert into public.round_timers (
    organization_id, event_id, round, planned_minutes, extensions,
    started_at, paused_at, paused_ms, ended_at, updated_by
  )
  values (
    v_org, p_event_id, p_round, p_planned_minutes, coalesce(p_extensions, '[]'::jsonb),
    p_started_at, p_paused_at, coalesce(p_paused_ms, 0), p_ended_at, p_by
  )
  on conflict (event_id, round) do update set
    planned_minutes = excluded.planned_minutes,
    extensions = excluded.extensions,
    started_at = excluded.started_at,
    paused_at = excluded.paused_at,
    paused_ms = excluded.paused_ms,
    ended_at = excluded.ended_at,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning id into v_id;

  perform public.write_audit_log(
    v_org,
    p_event_id,
    coalesce(nullif(btrim(coalesce(p_by, '')), ''), coalesce(public.current_staff_email(), 'unknown')),
    'save-round-timer',
    jsonb_build_object('round', p_round, 'plannedMinutes', p_planned_minutes)
  );

  return v_id;
end $function$;

-- staff_set_break_kind: writes a 'set-break-kind' entry. Body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.staff_set_break_kind(p_event_id text, p_kind text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org text;
begin
  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  if not public.is_staff(v_org) then
    raise exception 'Not authorised';
  end if;

  if p_kind not in ('break', 'lunch') then
    raise exception 'A break is either a break or lunch';
  end if;

  update public.events
  set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('breakKind', p_kind),
      updated_at = now()
  where id = p_event_id;

  perform public.write_audit_log(
    v_org,
    p_event_id,
    coalesce(public.current_staff_email(), 'unknown'),
    'set-break-kind',
    jsonb_build_object('kind', p_kind)
  );

  return p_kind;
end $function$;

-- staff_set_event_format: writes a 'set-event-format' entry. Body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.staff_set_event_format(p_event_id text, p_rounds integer, p_round_minutes integer, p_pairing_system text DEFAULT 'swiss'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  if p_rounds is null or p_rounds < 1 or p_rounds > 12 then
    raise exception 'A tournament has between 1 and 12 rounds, not %', p_rounds;
  end if;

  if p_round_minutes is null or p_round_minutes < 5 or p_round_minutes > 90 then
    raise exception 'A round runs between 5 and 90 minutes, not %', p_round_minutes;
  end if;

  if p_pairing_system not in ('swiss', 'round-robin', 'knockout', 'king-of-the-hill', 'manual') then
    raise exception 'Unknown pairing system %', p_pairing_system;
  end if;

  update public.events
  set data = coalesce(data, '{}'::jsonb)
             || jsonb_build_object('rounds', p_rounds, 'roundMinutes', p_round_minutes, 'pairingSystem', p_pairing_system),
      updated_at = now()
  where id = p_event_id;

  perform public.write_audit_log(
    (select e.organization_id from public.events e where e.id = p_event_id),
    p_event_id,
    coalesce(public.current_staff_email(), 'unknown'),
    'set-event-format',
    jsonb_build_object('rounds', p_rounds, 'roundMinutes', p_round_minutes, 'pairingSystem', p_pairing_system)
  );

  return true;
end $function$;

-- staff_set_event_visibility: writes a 'set-event-visibility' entry. Body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.staff_set_event_visibility(p_event_id text, p_visibility text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_visibility text;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  if p_visibility not in ('public', 'private') then
    raise exception 'Visibility must be public or private';
  end if;

  update public.events
  set visibility = p_visibility,
      updated_at = now()
  where id = p_event_id
  returning visibility into v_visibility;

  if v_visibility is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  perform public.write_audit_log(
    (select e.organization_id from public.events e where e.id = p_event_id),
    p_event_id,
    coalesce(public.current_staff_email(), 'unknown'),
    'set-event-visibility',
    jsonb_build_object('visibility', v_visibility)
  );

  return v_visibility;
end $function$;

-- staff_set_table_plan: writes a 'set-table-plan' entry. Body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.staff_set_table_plan(p_event_id text, p_plan jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org text;
begin
  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  if not public.is_staff(v_org) then
    raise exception 'Not authorised';
  end if;

  if jsonb_typeof(p_plan) <> 'array' then
    raise exception 'The table plan must be a list of divisions';
  end if;

  update public.events
  set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('tablePlan', p_plan),
      updated_at = now()
  where id = p_event_id;

  perform public.write_audit_log(
    v_org,
    p_event_id,
    coalesce(public.current_staff_email(), 'unknown'),
    'set-table-plan',
    jsonb_build_object('plan', p_plan)
  );

  return p_plan;
end $function$;

do $$
declare
  v_silent text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_silent
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'staff_add_walkin', 'staff_create_event', 'staff_issue_certificate',
      'staff_mark_confirmation_sent', 'staff_revoke_certificate', 'staff_save_certificate',
      'staff_save_round_timer', 'staff_set_break_kind', 'staff_set_event_format',
      'staff_set_event_visibility', 'staff_set_table_plan'
    )
    and p.prosrc not like '%write_audit_log%';

  if v_silent is not null then
    raise exception 'still writing no audit entry: %', v_silent;
  end if;
  raise notice 'every mutating staff function now writes an audit entry';
end $$;
