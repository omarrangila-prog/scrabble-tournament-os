-- A settings patch with a key nobody recognises reported success and changed nothing.
--
-- `staff_set_event_settings` reads each flag out of the patch by name and coalesces to the
-- current value, so an unrecognised key falls through every branch. The row's `updated_by`
-- and `updated_at` still change, the audit entry is still written, and the function still
-- returns the settings — so the call looks like it worked from every angle except the one
-- that matters.
--
-- Found the hard way, turning an event staff-operated with snake_case keys instead of the
-- camelCase the function expects:
--
--     staff_set_event_settings(..., '{"self_checkin_enabled": false}', ...)
--     -> applied: t
--     -> self_checkin_enabled: still true
--
-- Nothing in the result said otherwise. Sent from a script at the start of an event, that is
-- a director believing players cannot enter scores while they still can — the exact shape of
-- failure this system has spent its time removing.
--
-- An unknown key is now an error naming the key and what was expected. Silence about a
-- request that was not carried out is worse than a refusal, because only the refusal can be
-- acted on.

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
  v_unknown text;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Settings must be given as a JSON object';
  end if;

  /* Every key must be one this function acts on. A typo is a request that was not carried
     out, and the caller has to hear about it. */
  select string_agg(k, ', ' order by k) into v_unknown
  from jsonb_object_keys(p_patch) as k
  where k not in (
    'qrEnabled', 'selfCheckinEnabled', 'playerScoreEntryEnabled',
    'opponentConfirmationEnabled', 'certificatesEnabled', 'emailEnabled',
    'whatsappEnabled', 'firstSecondEnabled'
  );

  if v_unknown is not null then
    raise exception
      'Unknown setting(s): %. Expected any of qrEnabled, selfCheckinEnabled, playerScoreEntryEnabled, opponentConfirmationEnabled, certificatesEnabled, emailEnabled, whatsappEnabled, firstSecondEnabled.',
      v_unknown;
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

do $$
begin
  raise notice 'a settings patch with an unrecognised key is now refused, not ignored';
end $$;
