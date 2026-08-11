-- The round clock, in the database, so every screen counts the same round.
--
-- The timer lived in one browser's local storage. That made it private to the laptop it
-- was started on: the venue display counted nothing, a participant's phone had no idea
-- how long was left, and a second laptop opened a round that had already begun with a
-- full clock. Refusing to share the clock is the same as not having one — the whole
-- point of a round timer is that everybody is timing the same round.
--
-- Timing is stored as instants, never as a remaining number. `src/lib/engine/roundTimer.ts`
-- derives phase and remaining time from these timestamps, so a laptop that slept, a
-- display that reconnected and a phone opened an hour late all compute the same answer.
--
-- The engine stays the only place transitions are decided. This table records the result
-- of a decision; it does not make one. That is why there is no SQL that starts or pauses
-- a round — duplicating those rules in two languages is how the two would come to
-- disagree.

create table if not exists public.round_timers (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  event_id text not null references public.events (id) on delete cascade,
  round integer not null check (round > 0),

  /* Planned length before any extension. */
  planned_minutes integer not null check (planned_minutes > 0),

  /*
   * Extensions granted, each carrying its reason. An extension without a reason is the
   * thing a player asks about afterwards, so the reason travels with the grant.
   */
  extensions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(extensions) = 'array'),

  started_at timestamptz,
  /* Set while paused, cleared on resume. */
  paused_at timestamptz,
  /* Total milliseconds spent paused, accumulated across pauses. */
  paused_ms bigint not null default 0 check (paused_ms >= 0),
  ended_at timestamptz,

  updated_at timestamptz not null default now(),
  updated_by text,

  /* A round cannot be paused before it has started. */
  constraint paused_rounds_have_started check (paused_at is null or started_at is not null),
  /* Nor ended before it started. */
  constraint ended_rounds_have_started check (ended_at is null or started_at is not null)
);

/* One clock per round. Two would be two answers to "how long is left?". */
create unique index if not exists round_timers_event_round_idx
  on public.round_timers (event_id, round);

alter table public.round_timers enable row level security;

/*
 * Staff read the table directly. Everyone else reads one round's clock through the
 * function below — a participant needs the time left in their own round, not the shape
 * of every round the organizers have planned.
 */
drop policy if exists "round timers are staff-read" on public.round_timers;
create policy "round timers are staff-read"
  on public.round_timers for select
  using (public.is_staff('org-federation'));

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------

/**
 * Records the state of a round's clock.
 *
 * The whole timer is written at once, because the engine hands over a complete value.
 * Last write wins, which is correct here: the director's screen is the only thing that
 * starts, pauses, extends or ends a round, and a second staff device that tried would be
 * making the same decision from the same visible state.
 */
create or replace function public.staff_save_round_timer(
  p_event_id text,
  p_round integer,
  p_planned_minutes integer,
  p_extensions jsonb,
  p_started_at timestamptz,
  p_paused_at timestamptz,
  p_paused_ms bigint,
  p_ended_at timestamptz,
  p_by text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

/**
 * One round's clock. Readable by anyone.
 *
 * A player waiting at a board, and the wall display behind them, both need this and
 * neither has an account. It carries the timing and nothing else — no names, no ids, no
 * indication of who is playing.
 */
create or replace function public.event_round_timer(p_event_id text, p_round integer)
returns table (
  out_round integer,
  out_planned_minutes integer,
  out_extensions jsonb,
  out_started_at timestamptz,
  out_paused_at timestamptz,
  out_paused_ms bigint,
  out_ended_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return query
  select t.round, t.planned_minutes, t.extensions,
         t.started_at, t.paused_at, t.paused_ms, t.ended_at
  from public.round_timers t
  where t.event_id = p_event_id and t.round = p_round;
end $$;

revoke all on function public.staff_save_round_timer(text, integer, integer, jsonb, timestamptz, timestamptz, bigint, timestamptz, text) from public, anon;
grant execute on function public.staff_save_round_timer(text, integer, integer, jsonb, timestamptz, timestamptz, bigint, timestamptz, text) to authenticated;

-- The clock is for everyone in the room.
grant execute on function public.event_round_timer(text, integer) to anon, authenticated;

/*
 * Live updates. Without `replica identity full` an update carries no row a subscriber can
 * match, so "the round has been extended by five minutes" would reach nobody until their
 * next poll — which is exactly the moment it matters.
 */
alter table public.round_timers replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'round_timers'
  ) then
    alter publication supabase_realtime add table public.round_timers;
  end if;
end $$;

do $$
begin
  if has_function_privilege('anon', 'public.staff_save_round_timer(text, integer, integer, jsonb, timestamptz, timestamptz, bigint, timestamptz, text)', 'execute') then
    raise exception 'anon can rewrite the round clock';
  end if;

  if not has_function_privilege('anon', 'public.event_round_timer(text, integer)', 'execute') then
    raise exception 'anon cannot read the round clock, so no phone or display can show it';
  end if;

  raise notice 'round timers: staff write, the room reads, timing stored as instants';
end $$;
