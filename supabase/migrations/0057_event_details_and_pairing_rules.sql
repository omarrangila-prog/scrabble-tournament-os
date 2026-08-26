-- The event's own details, and the rules it pairs by, become editable.
--
-- Two separate lies, fixed together because they are the same lie.
--
-- The "Tournament" card in Settings offered Name, Organizer, City, Time zone and Total
-- rounds. Name and Total rounds wrote to a Zustand store in the browser that no
-- Supabase-backed screen has read since the app moved to Postgres. Organizer, City and Time
-- zone had no handler attached at all — typing in them did nothing whatsoever, not even to
-- the dead store. The card has looked editable for the whole life of the app and has never
-- changed anything.
--
-- The pairing constraints — whether to avoid repeat opponents, how many byes one player may
-- receive, whether to keep clubmates apart — were constants in a seed file. They are the
-- rules a tournament runs under, they differ between events, and there has never been a way
-- to change them without editing code.
--
-- Both live in `events.data`, beside rounds, round length, pairing system and categories, for
-- the same reason those do: they describe one tournament, not the software.

create or replace function public.staff_set_event_details(
  p_event_id text,
  p_name text,
  p_subtitle text,
  p_details jsonb,
  p_by text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_before jsonb;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id, jsonb_build_object('name', name, 'subtitle', subtitle, 'data', data)
  into v_org, v_before
  from public.events where id = p_event_id;

  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  if coalesce(btrim(p_name), '') = '' then
    raise exception 'An event needs a name';
  end if;

  if jsonb_typeof(p_details) <> 'object' then
    raise exception 'Details must be a JSON object';
  end if;

  /*
   * Merged, not replaced. `data` also carries rounds, round length, pairing system,
   * categories and the break kind — a replace here would silently wipe every one of them,
   * and the director editing a venue name has no reason to expect that.
   */
  update public.events
  set name = btrim(p_name),
      subtitle = nullif(btrim(coalesce(p_subtitle, '')), ''),
      data = coalesce(data, '{}'::jsonb) || p_details,
      updated_at = now()
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(btrim(p_by), ''), 'unknown'), 'set-event-details',
    jsonb_build_object('before', v_before, 'after',
      jsonb_build_object('name', btrim(p_name), 'subtitle', p_subtitle, 'details', p_details))
  );

  return true;
end $$;

revoke all on function public.staff_set_event_details(text, text, text, jsonb, text) from public, anon;
grant execute on function public.staff_set_event_details(text, text, text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The rules a round is paired under.
-- ---------------------------------------------------------------------------

create or replace function public.staff_set_pairing_rules(
  p_event_id text,
  p_rules jsonb,
  p_by text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_before jsonb;
  v_byes integer;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id, data -> 'pairingRules' into v_org, v_before
  from public.events where id = p_event_id;

  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  if jsonb_typeof(p_rules) <> 'object' then
    raise exception 'Pairing rules must be a JSON object';
  end if;

  /*
   * A player who may receive no bye at all cannot be paired in an odd field: the engine has
   * to sit somebody out, and refusing every candidate would strand the round rather than
   * produce one. One is the ordinary limit; zero is not a rule, it is a deadlock.
   */
  v_byes := coalesce((p_rules ->> 'maxByesPerPlayer')::integer, 1);
  if v_byes < 1 or v_byes > 5 then
    raise exception 'A player may receive between 1 and 5 byes, not %', v_byes;
  end if;

  update public.events
  set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('pairingRules', p_rules),
      updated_at = now()
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(btrim(p_by), ''), 'unknown'), 'set-pairing-rules',
    jsonb_build_object('before', v_before, 'after', p_rules)
  );

  return true;
end $$;

revoke all on function public.staff_set_pairing_rules(text, jsonb, text) from public, anon;
grant execute on function public.staff_set_pairing_rules(text, jsonb, text) to authenticated;

/**
 * The rules this event pairs by. Falls back to what the seed file used to hardcode, so an
 * event that has never been given rules behaves exactly as every event did before.
 */
create or replace function public.event_pairing_rules(p_event_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select data -> 'pairingRules' from public.events where id = p_event_id),
    '{"avoidRepeatOpponents":true,"avoidSameClub":true,"maxByesPerPlayer":1}'::jsonb
  );
$$;

revoke all on function public.event_pairing_rules(text) from public;
grant execute on function public.event_pairing_rules(text) to anon, authenticated;

do $$
begin
  if (public.event_pairing_rules('evt-alphabattle-23-august') ->> 'maxByesPerPlayer')::integer <> 1 then
    raise exception 'the fallback pairing rules should match what the seed hardcoded';
  end if;
  raise notice 'event details and pairing rules are editable';
end $$;
