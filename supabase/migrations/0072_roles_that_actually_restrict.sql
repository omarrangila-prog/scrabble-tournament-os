-- Roles that actually restrict what somebody can do.
--
-- Every staff RPC in this database guarded on `is_staff('org-federation')`, which is true for
-- anybody on the staff list whatever their role. The check-in volunteer at the door could
-- publish a round, clear a round, record a score, or change the event's settings. Nothing
-- hid those buttons from them either, but hiding buttons was never the protection — the
-- database was letting the calls through.
--
-- Four capabilities, named after the two screens the event is actually run from:
--
--   desk      arrivals, walk-ins, payments at the door
--   results   pairings, tables, rounds, scores
--   director  everything, including configuration
--   viewer    reads only — the TV
--
-- A director satisfies every capability, because a director doing the desk's job at 9am is
-- normal and being refused would be absurd.
--
-- The three older role names stay valid and keep working. `checkin` has always meant the
-- desk and `scorekeeper` has always meant the results table, so they map onto the new
-- capabilities rather than being renamed — renaming would rewrite live rows to buy nothing.

alter table public.staff drop constraint if exists staff_role_check;

alter table public.staff add constraint staff_role_check check (
  role in (
    /* Current vocabulary. */
    'director', 'results', 'desk', 'viewer',
    /* Kept working: the same two jobs under their older names. */
    'scorekeeper', 'checkin', 'arbiter'
  )
);

comment on column public.staff.role is
  'director = everything; results = pairings/rounds/scores; desk = arrivals/payments; viewer = read-only. scorekeeper/checkin/arbiter are the older names for results/desk/results.';

-- ---------------------------------------------------------------------------

create or replace function public.staff_role(org text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.staff
  where user_id = auth.uid() and organization_id = org;
$$;

revoke all on function public.staff_role(text) from public, anon;
grant execute on function public.staff_role(text) to authenticated;

/* The desk: arrivals, walk-ins and money taken at the door. */
create or replace function public.can_desk(org text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.staff_role(org) in ('director', 'desk', 'checkin');
$$;

revoke all on function public.can_desk(text) from public, anon;
grant execute on function public.can_desk(text) to authenticated;

/* The results table: pairings, tables, the clock and every score. */
create or replace function public.can_results(org text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.staff_role(org) in ('director', 'results', 'scorekeeper', 'arbiter');
$$;

revoke all on function public.can_results(text) from public, anon;
grant execute on function public.can_results(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The guards themselves. Each function below is the live definition with its `is_staff`
-- check swapped for the capability it needs, and nothing else touched. They were generated
-- from `pg_get_functiondef` rather than retyped, because rewriting a body from memory is how
-- a migration silently drops a feature.

-- ---------------------------------------------------------------------------
-- Desk
-- ---------------------------------------------------------------------------

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
  if not public.can_desk('org-federation') then
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

CREATE OR REPLACE FUNCTION public.staff_check_in(p_record_id uuid, p_override_reason text DEFAULT NULL::text)
 RETURNS TABLE(out_checked_in_at timestamp with time zone, out_already boolean, out_blocked_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_existing timestamptz;
  v_org text;
  v_event text;
  v_payment text;
  v_ok boolean;
  v_reason text;
  v_needs_director boolean;
  v_reason_given boolean;
begin
  if not public.can_desk('org-federation') then
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

  select out_eligible, out_reason, out_requires_director
  into v_ok, v_reason, v_needs_director
  from public.check_in_eligibility(v_event, p_record_id, 'staff');

  v_reason_given := coalesce(btrim(coalesce(p_override_reason, '')), '') <> '';

  if not v_ok then
    if not v_reason_given then
      return query select null::timestamptz, false, v_reason;
      return;
    end if;

    /*
     * A reason is enough for a payment still being checked. It is not enough for one the
     * organiser has already judged invalid, refunded or duplicated — that is money, and it
     * is the director's call.
     */
    if v_needs_director and not public.is_director(v_org) then
      return query select null::timestamptz, false,
        'Only the tournament director can check in a player with this payment status.';
      return;
    end if;
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
      when not v_ok then
        jsonb_build_object('recordId', p_record_id, 'paymentOverride', v_payment,
                           'overrideReason', p_override_reason, 'blocked', v_reason)
      else jsonb_build_object('recordId', p_record_id)
    end
  );

  return query select v_existing, false, null::text;
end $function$;

CREATE OR REPLACE FUNCTION public.staff_decide_payment(p_record_id uuid, p_status text, p_by text, p_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org text;
  v_event text;
  v_previous text;
begin
  if not public.can_desk('org-federation') then
    return false;
  end if;

  if p_status not in ('verified', 'rejected', 'complimentary', 'refunded', 'receipt-uploaded') then
    raise exception 'Unknown payment status %', p_status;
  end if;

  if coalesce(trim(p_by), '') = '' then
    raise exception 'A reviewer is required';
  end if;

  select organization_id, event_id, data ->> 'paymentStatus'
    into v_org, v_event, v_previous
  from public.records where id = p_record_id and collection = 'registrations';

  update public.records
  set data = data
             || jsonb_build_object(
                  'paymentStatus', p_status,
                  'verifiedBy', p_by,
                  'verifiedAt', now(),
                  'paymentNote', coalesce(p_note, '')
                ),
      updated_at = now()
  where id = p_record_id
    and collection = 'registrations';

  perform public.write_audit_log(
    v_org, v_event, p_by, 'decide-payment',
    jsonb_build_object('recordId', p_record_id, 'before', v_previous, 'after', p_status, 'note', p_note)
  );

  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.staff_undo_check_in(p_record_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org text;
  v_event text;
  v_was timestamptz;
begin
  if not public.can_desk('org-federation') then
    return false;
  end if;

  select organization_id, event_id, checked_in_at into v_org, v_event, v_was
  from public.records where id = p_record_id and collection = 'registrations';

  update public.records
  set checked_in_at = null,
      check_in_method = null,
      updated_at = now()
  where id = p_record_id and collection = 'registrations';

  if v_was is not null then
    perform public.write_audit_log(
      v_org, v_event, coalesce(public.current_staff_email(), 'unknown'), 'undo-check-in',
      jsonb_build_object('recordId', p_record_id, 'wasCheckedInAt', v_was)
    );
  end if;

  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.verify_payment(p_record_id uuid, p_by text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_desk('org-federation') then
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
end $function$;


-- ---------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.staff_add_late_player(p_event_id text, p_registration_id uuid, p_by text DEFAULT NULL::text)
 RETURNS TABLE(out_from_round integer, out_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org text;
  v_published integer;
  v_from integer;
  v_rec public.records;
  v_existing integer;
  v_actor text;
  v_locked boolean;
begin
  if not public.can_results('org-federation') then
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
end $function$;

CREATE OR REPLACE FUNCTION public.staff_clear_result(p_game_id uuid, p_by text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game public.games;
  v_org text;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'No such game';
  end if;

  update public.games
  set score_a = null,
      score_b = null,
      status = 'scheduled',
      verified_by = null,
      verified_at = null
  where id = p_game_id;

  select organization_id into v_org from public.events where id = v_game.event_id;
  perform public.write_audit_log(
    v_org, v_game.event_id, coalesce(nullif(trim(p_by), ''), public.current_staff_email(), 'unknown'), 'reopen-result',
    jsonb_build_object(
      'gameId', p_game_id, 'round', v_game.round, 'board', v_game.board,
      'before', jsonb_build_object('scoreA', v_game.score_a, 'scoreB', v_game.score_b, 'status', v_game.status)
    )
  );

  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.staff_clear_round(p_event_id text, p_round integer, p_by text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_removed integer;
  v_org text;
  v_boards jsonb;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;

  select jsonb_agg(jsonb_build_object(
    'board', board, 'division', division, 'playerA', player_a, 'playerB', player_b,
    'scoreA', score_a, 'scoreB', score_b, 'status', status
  )) into v_boards
  from public.games where event_id = p_event_id and round = p_round;

  delete from public.games where event_id = p_event_id and round = p_round;
  get diagnostics v_removed = row_count;

  if v_removed > 0 then
    perform public.write_audit_log(
      v_org, p_event_id, coalesce(nullif(trim(p_by), ''), 'unknown'), 'clear-round',
      jsonb_build_object('round', p_round, 'removed', v_removed, 'boards', v_boards)
    );
  end if;

  return v_removed;
end $function$;

CREATE OR REPLACE FUNCTION public.staff_flag_result(p_game_id uuid, p_by text, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game public.games;
  v_org text;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  if coalesce(trim(p_by), '') = '' then
    raise exception 'The person raising it is required';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'No such game';
  end if;

  if v_game.score_a is null then
    raise exception 'That board has no score to dispute yet';
  end if;

  if v_game.status = 'disputed' then
    return 'already-disputed';
  end if;

  update public.games
  set status = 'disputed',
      note = 'Flagged by ' || trim(p_by) || ': ' || trim(p_reason)
  where id = p_game_id;

  select organization_id into v_org from public.events where id = v_game.event_id;
  perform public.write_audit_log(
    v_org, v_game.event_id, p_by, 'flag-result',
    jsonb_build_object('gameId', p_game_id, 'round', v_game.round, 'board', v_game.board, 'reason', p_reason, 'previousNote', v_game.note)
  );

  return 'disputed';
end $function$;

CREATE OR REPLACE FUNCTION public.staff_lock_active_players(p_event_id text, p_by text)
 RETURNS TABLE(out_locked_count integer, out_already_published boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org text;
  v_ids uuid[];
  v_published boolean;
  v_actor text;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  v_actor := coalesce(nullif(btrim(coalesce(p_by, '')), ''), 'unknown');

  -- Once a round exists, the roster this tournament is running on is a fact of what has
  -- already been played, not something a second lock should quietly change underneath it.
  -- A player who arrives after this point is a late arrival, handled on its own terms.
  select exists(select 1 from public.games where event_id = p_event_id) into v_published;
  if v_published then
    return query select 0, true;
    return;
  end if;

  select array_agg(id) into v_ids
  from public.records
  where event_id = p_event_id
    and collection = 'registrations'
    and status = 'active'
    and checked_in_at is not null;

  /*
   * The snapshot. Replaced wholesale on a re-lock, which can only happen before any round
   * exists — after that the guard above has already returned.
   */
  delete from public.roster_entries where event_id = p_event_id;

  insert into public.roster_entries (
    organization_id, event_id, player_id, player_number, full_name, division,
    division_stated, checked_in_at, active_from_round, locked_by
  )
  select
    v_org,
    p_event_id,
    r.id,
    nullif(btrim(coalesce(r.data ->> 'playerNumber', '')), ''),
    coalesce(nullif(btrim(coalesce(r.data ->> 'fullName', '')), ''), 'Unnamed player'),
    public.division_for(public.stated_division(r.data)),
    public.stated_division(r.data) is not null,
    r.checked_in_at,
    1,
    v_actor
  from public.records r
  where r.event_id = p_event_id
    and r.collection = 'registrations'
    and r.status = 'active'
    and r.checked_in_at is not null;

  /* Still written, and still what publishing reads. The snapshot is proven before it is
     trusted, and the array goes when the readers move. */
  update public.events
  set data = data || jsonb_build_object(
        'activePlayerIds', coalesce(to_jsonb(v_ids), '[]'::jsonb),
        'activePlayersLockedAt', now(),
        'activePlayersLockedBy', v_actor
      )
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, v_actor, 'lock-active-players',
    jsonb_build_object(
      'count', coalesce(array_length(v_ids, 1), 0),
      /* What the lock actually captured, so the audit answers the division question too. */
      'byDivision', (
        select jsonb_object_agg(division, n)
        from (
          select division, count(*) as n
          from public.roster_entries
          where event_id = p_event_id
          group by division
        ) d
      ),
      'withoutStatedCategory', (
        select count(*) from public.roster_entries
        where event_id = p_event_id and not division_stated
      ))
  );

  return query select coalesce(array_length(v_ids, 1), 0), false;
end $function$;

CREATE OR REPLACE FUNCTION public.staff_publish_round(p_event_id text, p_round integer, p_boards jsonb, p_by text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org text;
  v_played integer;
  v_count integer;
  v_unfinished integer;
  v_active uuid[];
  v_plan_players uuid[];
  v_stray integer;
  v_duplicate integer;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  if jsonb_typeof(p_boards) <> 'array' then
    raise exception 'Boards must be a JSON array';
  end if;

  select count(*) into v_played
  from public.games
  where event_id = p_event_id
    and round = p_round
    and (score_a is not null or score_b is not null);

  if v_played > 0 then
    raise exception
      'Round % already has % result(s). Clear them before re-pairing.', p_round, v_played;
  end if;

  if p_round > 1 then
    /*
     * A bye is not an unfinished board. It has no opponent, never receives a score, and
     * keeps the status it was published with for the life of the tournament — so counting
     * it here meant that any round with an odd number of players blocked the next one
     * forever. An event where people arrive late is exactly an event with odd counts, which
     * is how this stayed hidden: it only bites when somebody walks in.
     */
    select count(*) into v_unfinished
    from public.games
    where event_id = p_event_id
      and round = p_round - 1
      and player_b is not null
      and status <> 'verified';

    if v_unfinished > 0 then
      raise exception
        'Round % still has % board(s) not verified. Resolve them before publishing round %.',
        p_round - 1, v_unfinished, p_round;
    end if;
  end if;

  select array_agg(distinct x.id) into v_plan_players
  from (
    select (b ->> 'playerA')::uuid as id from jsonb_array_elements(p_boards) as b
    union all
    select nullif(b ->> 'playerB', '')::uuid from jsonb_array_elements(p_boards) as b
  ) as x
  where x.id is not null;

  select count(*) into v_duplicate
  from (
    select x.id
    from (
      select (b ->> 'playerA')::uuid as id from jsonb_array_elements(p_boards) as b
      union all
      select nullif(b ->> 'playerB', '')::uuid from jsonb_array_elements(p_boards) as b
    ) as x
    where x.id is not null
    group by x.id
    having count(*) > 1
  ) as dupes;

  if v_duplicate > 0 then
    raise exception 'Round % pairs the same player onto more than one board.', p_round;
  end if;

  /*
   * Eligibility is now asked per round rather than once for the tournament. A player who
   * arrived at round three is not on the round-one roster and never will be; a player who
   * withdrew after round two must not appear in round three. One flat list cannot say
   * either, which is why people arriving late had no route in at all.
   */
  v_active := public.staff_eligible_player_ids(p_event_id, p_round);
  if v_active is not null then
    select count(*) into v_stray
    from unnest(v_plan_players) as p
    where not (p = any(v_active));

    if v_stray > 0 then
      raise exception
        '% player(s) in round % are not eligible to play it.', v_stray, p_round;
    end if;
  end if;

  /*
   * Two players on one board must be in the same category.
   *
   * Enforced here and not only in the browser. The engine has always paired within a
   * category and has never produced a round this refuses — which is exactly why it costs
   * nothing to insist. What it stops is everything that does not come from the engine: a
   * hand-built round, a stale second tab, a swap made against an older roster. A tester
   * reported categories mixed together and was looking at a screen that never named them;
   * this makes the claim impossible rather than merely unfounded.
   */
  if exists (
    select 1
    from jsonb_array_elements(p_boards) as b
    join public.records ra on ra.id = (b ->> 'playerA')::uuid
    join public.records rb on rb.id = nullif(b ->> 'playerB', '')::uuid
    where public.division_for(public.stated_division(ra.data))
       <> public.division_for(public.stated_division(rb.data))
  ) then
    raise exception 'A board pairs two different categories. Categories play separately.';
  end if;

  if p_round > 1 then
    perform public.staff_snapshot_round(p_event_id, p_round - 1, coalesce(p_by, 'system'));
  end if;

  delete from public.games where event_id = p_event_id and round = p_round;

  insert into public.games (
    organization_id, event_id, round, board, division, player_a, player_b, a_plays_first,
    pairing_reason
  )
  select
    v_org,
    p_event_id,
    p_round,
    (b ->> 'board')::integer,
    b ->> 'division',
    (b ->> 'playerA')::uuid,
    nullif(b ->> 'playerB', '')::uuid,
    -- Absent on a bye (no opponent to go before) and on any plan built before this field
    -- existed — `(b ->> 'aPlaysFirst')::boolean` is null either way, which the column allows.
    (b ->> 'aPlaysFirst')::boolean,
    -- Absent on any plan built before this column existed, which is null and shows nothing.
    nullif(btrim(coalesce(b ->> 'reason', '')), '')
  from jsonb_array_elements(p_boards) as b;

  select count(*) into v_count
  from public.games where event_id = p_event_id and round = p_round;

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(trim(p_by), ''), 'unknown'), 'publish-round',
    jsonb_build_object(
      'round', p_round,
      'boards', v_count,
      /* Per category, so the audit answers "how many beginners played round three". */
      'byDivision', (
        select jsonb_object_agg(division, n)
        from (
          select division, count(*) as n
          from public.games
          where event_id = p_event_id and round = p_round
          group by division
        ) d
      ))
  );

  return v_count;
end $function$;

CREATE OR REPLACE FUNCTION public.staff_record_result(p_game_id uuid, p_score_a integer, p_score_b integer, p_by text, p_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game public.games;
  v_org text;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  if coalesce(trim(p_by), '') = '' then
    raise exception 'The person entering the score is required';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'No such game';
  end if;

  if p_score_a is null then
    raise exception 'A score is required';
  end if;

  if v_game.player_b is null then
    if p_score_b is not null then
      raise exception 'A bye has no opponent score';
    end if;
  elsif p_score_b is null then
    raise exception 'Both scores are required';
  end if;

  update public.games
  set score_a = p_score_a,
      score_b = p_score_b,
      status = 'verified',
      verified_by = p_by,
      verified_at = now(),
      note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_game_id;

  select organization_id into v_org from public.events where id = v_game.event_id;
  perform public.write_audit_log(
    v_org, v_game.event_id, p_by,
    case when v_game.score_a is not null then 'correct-result' else 'record-result' end,
    jsonb_build_object(
      'gameId', p_game_id, 'round', v_game.round, 'board', v_game.board,
      'before', jsonb_build_object('scoreA', v_game.score_a, 'scoreB', v_game.score_b, 'status', v_game.status, 'verifiedBy', v_game.verified_by, 'note', v_game.note),
      'after', jsonb_build_object('scoreA', p_score_a, 'scoreB', p_score_b, 'note', p_note)
    )
  );

  return true;
end $function$;

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
  if not public.can_results('org-federation') then
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

  if not public.can_results(v_org) then
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

  if not public.can_results(v_org) then
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

CREATE OR REPLACE FUNCTION public.staff_snapshot_round(p_event_id text, p_round integer, p_by text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org text;
  v_pairings jsonb;
  v_standings jsonb;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  -- Already snapshotted: do nothing rather than overwrite with a value that may have been
  -- affected by a correction made after the fact. The whole point of a snapshot is that it
  -- does not move.
  if exists (
    select 1 from public.round_snapshots
    where event_id = p_event_id and round = p_round and kind = 'pairings'
  ) then
    return;
  end if;

  select jsonb_agg(jsonb_build_object(
    'board', g.board, 'division', g.division,
    'playerA', ra.data ->> 'fullName', 'playerB',
    case when g.player_b is null then null else rb.data ->> 'fullName' end,
    'scoreA', g.score_a, 'scoreB', g.score_b, 'status', g.status
  ) order by g.board)
  into v_pairings
  from public.games g
  join public.records ra on ra.id = g.player_a
  left join public.records rb on rb.id = g.player_b
  where g.event_id = p_event_id and g.round = p_round;

  if v_pairings is null then
    -- Nothing was ever published for this round; nothing to preserve.
    return;
  end if;

  insert into public.round_snapshots (organization_id, event_id, round, kind, payload, created_by)
  values (v_org, p_event_id, p_round, 'pairings', v_pairings, coalesce(nullif(trim(p_by), ''), 'system'));

  select jsonb_agg(row_to_json(s)) into v_standings from public.event_standings(p_event_id) as s;

  insert into public.round_snapshots (organization_id, event_id, round, kind, payload, created_by)
  values (v_org, p_event_id, p_round, 'standings', coalesce(v_standings, '[]'::jsonb), coalesce(nullif(trim(p_by), ''), 'system'));

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(trim(p_by), ''), 'system'), 'snapshot-round',
    jsonb_build_object('round', p_round)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.staff_withdraw_player(p_event_id text, p_player_id uuid, p_immediately boolean DEFAULT false, p_by text DEFAULT NULL::text)
 RETURNS TABLE(out_after_round integer, out_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org text;
  v_current integer;
  v_after integer;
  v_board integer;
  v_actor text;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  v_actor := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'unknown');

  select coalesce(max(round), 0) into v_current from public.games where event_id = p_event_id;

  /*
   * Leaving immediately means not playing the round now on the wall. That round is
   * published, so somebody is sitting opposite them — the software must not quietly
   * regenerate a round the room has already read. It names the board and stops, and the
   * director settles it as a concession or a forfeit.
   */
  if p_immediately and v_current > 0 then
    select board into v_board
    from public.games
    where event_id = p_event_id and round = v_current
      and (player_a = p_player_id or player_b = p_player_id)
      and score_a is null
      and player_b is not null;

    if v_board is not null then
      return query select null::integer,
        format('They are on board %s of round %s, unplayed. Record that result first — a concession or a forfeit — then withdraw them.',
               v_board, v_current);
      return;
    end if;
  end if;

  /*
   * Every round they actually played is theirs, whichever option was chosen. This used to
   * subtract one for an immediate withdrawal, which erased a round already on the wall with
   * their score in it — the round they had just finished playing.
   */
  v_after := v_current;

  update public.roster_entries
  set withdrawn_after_round = v_after
  where event_id = p_event_id and player_id = p_player_id;

  if not found then
    return query select null::integer, 'That player is not on this event''s roster.';
    return;
  end if;

  update public.events
  set data = data || jsonb_build_object(
        'activePlayerIds',
        coalesce((
          select jsonb_agg(x) from jsonb_array_elements_text(coalesce(data -> 'activePlayerIds', '[]'::jsonb)) as t(x)
          where x <> p_player_id::text
        ), '[]'::jsonb)
      ),
      updated_at = now()
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, v_actor, 'withdraw-player',
    jsonb_build_object('playerId', p_player_id, 'afterRound', v_after, 'immediate', p_immediately)
  );

  return query select v_after,
    case
      when v_after = 0 then 'Withdrawn before playing any round.'
      else format('Withdrawn. They keep rounds 1 to %s and are not paired after that.', v_after)
    end;
end $function$;

CREATE OR REPLACE FUNCTION public.transition_event_state(p_event_id text, p_target text, p_by text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_force boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org text;
  v_current text;
  v_legal boolean;
  v_precondition text;
  v_failure text;
  v_actor text;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id, state into v_org, v_current
  from public.events where id = p_event_id
  for update;

  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  v_actor := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'unknown');

  /* Asking for the state it is already in is not an error, and not a transition. */
  if v_current = p_target then
    return v_current;
  end if;

  if p_force then
    /*
     * The escape hatch. Only a director, only with a reason, and always on the record —
     * an override nobody can see afterwards is indistinguishable from a bug.
     */
    if not public.is_director(v_org) then
      raise exception 'Only the tournament director may force a state change';
    end if;
    if coalesce(btrim(coalesce(p_reason, '')), '') = '' then
      raise exception 'Forcing a state change needs a reason';
    end if;
  else
    select true, t.precondition into v_legal, v_precondition
    from public.event_state_transitions t
    where t.from_state = v_current and t.to_state = p_target;

    if not coalesce(v_legal, false) then
      raise exception 'An event cannot go from % to %.', v_current, p_target;
    end if;

    v_failure := public.event_precondition_failure(p_event_id, v_precondition);
    if v_failure is not null then
      raise exception '%', v_failure;
    end if;
  end if;

  update public.events
  set state = p_target, updated_at = now()
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, v_actor, 'set-event-state',
    jsonb_build_object(
      'before', v_current,
      'after', p_target,
      'forced', p_force,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )
  );

  return p_target;
end $function$;


-- ---------------------------------------------------------------------------
-- Desk or Results
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.staff_set_division(p_record_id uuid, p_division text, p_by text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event text;
  v_org text;
  v_before text;
begin
  if not (public.can_desk('org-federation') or public.can_results('org-federation')) then
    raise exception 'Not authorised';
  end if;

  select event_id, coalesce(data ->> 'confirmedDivision', data ->> 'preferredDivision')
  into v_event, v_before
  from public.records
  where id = p_record_id and collection = 'registrations';

  if v_event is null then
    raise exception 'No such registration';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(public.event_categories(v_event)) as c
    where c ->> 'id' = p_division
  ) then
    raise exception 'This event has no category %', p_division;
  end if;

  update public.records
  set data = data
             || jsonb_build_object(
                  'preferredDivision', p_division,
                  'confirmedDivision', p_division,
                  'divisionSetBy', coalesce(nullif(btrim(p_by), ''), 'Desk'),
                  'divisionSetAt', now()
                ),
      updated_at = now()
  where id = p_record_id;

  select organization_id into v_org from public.events where id = v_event;
  perform public.write_audit_log(
    v_org, v_event, coalesce(nullif(btrim(p_by), ''), 'Desk'), 'set-division',
    jsonb_build_object('registration', p_record_id, 'before', v_before, 'after', p_division)
  );

  return true;
end $function$;


-- ---------------------------------------------------------------------------
-- Director only
-- ---------------------------------------------------------------------------

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
  if not public.is_director('org-federation') then
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

CREATE OR REPLACE FUNCTION public.staff_issue_certificate(p_code text, p_by text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
begin
  if not public.is_director('org-federation') then
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

CREATE OR REPLACE FUNCTION public.staff_mark_confirmation_sent(p_event_id text, p_number text, p_channel text, p_ok boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_director('org-federation') then
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

CREATE OR REPLACE FUNCTION public.staff_revoke_certificate(p_code text, p_by text, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_director('org-federation') then
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
  if not public.is_director('org-federation') then
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

CREATE OR REPLACE FUNCTION public.staff_set_event_categories(p_event_id text, p_categories jsonb, p_by text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org text;
  v_before jsonb;
  v_count integer;
  v_ids text[];
begin
  if not public.is_director('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id, data -> 'categories' into v_org, v_before
  from public.events where id = p_event_id;

  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  if jsonb_typeof(p_categories) <> 'array' then
    raise exception 'Categories must be a JSON array';
  end if;

  select count(*) into v_count from jsonb_array_elements(p_categories);
  if v_count < 1 then
    raise exception 'A tournament needs at least one category';
  end if;

  -- Every entry needs an id and a name; a category with neither cannot be shown or paired.
  if exists (
    select 1 from jsonb_array_elements(p_categories) as c
    where coalesce(btrim(c ->> 'id'), '') = '' or coalesce(btrim(c ->> 'name'), '') = ''
  ) then
    raise exception 'Every category needs an id and a name';
  end if;

  -- Two categories sharing an id would silently merge two fields into one on every screen.
  select array_agg(c ->> 'id') into v_ids from jsonb_array_elements(p_categories) as c;
  if array_length(v_ids, 1) <> cardinality(array(select distinct unnest(v_ids))) then
    raise exception 'Two categories share the same id';
  end if;

  /*
   * A category somebody is already entered in cannot be removed: their registration would
   * point at a category that no longer exists, and they would vanish from every roster and
   * pairing screen that groups by it. Rename it instead, which keeps the id and moves nobody.
   */
  if exists (
    select 1
    from public.records r
    where r.event_id = p_event_id
      and r.collection = 'registrations'
      and r.status = 'active'
      and coalesce(r.data ->> 'confirmedDivision', r.data ->> 'preferredDivision') is not null
      and coalesce(r.data ->> 'confirmedDivision', r.data ->> 'preferredDivision') <> all(v_ids)
  ) then
    raise exception
      'Somebody is entered in a category this list removes. Move them first, or rename the category instead of deleting it.';
  end if;

  update public.events
  set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('categories', p_categories),
      updated_at = now()
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(btrim(p_by), ''), 'unknown'), 'set-event-categories',
    jsonb_build_object('before', v_before, 'after', p_categories)
  );

  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.staff_set_event_details(p_event_id text, p_name text, p_subtitle text, p_details jsonb, p_by text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org text;
  v_before jsonb;
begin
  if not public.is_director('org-federation') then
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
end $function$;

CREATE OR REPLACE FUNCTION public.staff_set_event_format(p_event_id text, p_rounds integer, p_round_minutes integer, p_pairing_system text DEFAULT 'swiss'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_director('org-federation') then
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

CREATE OR REPLACE FUNCTION public.staff_set_event_settings(p_event_id text, p_patch jsonb, p_by text)
 RETURNS event_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org text;
  v_before public.event_settings;
  v_after public.event_settings;
  v_unknown text;
begin
  if not public.is_director('org-federation') then
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
end $function$;

CREATE OR REPLACE FUNCTION public.staff_set_event_visibility(p_event_id text, p_visibility text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_visibility text;
begin
  if not public.is_director('org-federation') then
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

CREATE OR REPLACE FUNCTION public.staff_set_pairing_rules(p_event_id text, p_rules jsonb, p_by text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org text;
  v_before jsonb;
  v_byes integer;
begin
  if not public.is_director('org-federation') then
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
end $function$;
