-- Asking each participant to check their own details, before the day.
--
-- Everything here is keyed on the token a registration already carries — the same one behind
-- a personal check-in link. No account, no password, and no database id in a URL.
--
-- The rule that shapes all of it: several children share a parent's email and phone, and they
-- are separate players. Nothing merges them. What is grouped is the *message*, so one parent
-- gets one email listing three cards rather than three near-identical emails.

/**
 * Everybody reachable at the same contact as the holder of this token.
 *
 * Grouped by email or mobile, because a family shares one or both. Only ever the group the
 * token belongs to — a token is the key to one household's own details and nothing else.
 *
 * Contact details are returned because they are the details being checked; this is the
 * person's own record, shown back to them.
 */
create or replace function public.confirmation_group_by_token(p_event_id text, p_token text)
returns table (
  out_number text,
  out_name text,
  out_age text,
  out_mobile text,
  out_email text,
  out_area text,
  out_division text,
  out_psa text,
  out_media_consent text,
  out_amount numeric,
  out_payment_status text,
  out_payment_method text,
  out_confirmed_at timestamptz,
  out_correction text,
  out_is_you boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me public.records;
  v_email text;
  v_mobile text;
begin
  select * into v_me
  from public.records
  where collection = 'registrations'
    and event_id = p_event_id
    and status = 'active'
    and data ->> 'token' = btrim(p_token)
  limit 1;

  if not found then
    return;
  end if;

  v_email := lower(btrim(coalesce(v_me.data ->> 'email', '')));
  v_mobile := regexp_replace(coalesce(v_me.data ->> 'mobile', ''), '\D', '', 'g');

  return query
  select
    r.data ->> 'playerNumber',
    btrim(r.data ->> 'fullName'),
    coalesce(r.data -> 'import' ->> 'ageAsSupplied', r.data -> 'import' ->> 'age', ''),
    coalesce(r.data ->> 'mobile', ''),
    coalesce(r.data ->> 'email', ''),
    btrim(concat_ws(', ', nullif(r.data ->> 'city', ''), nullif(r.data -> 'answers' ->> 'area', ''))),
    coalesce(r.data ->> 'preferredDivision', ''),
    coalesce(r.data -> 'import' ->> 'playsPSARankingTournaments', ''),
    coalesce(r.data -> 'import' ->> 'mediaConsent', ''),
    (r.data ->> 'amountDue')::numeric,
    coalesce(r.data ->> 'paymentStatus', ''),
    coalesce(r.data ->> 'paymentMethod', ''),
    (r.data ->> 'detailsConfirmedAt')::timestamptz,
    coalesce(r.data ->> 'correctionRequestDetails', ''),
    r.id = v_me.id
  from public.records r
  where r.collection = 'registrations'
    and r.event_id = p_event_id
    and r.status = 'active'
    and (
      (v_email <> '' and lower(btrim(coalesce(r.data ->> 'email', ''))) = v_email)
      or (v_mobile <> '' and regexp_replace(coalesce(r.data ->> 'mobile', ''), '\D', '', 'g') = v_mobile)
    )
  order by (r.data ->> 'playerNumber')::int;
end $$;

revoke all on function public.confirmation_group_by_token(text, text) from public;
grant execute on function public.confirmation_group_by_token(text, text) to anon, authenticated;

/**
 * "These details are right."
 *
 * Only for a player in the token's own contact group, so a parent can confirm all three of
 * their children and nobody else's. Changes nothing about the registration except recording
 * that it was checked — a confirmation is a statement about the data, not a change to it.
 */
create or replace function public.confirm_details_by_token(
  p_event_id text,
  p_token text,
  p_number text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.confirmation_group_by_token(p_event_id, p_token) g
    where g.out_number = btrim(p_number)
  ) then
    return 'not-found';
  end if;

  update public.records
  set data = data || jsonb_build_object(
        'detailsConfirmationStatus', 'confirmed',
        'detailsConfirmedAt', now()
      ) - 'correctionRequested' - 'correctionRequestDetails',
      updated_at = now()
  where collection = 'registrations'
    and event_id = p_event_id
    and status = 'active'
    and data ->> 'playerNumber' = btrim(p_number);

  return 'confirmed';
end $$;

revoke all on function public.confirm_details_by_token(text, text, text) from public;
grant execute on function public.confirm_details_by_token(text, text, text) to anon, authenticated;

/**
 * "Something here is wrong."
 *
 * Recorded for a person to look at. Nothing is overwritten: a correction typed on a phone is
 * a claim about the record, and the organizer decides what the record says.
 */
create or replace function public.request_correction_by_token(
  p_event_id text,
  p_token text,
  p_number text,
  p_field text,
  p_detail text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.confirmation_group_by_token(p_event_id, p_token) g
    where g.out_number = btrim(p_number)
  ) then
    return 'not-found';
  end if;

  if coalesce(btrim(p_detail), '') = '' then
    return 'empty';
  end if;

  update public.records
  set data = data || jsonb_build_object(
        'detailsConfirmationStatus', 'correction-requested',
        'correctionRequested', true,
        'correctionRequestField', left(btrim(p_field), 40),
        'correctionRequestDetails', left(btrim(p_detail), 600),
        'correctionRequestedAt', now()
      ),
      updated_at = now()
  where collection = 'registrations'
    and event_id = p_event_id
    and status = 'active'
    and data ->> 'playerNumber' = btrim(p_number);

  return 'recorded';
end $$;

revoke all on function public.request_correction_by_token(text, text, text, text, text) from public;
grant execute on function public.request_correction_by_token(text, text, text, text, text) to anon, authenticated;

/**
 * Recording that a confirmation was sent — and by which route.
 *
 * A WhatsApp link that was opened is not a message that arrived, so the organizer's screen
 * says "link opened" rather than "sent" for that route. Staff only.
 */
create or replace function public.staff_mark_confirmation_sent(
  p_event_id text,
  p_number text,
  p_channel text,
  p_ok boolean
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

  return true;
end $$;

revoke all on function public.staff_mark_confirmation_sent(text, text, text, boolean) from public, anon;
grant execute on function public.staff_mark_confirmation_sent(text, text, text, boolean) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.staff_mark_confirmation_sent(text, text, text, boolean)', 'execute') then
    raise exception 'a participant must not be able to mark their own confirmation sent';
  end if;
  raise notice 'details confirmation is in place';
end $$;
