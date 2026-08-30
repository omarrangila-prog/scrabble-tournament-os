-- An event's state becomes a machine rather than a free text column.
--
-- `staff_set_event_state` checked that the target was one of thirteen known names and then
-- wrote it. There was no notion of a *current* state, so every transition was legal:
-- completed -> registration-open, draft -> round-active, round-published -> archived. The
-- CHECK constraint was a spelling test, not a rule. A stale second tab, a double tap or a
-- mis-click could move an event anywhere, mid-tournament, with nothing to stop it.
--
-- Two design choices worth stating.
--
-- The legal edges live in a table, not in a CASE block. Adding a state becomes a row, and
-- the graph is queryable — which is what lets the control room grey out exactly the buttons
-- the server would refuse, rather than keeping its own second opinion about the rules.
--
-- The existing thirteen names are kept as they are. The specification lists seventeen
-- states, but four of its names are this project's names for the same thing:
--
--     spec check-in-locked        = check-in-closed
--     spec round-preparation      = preparing
--     spec tournament-finalizing  = final-review
--     spec tournament-complete    = completed
--
-- Renaming those would rewrite live rows and every switch in the UI to buy nothing. So only
-- the four genuinely missing states are added — round-preview, result-review,
-- round-finalized and awards — giving seventeen states covering exactly the seventeen
-- concepts the specification asks for.
--
-- One escape stays open by design. A director may force a transition the graph forbids, and
-- must give a reason, which is written to the audit log. A tournament director stuck behind
-- a rule the software invented, mid-event, with a room full of people waiting, is a worse
-- outcome than one who can override it on the record.

-- ---------------------------------------------------------------------------
-- The four new states.
-- ---------------------------------------------------------------------------

alter table public.events drop constraint if exists events_state_check;

alter table public.events add constraint events_state_check check (state in (
  'draft',
  'registration-open',
  'registration-closed',
  'preparing',           -- spec: round-preparation
  'check-in-open',
  'check-in-closed',     -- spec: check-in-locked
  'round-preview',       -- new
  'round-published',
  'round-active',
  'result-entry',
  'result-review',       -- new
  'round-finalized',     -- new
  'break',
  'final-review',        -- spec: tournament-finalizing
  'awards',              -- new
  'completed',           -- spec: tournament-complete
  'archived'
));

-- ---------------------------------------------------------------------------
-- The graph.
-- ---------------------------------------------------------------------------

create table if not exists public.event_state_transitions (
  from_state text not null,
  to_state text not null,
  /* What must be true of the event's data before this edge may be walked. Enforced in
     `transition_event_state`; named here so the graph explains itself. */
  precondition text,
  primary key (from_state, to_state)
);

alter table public.event_state_transitions enable row level security;

drop policy if exists "transitions are readable" on public.event_state_transitions;
create policy "transitions are readable" on public.event_state_transitions
  for select using (true);

delete from public.event_state_transitions;

insert into public.event_state_transitions (from_state, to_state, precondition) values
  -- Getting an event open.
  ('draft',               'registration-open',   null),
  ('registration-open',   'registration-closed', null),
  ('registration-open',   'draft',               null),
  ('registration-closed', 'registration-open',   null),
  ('registration-closed', 'check-in-open',       null),

  -- The desk.
  ('check-in-open',       'check-in-closed',     'two_players_checked_in'),
  ('check-in-closed',     'check-in-open',       null),
  ('check-in-closed',     'preparing',           'two_players_checked_in'),

  -- One round.
  ('preparing',           'round-preview',       null),
  ('preparing',           'check-in-closed',     null),
  ('round-preview',       'preparing',           null),
  ('round-preview',       'round-published',     null),
  ('round-published',     'round-active',        null),
  ('round-published',     'preparing',           'round_has_no_results'),
  ('round-active',        'result-entry',        null),
  ('result-entry',        'round-active',        null),
  ('result-entry',        'result-review',       'every_board_resolved'),
  ('result-review',       'result-entry',        null),
  ('result-review',       'round-finalized',     'no_open_disputes'),

  -- What happens after a round.
  ('round-finalized',     'preparing',           'rounds_remaining'),
  ('round-finalized',     'final-review',        null),

  -- Closing.
  ('final-review',        'awards',              null),
  ('final-review',        'completed',           null),
  ('final-review',        'round-finalized',     null),
  ('awards',              'completed',           null),
  ('completed',           'final-review',        null),
  ('completed',           'archived',            null),
  ('archived',            'completed',           null),

  -- A break may be taken from anywhere in play, and resumes where play resumes.
  ('check-in-open',       'break',               null),
  ('check-in-closed',     'break',               null),
  ('preparing',           'break',               null),
  ('round-preview',       'break',               null),
  ('round-published',     'break',               null),
  ('round-active',        'break',               null),
  ('result-entry',        'break',               null),
  ('result-review',       'break',               null),
  ('round-finalized',     'break',               null),
  ('break',               'check-in-open',       null),
  ('break',               'check-in-closed',     null),
  ('break',               'preparing',           null),
  ('break',               'round-preview',       null),
  ('break',               'round-published',     null),
  ('break',               'round-active',        null),
  ('break',               'result-entry',        null),
  ('break',               'result-review',       null),
  ('break',               'round-finalized',     null),
  ('break',               'final-review',        null);

-- ---------------------------------------------------------------------------
-- The preconditions.
-- ---------------------------------------------------------------------------

/*
 * Returns null when the precondition holds, or the sentence a director should read when it
 * does not. A sentence rather than a code: the only consumer is a person being told why the
 * button did not work, and "2 boards still have no score" is the whole answer.
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

  if p_precondition = 'every_board_resolved' then
    /* A bye has no second player and never gets a score, so it is resolved by existing. */
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

-- ---------------------------------------------------------------------------
-- The one way an event's state changes.
-- ---------------------------------------------------------------------------

drop function if exists public.transition_event_state(text, text, text, text, boolean);

create function public.transition_event_state(
  p_event_id text,
  p_target text,
  p_by text default null,
  p_reason text default null,
  p_force boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_current text;
  v_legal boolean;
  v_precondition text;
  v_failure text;
  v_actor text;
begin
  if not public.is_staff('org-federation') then
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
end $$;

revoke all on function public.transition_event_state(text, text, text, text, boolean) from public, anon;
grant execute on function public.transition_event_state(text, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- The old entry point now goes through the machine.
-- ---------------------------------------------------------------------------

/*
 * Rewritten rather than left alongside. A guard that a caller can go around is not a guard,
 * and `staff_set_event_state` is what the control room already calls — leaving it writing
 * directly would have made the whole machine optional.
 */
create or replace function public.staff_set_event_state(p_event_id text, p_state text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.transition_event_state(p_event_id, p_state, null, null, false);
end $$;

revoke all on function public.staff_set_event_state(text, text) from public, anon;
grant execute on function public.staff_set_event_state(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- What the control room may offer.
-- ---------------------------------------------------------------------------

drop function if exists public.event_next_states(text);

create function public.event_next_states(p_event_id text)
returns table (out_state text, out_blocked_reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current text;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select state into v_current from public.events where id = p_event_id;
  if v_current is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  /*
   * Blocked edges are returned, not hidden. "Finalize round" greyed out with "2 boards still
   * have no score" tells a director what to do next; a button that has vanished tells them
   * the software is broken.
   */
  return query
  select t.to_state, public.event_precondition_failure(p_event_id, t.precondition)
  from public.event_state_transitions t
  where t.from_state = v_current
  order by t.to_state;
end $$;

revoke all on function public.event_next_states(text) from public, anon;
grant execute on function public.event_next_states(text) to authenticated;

do $$
declare
  v_edges integer;
begin
  select count(*) into v_edges from public.event_state_transitions;
  if v_edges < 40 then
    raise exception 'the transition graph did not load (% edges)', v_edges;
  end if;
  raise notice 'event state is a machine: % legal edges, forced changes need a director and a reason', v_edges;
end $$;
