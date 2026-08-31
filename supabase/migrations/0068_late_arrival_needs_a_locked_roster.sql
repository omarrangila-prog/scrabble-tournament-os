-- Adding a late arrival to an event whose roster was never locked locked everybody else out.
--
-- `staff_eligible_player_ids` reads `roster_entries` and, finding nothing, falls back to no
-- restriction — which is how an event that never locks a roster has always worked, and must
-- keep working. But `staff_add_late_player` writes a roster row. Add one person to an event
-- with no lock and the table is no longer empty, so eligibility stops being "no restriction"
-- and becomes "this one person". Publishing then rejects every other player at the event.
--
-- Proved on four checked-in players and no lock:
--
--     eligible before                              no restriction
--     eligible after adding one late arrival       1
--
-- The mistake is in the idea, not the query. "Late" only means anything relative to a lock:
-- with no lock there is no roster to be late for, and everybody checked in is already
-- playing. So the function now says that rather than silently creating a roster of one.
--
-- Found by trying to put a button on this before checking what the button would do to an
-- event run the way most small events are run — without locking anything.

create or replace function public.staff_add_late_player(
  p_event_id text,
  p_registration_id uuid,
  p_by text default null
)
returns table (out_from_round integer, out_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_published integer;
  v_from integer;
  v_rec public.records;
  v_existing integer;
  v_actor text;
  v_locked boolean;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  v_actor := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'unknown');

  /*
   * No lock, no roster to be late for. Writing a row here would turn "everybody checked in
   * is playing" into "this one person is playing", and publishing would then refuse the
   * rest of the room.
   */
  select exists(select 1 from public.roster_entries where event_id = p_event_id) into v_locked;
  if not v_locked then
    return query select null::integer,
      'The roster has not been locked yet, so everybody checked in is already playing. Lock it when the room has settled.';
    return;
  end if;

  select * into v_rec
  from public.records
  where id = p_registration_id and event_id = p_event_id
    and collection = 'registrations' and status = 'active';

  if not found then
    return query select null::integer, 'That registration is not on this event.';
    return;
  end if;

  if v_rec.checked_in_at is null then
    return query select null::integer, 'Check this player in first, then add them to the round.';
    return;
  end if;

  select active_from_round into v_existing
  from public.roster_entries
  where event_id = p_event_id and player_id = p_registration_id;

  if v_existing is not null then
    return query select v_existing,
      format('Already on the roster, playing from round %s.', v_existing);
    return;
  end if;

  /* The first round nobody has been told about yet. */
  select coalesce(max(round), 0) into v_published from public.games where event_id = p_event_id;
  v_from := v_published + 1;

  insert into public.roster_entries (
    organization_id, event_id, player_id, player_number, full_name, division,
    checked_in_at, active_from_round, locked_by
  )
  values (
    v_org, p_event_id, p_registration_id,
    nullif(btrim(coalesce(v_rec.data ->> 'playerNumber', '')), ''),
    coalesce(nullif(btrim(coalesce(v_rec.data ->> 'fullName', '')), ''), 'Unnamed player'),
    coalesce(nullif(btrim(coalesce(v_rec.data ->> 'division', '')), ''), 'open'),
    v_rec.checked_in_at, v_from, v_actor
  );

  update public.events
  set data = data || jsonb_build_object(
        'activePlayerIds',
        coalesce(data -> 'activePlayerIds', '[]'::jsonb) || to_jsonb(p_registration_id::text)
      ),
      updated_at = now()
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, v_actor, 'add-late-player',
    jsonb_build_object(
      'playerId', p_registration_id,
      'name', v_rec.data ->> 'fullName',
      'fromRound', v_from,
      'roundsAlreadyPlayed', v_published
    )
  );

  return query select v_from, format('Added. They play from round %s.', v_from);
end $$;

revoke all on function public.staff_add_late_player(text, uuid, text) from public, anon;
grant execute on function public.staff_add_late_player(text, uuid, text) to authenticated;

do $$
begin
  raise notice 'a late arrival needs a locked roster to be late for';
end $$;
