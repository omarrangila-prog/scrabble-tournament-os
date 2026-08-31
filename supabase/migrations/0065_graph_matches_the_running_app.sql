-- The transition graph has to describe the tournament this app actually runs.
--
-- Migration 0060 drew the graph from the specification's flow: check-in-closed into
-- round-preparation, into round-preview, into round-published. That is the flow Phase 2
-- builds, when a preview screen exists to stand in the middle of it. It is not the flow the
-- control room performs today, which publishes straight from check-in-closed and returns
-- there to prepare the next round.
--
-- So the machine refused the one sequence that matters:
--
--   check-in-open      OK
--   check-in-closed    OK
--   round-published    REFUSED  An event cannot go from check-in-closed to round-published.
--
-- A director would have paired a round, pressed Publish, and been told the event cannot go
-- there — with a room full of people waiting. Caught by replaying the control room's own
-- sequence against the database rather than by reading the graph and believing it.
--
-- The lesson is the obvious one: a state machine is a description of a system that exists,
-- and drawing it from a specification instead of from the code makes it fiction that
-- refuses. The edges below are what the app does, taken from the call sites.
--
-- The preview path stays. Nothing is removed, so when Phase 2 puts a preview screen between
-- pairing and publishing, that route is already legal and this direct one can be retired
-- deliberately rather than by surprise.

insert into public.event_state_transitions (from_state, to_state, precondition) values
  -- Publishing, as the control room does it today: pairings are generated, validated and
  -- published from one screen, and the state moves when `staff_publish_round` has accepted
  -- the boards. That function does the real guarding.
  ('check-in-closed', 'round-published', null),
  ('preparing',       'round-published', null),

  -- "Prepare round N+1" returns here, which is where the pairing controls live.
  ('result-entry',    'check-in-closed', 'round_has_no_results_pending'),
  ('result-entry',    'preparing',       'round_has_no_results_pending'),
  ('round-finalized', 'check-in-closed', 'rounds_remaining'),

  -- Going back before a round starts. `round_has_no_results` already refuses once anybody
  -- has entered a score.
  ('round-published', 'check-in-closed', 'round_has_no_results')
on conflict (from_state, to_state) do update set precondition = excluded.precondition;

/*
 * Preparing the next round while the current one still has boards outstanding is how a round
 * gets abandoned half-scored. The check is deliberately about *unresolved* boards rather than
 * finalization, because finalization does not exist yet — it arrives in Phase 3, and this
 * precondition tightens into it rather than being replaced.
 */
create or replace function public.event_precondition_failure(
  p_event_id text,
  p_precondition text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_round integer;
  v_n integer;
  v_configured integer;
begin
  if p_precondition is null then
    return null;
  end if;

  select coalesce(max(round), 0) into v_round from public.games where event_id = p_event_id;

  if p_precondition = 'two_players_checked_in' then
    select count(*) into v_n
    from public.records
    where event_id = p_event_id and collection = 'registrations'
      and status = 'active' and checked_in_at is not null;
    if v_n < 2 then
      return format('Only %s player(s) checked in. A round needs at least two.', v_n);
    end if;
    return null;
  end if;

  if p_precondition = 'round_has_no_results' then
    select count(*) into v_n
    from public.games
    where event_id = p_event_id and round = v_round
      and (score_a is not null or score_b is not null);
    if v_n > 0 then
      return format('Round %s already has %s result(s). Clear them first.', v_round, v_n);
    end if;
    return null;
  end if;

  if p_precondition = 'round_has_no_results_pending' then
    /* A bye has no second player and never gets a score, so it is resolved by existing. */
    select count(*) into v_n
    from public.games
    where event_id = p_event_id and round = v_round
      and player_b is not null and score_a is null;
    if v_n > 0 then
      return format(
        '%s board(s) in round %s still have no score. Enter them before starting the next round.',
        v_n, v_round);
    end if;
    return null;
  end if;

  if p_precondition = 'every_board_resolved' then
    select count(*) into v_n
    from public.games
    where event_id = p_event_id and round = v_round
      and player_b is not null and score_a is null;
    if v_n > 0 then
      return format('%s board(s) in round %s still have no score.', v_n, v_round);
    end if;
    return null;
  end if;

  if p_precondition = 'no_open_disputes' then
    select count(*) into v_n
    from public.games
    where event_id = p_event_id and round = v_round and status = 'disputed';
    if v_n > 0 then
      return format('%s board(s) in round %s are disputed. Settle them first.', v_n, v_round);
    end if;
    return null;
  end if;

  if p_precondition = 'rounds_remaining' then
    select coalesce((data ->> 'rounds')::integer, 0) into v_configured
    from public.events where id = p_event_id;
    if v_configured > 0 and v_round >= v_configured then
      return format('All %s rounds have been played. Finish the tournament instead.', v_configured);
    end if;
    return null;
  end if;

  /* An unknown precondition must never silently pass. */
  return format('Unknown precondition %s.', p_precondition);
end $$;

revoke all on function public.event_precondition_failure(text, text) from public, anon;
grant execute on function public.event_precondition_failure(text, text) to authenticated;

do $$
declare
  v_edges integer;
begin
  select count(*) into v_edges from public.event_state_transitions;
  raise notice 'graph now describes the running app: % edges', v_edges;
end $$;
