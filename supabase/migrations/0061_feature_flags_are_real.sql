-- The feature flags start meaning something.
--
-- `event_settings` has held real columns with real defaults since migration 0048. Nothing
-- has ever read them where it mattered: not one of the fourteen player-facing functions
-- checked a flag, and not one of the five player-facing routes did either. Turning off
-- self check-in, player score entry, opponent confirmation or QR changed nothing anywhere a
-- player could reach. A director could set this event to be staff-operated, see the toggles
-- move, and still have a player submit an official score from a phone.
--
-- Worse, the defaults ran the other way. `self_checkin_enabled`, `player_score_entry_enabled`
-- and `opponent_confirmation_enabled` all defaulted to true, and `event_public_settings`
-- hardcoded `coalesce(..., true)` on top of that, so an event with no settings row at all —
-- two of the three events in this database — had every player-authority feature on.
--
-- Three things happen here, in this order, so that no existing event changes behaviour:
--
--   1. Every event that has no settings row gets one, holding exactly the values it is
--      running on today. Existing events are frozen as they are, explicitly.
--   2. The column defaults flip, so events created from now on are organizer-run: the desk
--      records the scores, and players play.
--   3. The flags are enforced inside the functions that change tournament truth.
--
-- No new flags are added here, though the specification lists three this schema lacks:
-- `live_display_enabled`, `manual_pairing_enabled` and `ratings_enabled`. Nothing reads any
-- of them yet, and a toggle with nothing behind it is the exact defect this migration exists
-- to remove — adding three more while fixing nine would be an odd way to fix it. They arrive
-- with the features that give them meaning.

-- ---------------------------------------------------------------------------
-- 1. New flags, and a row for every event.
-- ---------------------------------------------------------------------------

/* Nothing added here; the existing nine are what get enforced. */
alter table public.event_settings drop column if exists live_display_enabled;
alter table public.event_settings drop column if exists manual_pairing_enabled;

/*
 * Freeze what is already running. This must happen before the defaults change: an event
 * relying on self check-in tomorrow morning must not find it closed because a default moved
 * underneath it. Every value here is the one that event is running on today.
 */
insert into public.event_settings (
  event_id, qr_enabled, self_checkin_enabled, player_score_entry_enabled,
  opponent_confirmation_enabled, certificates_enabled, email_enabled, whatsapp_enabled,
  first_second_enabled, updated_by
)
select e.id, true, true, true, true, true, true, true, false,
       'migration 0061 — frozen at the values this event was running on'
from public.events e
where not exists (select 1 from public.event_settings s where s.event_id = e.id);

-- ---------------------------------------------------------------------------
-- 2. New events are organizer-run.
-- ---------------------------------------------------------------------------

/*
 * §16: players are read-only by default. Only the defaults move — every existing row keeps
 * the value it has, because ALTER COLUMN SET DEFAULT does not touch rows that exist.
 *
 * `qr_enabled` stays true: QR is a convenience layer that changes nothing about who holds
 * authority, and this venue uses it to help people find a board.
 */
alter table public.event_settings
  alter column self_checkin_enabled set default false,
  alter column player_score_entry_enabled set default false,
  alter column opponent_confirmation_enabled set default false;

-- ---------------------------------------------------------------------------
-- 3. One place that answers "is this on?"
-- ---------------------------------------------------------------------------

/*
 * Every gate below asks this, so there is one answer rather than one per function.
 *
 * A missing settings row falls back to the column's own default rather than a hardcoded
 * true — which is how `event_public_settings` got it wrong. The fallback is read from
 * `information_schema`, so the default lives in exactly one place: the column definition.
 */
create or replace function public.event_flag(p_event_id text, p_flag text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_value boolean;
  v_default text;
begin
  execute format('select %I from public.event_settings where event_id = $1', p_flag)
  into v_value
  using p_event_id;

  if v_value is not null then
    return v_value;
  end if;

  select column_default into v_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'event_settings' and column_name = p_flag;

  if v_default is null then
    /* An unknown flag is a programming error, and must never read as "allowed". */
    raise exception 'Unknown event flag %', p_flag;
  end if;

  return v_default like 'true%';
end $$;

revoke all on function public.event_flag(text, text) from public;
grant execute on function public.event_flag(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The public settings read, without the hardcoded optimism.
-- ---------------------------------------------------------------------------

drop function if exists public.event_public_settings(text);

create function public.event_public_settings(p_event_id text)
returns table (
  out_qr_enabled boolean,
  out_self_checkin_enabled boolean,
  out_player_score_entry_enabled boolean,
  out_opponent_confirmation_enabled boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    public.event_flag(p_event_id, 'qr_enabled'),
    public.event_flag(p_event_id, 'self_checkin_enabled'),
    public.event_flag(p_event_id, 'player_score_entry_enabled'),
    public.event_flag(p_event_id, 'opponent_confirmation_enabled');
$$;

revoke all on function public.event_public_settings(text) from public;
grant execute on function public.event_public_settings(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Check-in obeys its flag.
-- ---------------------------------------------------------------------------

drop function if exists public.check_in_registration(text, text, text, text);

create function public.check_in_registration(
  p_event_id text,
  p_code text,
  p_token text,
  p_method text
)
returns table (
  out_result text,
  out_full_name text,
  out_checked_in_at timestamptz,
  out_message text
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

  /*
   * `staff_manual` is a member of staff standing at the desk, and the desk is never closed
   * to itself. The two player-driven methods are what the flag governs.
   */
  if p_method <> 'staff_manual'
     and not public.event_flag(p_event_id, 'self_checkin_enabled') then
    return query select 'blocked', null::text, null::timestamptz,
      'Please check in at the desk — a member of staff will mark you as arrived.';
    return;
  end if;

  if p_method = 'venue_qr' and not public.event_flag(p_event_id, 'qr_enabled') then
    return query select 'blocked', null::text, null::timestamptz,
      'Please check in at the desk — a member of staff will mark you as arrived.';
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

revoke all on function public.check_in_registration(text, text, text, text) from public;
grant execute on function public.check_in_registration(text, text, text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Scores, confirmations and the venue code obey theirs.
--
-- The bodies below are carried forward exactly as they were deployed. The only new
-- statement in each is the guard immediately after `begin`.
-- ---------------------------------------------------------------------------

-- submit_result_by_token: gated on player_score_entry_enabled. Body otherwise carried forward unchanged.
CREATE OR REPLACE FUNCTION public.submit_result_by_token(p_event_id text, p_token text, p_my_score integer, p_their_score integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_record public.records;
  v_game public.games;
  v_round integer;
  v_name text;
begin
  /* Players do not enter official scores at this event. */
  if not public.event_flag(p_event_id, 'player_score_entry_enabled') then
    return 'disabled';
  end if;
  select * into v_record
  from public.records
  where event_id = p_event_id
    and collection = 'registrations'
    and status = 'active'
    and checked_in_at is not null
    and data ->> 'token' = btrim(p_token);

  if not found then
    return 'not-found';
  end if;

  v_name := coalesce(v_record.data ->> 'fullName', 'A player');

  select max(g.round) into v_round from public.games g where g.event_id = p_event_id;
  if v_round is null then
    return 'no-round';
  end if;

  select * into v_game
  from public.games g
  where g.event_id = p_event_id
    and g.round = v_round
    and (g.player_a = v_record.id or g.player_b = v_record.id);

  if not found then
    return 'no-board';
  end if;

  if v_game.player_b is null then
    return 'bye';
  end if;

  if v_game.score_a is not null then
    return 'already-recorded';
  end if;

  if p_my_score is null or p_their_score is null then
    return 'missing-score';
  end if;

  if p_my_score < 0 or p_their_score < 0 or p_my_score > 1500 or p_their_score > 1500 then
    return 'out-of-range';
  end if;

  update public.games
  set score_a = case when v_game.player_a = v_record.id then p_my_score else p_their_score end,
      score_b = case when v_game.player_a = v_record.id then p_their_score else p_my_score end,
      status = 'verified',
      submitted_by = v_record.id,
      verified_by = v_name || ' (from their phone)',
      verified_at = now()
  where id = v_game.id;

  return 'recorded';
end $function$;

-- submit_result_by_code: gated on player_score_entry_enabled. Body otherwise carried forward unchanged.
CREATE OR REPLACE FUNCTION public.submit_result_by_code(p_event_id text, p_code text, p_my_score integer, p_their_score integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_record public.records;
  v_game public.games;
  v_round integer;
  v_name text;
begin
  /* Players do not enter official scores at this event. */
  if not public.event_flag(p_event_id, 'player_score_entry_enabled') then
    return 'disabled';
  end if;
  select * into v_record
  from public.records
  where event_id = p_event_id
    and collection = 'registrations'
    and status = 'active'
    and checked_in_at is not null
    and check_in_code = btrim(p_code);

  if not found then
    /*
     * One message for an unknown code and for somebody not checked in. Telling them apart
     * would turn this into a way to test whether a given code exists, or whether a
     * particular person has arrived.
     */
    return 'not-found';
  end if;

  v_name := coalesce(v_record.data ->> 'fullName', 'A player');

  select max(g.round) into v_round from public.games g where g.event_id = p_event_id;
  if v_round is null then
    return 'no-round';
  end if;

  select * into v_game
  from public.games g
  where g.event_id = p_event_id
    and g.round = v_round
    and (g.player_a = v_record.id or g.player_b = v_record.id);

  if not found then
    return 'no-board';
  end if;

  /* A bye has no opponent and no score to agree on. */
  if v_game.player_b is null then
    return 'bye';
  end if;

  /*
   * Refused rather than overwritten. If a recorded result could be replaced from a phone,
   * anybody could change a finished game later — and the person who played it would have no
   * way of knowing. Corrections go through the desk, where they carry a reason and a name.
   */
  if v_game.score_a is not null then
    return 'already-recorded';
  end if;

  if p_my_score is null or p_their_score is null then
    return 'missing-score';
  end if;

  /*
   * Sanity, not judgement. A Scrabble game really can end at 250 or at 700, so the bounds
   * are wide — they exist to stop a typo like 4120 or a negative, not to decide what a
   * plausible game looks like.
   */
  if p_my_score < 0 or p_their_score < 0 or p_my_score > 1500 or p_their_score > 1500 then
    return 'out-of-range';
  end if;

  update public.games
  set score_a = case when v_game.player_a = v_record.id then p_my_score else p_their_score end,
      score_b = case when v_game.player_a = v_record.id then p_their_score else p_my_score end,
      status = 'verified',
      verified_by = v_name || ' (from their phone)',
      verified_at = now()
  where id = v_game.id;

  return 'recorded';
end $function$;

-- confirm_result_by_token: gated on opponent_confirmation_enabled. Body otherwise carried forward unchanged.
CREATE OR REPLACE FUNCTION public.confirm_result_by_token(p_event_id text, p_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_record public.records;
  v_game public.games;
  v_round integer;
begin
  /* Opponents do not confirm results at this event; the desk is authoritative. */
  if not public.event_flag(p_event_id, 'opponent_confirmation_enabled') then
    return 'disabled';
  end if;
  select * into v_record
  from public.records
  where event_id = p_event_id
    and collection = 'registrations'
    and status = 'active'
    and checked_in_at is not null
    and data ->> 'token' = btrim(p_token);

  if not found then
    return 'not-found';
  end if;

  select max(g.round) into v_round from public.games g where g.event_id = p_event_id;

  select * into v_game
  from public.games g
  where g.event_id = p_event_id
    and g.round = v_round
    and (g.player_a = v_record.id or g.player_b = v_record.id);

  if not found or v_game.score_a is null then
    return 'no-result';
  end if;

  /* The person who sent it cannot also be the one who agrees to it. */
  if v_game.submitted_by is not distinct from v_record.id then
    return 'you-submitted-it';
  end if;

  update public.games
  set confirmed_by = v_record.id,
      confirmed_at = now(),
      /* A dispute that is then confirmed is settled, and the round can move again. */
      status = 'verified'
  where id = v_game.id;

  return 'confirmed';
end $function$;

-- dispute_result_by_token: gated on opponent_confirmation_enabled. Body otherwise carried forward unchanged.
CREATE OR REPLACE FUNCTION public.dispute_result_by_token(p_event_id text, p_token text, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_record public.records;
  v_game public.games;
  v_round integer;
  v_name text;
begin
  /* Opponents do not dispute results at this event; the desk is authoritative. */
  if not public.event_flag(p_event_id, 'opponent_confirmation_enabled') then
    return 'disabled';
  end if;
  select * into v_record
  from public.records
  where event_id = p_event_id
    and collection = 'registrations'
    and status = 'active'
    and checked_in_at is not null
    and data ->> 'token' = btrim(p_token);

  if not found then
    return 'not-found';
  end if;

  v_name := coalesce(v_record.data ->> 'fullName', 'A player');

  select max(g.round) into v_round from public.games g where g.event_id = p_event_id;

  select * into v_game
  from public.games g
  where g.event_id = p_event_id
    and g.round = v_round
    and (g.player_a = v_record.id or g.player_b = v_record.id);

  if not found or v_game.score_a is null then
    return 'no-result';
  end if;

  update public.games
  set status = 'disputed',
      note = 'Disputed by ' || v_name ||
             case when coalesce(btrim(p_reason), '') = '' then '' else ': ' || btrim(p_reason) end
  where id = v_game.id;

  return 'disputed';
end $function$;

-- board_for_code: gated on qr_enabled. Body otherwise carried forward unchanged.
CREATE OR REPLACE FUNCTION public.board_for_code(p_event_id text, p_code text)
 RETURNS TABLE(out_game_id uuid, out_round integer, out_board integer, out_you text, out_opponent text, out_already_recorded boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_record public.records;
  v_round integer;
begin
  /* The venue code is a QR feature, and QR is off for this event. */
  if not public.event_flag(p_event_id, 'qr_enabled') then
    return;
  end if;
  select * into v_record
  from public.records
  where event_id = p_event_id
    and collection = 'registrations'
    and status = 'active'
    and checked_in_at is not null
    and check_in_code = btrim(p_code);

  if not found then
    return;
  end if;

  /* The round being played is the highest one with boards, not a stored counter. */
  select max(g.round) into v_round from public.games g where g.event_id = p_event_id;
  if v_round is null then
    return;
  end if;

  return query
  select
    g.id,
    g.round,
    g.board,
    v_record.data ->> 'fullName',
    case
      when g.player_b is null then null
      when g.player_a = v_record.id then rb.data ->> 'fullName'
      else ra.data ->> 'fullName'
    end,
    g.score_a is not null
  from public.games g
  left join public.records ra on ra.id = g.player_a
  left join public.records rb on rb.id = g.player_b
  where g.event_id = p_event_id
    and g.round = v_round
    and (g.player_a = v_record.id or g.player_b = v_record.id);
end $function$;

do $$
declare
  v_events integer;
  v_settings integer;
begin
  select count(*) into v_events from public.events;
  select count(*) into v_settings from public.event_settings;
  if v_events <> v_settings then
    raise exception 'every event needs a settings row: % events, % rows', v_events, v_settings;
  end if;
  raise notice 'flags are enforced; % events frozen at their current values', v_events;
end $$;
