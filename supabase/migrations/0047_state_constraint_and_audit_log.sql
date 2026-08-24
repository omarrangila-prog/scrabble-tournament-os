-- Phase 1, unit A: the two lowest-risk, highest-leverage fixes from the audit.
--
-- `events.state` has carried the tournament's phase since the very first migration with no
-- database-level constraint on it — only a hardcoded list inside `staff_set_event_state`'s
-- own body, duplicated by hand in a TypeScript union. The direct RLS write path on `events`
-- bypasses that RPC's validation entirely. This adds the constraint the column always should
-- have had.
--
-- `audit_logs` has existed since migration 0001, fully defined with correct append-only RLS,
-- and has never once been written to. A score correction today overwrites `verified_by` /
-- `verified_at` / `note` in place — the row only ever holds its current value, with no trace
-- of what it replaced. This wires every staff mutation to it. No schema change: the table was
-- always ready, nothing had ever called it.
--
-- Both changes are additive. A valid state still writes exactly as before; an audit row is
-- written alongside every mutation, and nothing that already worked stops working.

-- ---------------------------------------------------------------------------
-- 1. events.state — a constraint where there has only ever been a convention
-- ---------------------------------------------------------------------------
alter table public.events drop constraint if exists events_state_check;
alter table public.events add constraint events_state_check check (state in (
  'draft', 'registration-open', 'registration-closed', 'preparing',
  'check-in-open', 'check-in-closed', 'round-published', 'round-active',
  'result-entry', 'break', 'final-review', 'completed', 'archived'
));

-- ---------------------------------------------------------------------------
-- 2. The audit log helper
-- ---------------------------------------------------------------------------
create or replace function public.write_audit_log(
  p_organization_id text,
  p_event_id text,
  p_actor text,
  p_action text,
  p_detail jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_logs (organization_id, event_id, actor, action, detail)
  values (p_organization_id, p_event_id, coalesce(nullif(trim(p_actor), ''), 'unknown'), p_action, p_detail);
$$;

-- Not granted to anybody. Every staff RPC below runs as this function's owner, which is how
-- they already call `is_staff()` with no grant on it either — no client should be able to
-- call this directly and hand it whatever actor string it likes.
revoke all on function public.write_audit_log(text, text, text, text, jsonb) from public, anon, authenticated;

/** A human-readable identity for an action with no `p_by` parameter of its own. */
create or replace function public.current_staff_email()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select email from auth.users where id = auth.uid();
$$;

revoke all on function public.current_staff_email() from public, anon;
grant execute on function public.current_staff_email() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Every staff mutation RPC, redefined with one added audit-log call.
--    Signatures unchanged except where a trailing optional `p_by` is added —
--    every existing caller that omits it keeps working, falling back to the
--    signed-in staff member's own email.
-- ---------------------------------------------------------------------------

create or replace function public.staff_record_result(
  p_game_id uuid,
  p_score_a integer,
  p_score_b integer,
  p_by text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games;
  v_org text;
begin
  if not public.is_staff('org-federation') then
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
end $$;

drop function if exists public.staff_clear_result(uuid);
create or replace function public.staff_clear_result(p_game_id uuid, p_by text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games;
  v_org text;
begin
  if not public.is_staff('org-federation') then
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
end $$;

revoke all on function public.staff_clear_result(uuid, text) from public, anon;
grant execute on function public.staff_clear_result(uuid, text) to authenticated;

drop function if exists public.staff_clear_round(text, integer);
create or replace function public.staff_clear_round(p_event_id text, p_round integer, p_by text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed integer;
  v_org text;
  v_boards jsonb;
begin
  if not public.is_staff('org-federation') then
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
end $$;

revoke all on function public.staff_clear_round(text, integer, text) from public, anon;
grant execute on function public.staff_clear_round(text, integer, text) to authenticated;

create or replace function public.staff_flag_result(
  p_game_id uuid,
  p_by text,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games;
  v_org text;
begin
  if not public.is_staff('org-federation') then
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
end $$;

create or replace function public.staff_check_in(p_record_id uuid)
returns table (out_checked_in_at timestamptz, out_already boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing timestamptz;
  v_org text;
  v_event text;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select checked_in_at, organization_id, event_id
    into v_existing, v_org, v_event
  from public.records
  where id = p_record_id and collection = 'registrations';

  if not found then
    raise exception 'No such registration';
  end if;

  if v_existing is not null then
    return query select v_existing, true;
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
    jsonb_build_object('recordId', p_record_id)
  );

  return query select v_existing, false;
end $$;

create or replace function public.staff_undo_check_in(p_record_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_event text;
  v_was timestamptz;
begin
  if not public.is_staff('org-federation') then
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
end $$;

create or replace function public.staff_decide_payment(
  p_record_id uuid,
  p_status text,
  p_by text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_event text;
  v_previous text;
begin
  if not public.is_staff('org-federation') then
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
end $$;

create or replace function public.staff_set_event_state(p_event_id text, p_state text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state text;
  v_org text;
  v_previous text;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  if p_state not in (
    'draft', 'registration-open', 'registration-closed', 'preparing',
    'check-in-open', 'check-in-closed', 'round-published', 'round-active',
    'result-entry', 'break', 'final-review', 'completed', 'archived'
  ) then
    raise exception 'Unknown event state %', p_state;
  end if;

  select organization_id, state into v_org, v_previous from public.events where id = p_event_id;

  update public.events
  set state = p_state,
      updated_at = now()
  where id = p_event_id
  returning state into v_state;

  if v_state is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  if v_previous is distinct from v_state then
    perform public.write_audit_log(
      v_org, p_event_id, coalesce(public.current_staff_email(), 'unknown'), 'set-event-state',
      jsonb_build_object('before', v_previous, 'after', v_state)
    );
  end if;

  return v_state;
end $$;

-- ---------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'events_state_check' and conrelid = 'public.events'::regclass
  ) then
    raise exception 'events_state_check was not created';
  end if;

  if has_function_privilege('anon', 'public.write_audit_log(text, text, text, text, jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.write_audit_log(text, text, text, text, jsonb)', 'execute')
  then
    raise exception 'write_audit_log is callable directly — it must only run inside another function';
  end if;

  raise notice 'Phase 1 unit A applied: events.state constraint, audit log wired into every staff mutation.';
end $$;
