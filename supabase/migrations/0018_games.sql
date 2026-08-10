-- Pairings and results, in the database.
--
-- Until now a round existed only in the browser that generated it. That has three
-- consequences on the day: a second laptop cannot enter scores, closing the tab
-- loses the tournament, and participants cannot see their board on their phone
-- because nothing outside that one browser knows what the boards are.
--
-- Standings are deliberately not stored. They are computed from verified games,
-- and a stored copy is a second version of the truth that drifts from the first.
-- The same reasoning applies to team scores and to arrival counts.

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  event_id text not null references public.events (id) on delete restrict,
  round integer not null check (round > 0),
  board integer not null check (board > 0),
  division text not null,

  -- Registration rows, so a game points at the person who actually entered.
  player_a uuid not null references public.records (id) on delete restrict,
  -- Null is a bye: an odd field leaves somebody unpaired, which is normal.
  player_b uuid references public.records (id) on delete restrict,

  score_a integer check (score_a >= 0),
  score_b integer check (score_b >= 0),

  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'awaiting-verification', 'verified', 'disputed')),

  verified_by text,
  verified_at timestamptz,
  /*
   * Why a score is what it is, when somebody had to explain it — a correction, a
   * forfeit, a ruling. Blank for an ordinary result.
   */
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /*
   * A verified game must have both scores. Without this a round could be closed on
   * games that were only half entered, and the standings would silently treat a
   * missing score as zero.
   */
  constraint verified_games_have_scores check (
    status <> 'verified'
    or (score_a is not null and (player_b is null or score_b is not null))
  ),

  -- Nobody plays themselves.
  constraint distinct_players check (player_b is null or player_a <> player_b)
);

-- One game per board per round. Publishing twice cannot silently double a round.
create unique index if not exists games_board_idx
  on public.games (event_id, round, board);

-- A player has one game per round, which is what stops a double-booking.
create unique index if not exists games_player_a_round_idx
  on public.games (event_id, round, player_a);
create unique index if not exists games_player_b_round_idx
  on public.games (event_id, round, player_b)
  where player_b is not null;

create index if not exists games_event_round_idx on public.games (event_id, round);

drop trigger if exists games_touch on public.games;
create trigger games_touch
  before update on public.games
  for each row
  execute function public.touch_updated_at();

alter table public.games enable row level security;

/*
 * No direct access from a browser, in either direction.
 *
 * Reads go through `event_round_boards`, which returns names and scores but no row
 * ids — a participant has no use for a registration id and exposing one invites
 * someone to try editing by it. Writes go through the staff functions below, so a
 * client cannot invent a score for a board it is not sitting at.
 */
create policy "games are not directly readable"
  on public.games for select
  using (public.is_staff('org-federation'));

-- ---------------------------------------------------------------------------
-- Publishing a round
-- ---------------------------------------------------------------------------

/**
 * Replaces the pairings for one round.
 *
 * Takes the whole round as a single array so publishing is atomic: either every
 * board exists or none do. Publishing board by board would leave a half-paired
 * round visible on the venue screen if the connection dropped in the middle.
 *
 * Refuses to touch a round that has results. Re-pairing after play has started
 * would delete games people have already finished, which is not something a
 * mis-click should be able to do.
 *
 * `p_boards` is a JSON array of objects: board, division, playerA, playerB.
 */
create or replace function public.staff_publish_round(
  p_event_id text,
  p_round integer,
  p_boards jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_played integer;
  v_count integer;
begin
  if not public.is_staff('org-federation') then
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

  delete from public.games where event_id = p_event_id and round = p_round;

  insert into public.games (
    organization_id, event_id, round, board, division, player_a, player_b
  )
  select
    v_org,
    p_event_id,
    p_round,
    (b ->> 'board')::integer,
    b ->> 'division',
    (b ->> 'playerA')::uuid,
    nullif(b ->> 'playerB', '')::uuid
  from jsonb_array_elements(p_boards) as b;

  select count(*) into v_count
  from public.games where event_id = p_event_id and round = p_round;

  return v_count;
end $$;

/**
 * Removes a round's pairings, results included.
 *
 * Deliberately separate from publishing, and it says what it destroys, because the
 * publish path refuses to overwrite played games. A director who really does need
 * to re-pair a round that has scores has to ask for that explicitly.
 */
create or replace function public.staff_clear_round(p_event_id text, p_round integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed integer;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  delete from public.games where event_id = p_event_id and round = p_round;
  get diagnostics v_removed = row_count;

  return v_removed;
end $$;

-- ---------------------------------------------------------------------------
-- Recording a result
-- ---------------------------------------------------------------------------

/**
 * Records the official score for one board.
 *
 * The reviewer is stored with the result. A score with nobody attached is not an
 * audit trail, and on the one occasion a score is questioned the only useful
 * question is who entered it.
 *
 * Both scores are required, and a bye cannot carry an opponent score. The table
 * constraint enforces this too; failing here gives a message a human can read.
 */
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

  /*
   * A correction is the same operation as a first entry: overwrite, and record who
   * did it. Keeping a separate "correct" path invites the two to diverge, and the
   * question after a disputed score is always the same one — who typed this.
   */
  update public.games
  set score_a = p_score_a,
      score_b = p_score_b,
      status = 'verified',
      verified_by = p_by,
      verified_at = now(),
      note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_game_id;

  return true;
end $$;

/** Reopens a board, for a score entered against the wrong game. */
create or replace function public.staff_clear_result(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  update public.games
  set score_a = null,
      score_b = null,
      status = 'scheduled',
      verified_by = null,
      verified_at = null
  where id = p_game_id;

  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

/**
 * Every game for an event, for staff.
 *
 * Includes ids, because the organizer screens need to address a specific board.
 */
create or replace function public.staff_games(p_event_id text)
returns table (
  out_id uuid,
  out_round integer,
  out_board integer,
  out_division text,
  out_player_a uuid,
  out_player_b uuid,
  out_score_a integer,
  out_score_b integer,
  out_status text,
  out_verified_by text,
  out_verified_at timestamptz,
  out_note text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_staff('org-federation') then
    return;
  end if;

  return query
  select g.id, g.round, g.board, g.division, g.player_a, g.player_b,
         g.score_a, g.score_b, g.status, g.verified_by, g.verified_at, g.note
  from public.games g
  where g.event_id = p_event_id
  order by g.round, g.board;
end $$;

/**
 * The board list for one round, for anybody.
 *
 * This is the pairing sheet — the thing that would otherwise be printed and taped
 * to a wall, which is why names appear without a login. Row ids do not: a
 * participant has no use for one, and publishing internal ids invites somebody to
 * try addressing the database with them.
 *
 * Returns nothing until the round is published, so a participant refreshing early
 * sees an empty board list rather than next round's pairings.
 */
create or replace function public.event_round_boards(p_event_id text, p_round integer)
returns table (
  out_board integer,
  out_division text,
  out_player_a text,
  out_player_b text,
  out_score_a integer,
  out_score_b integer,
  out_status text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return query
  select
    g.board,
    g.division,
    ra.data ->> 'fullName',
    case when g.player_b is null then null else rb.data ->> 'fullName' end,
    g.score_a,
    g.score_b,
    g.status
  from public.games g
  join public.records ra on ra.id = g.player_a
  left join public.records rb on rb.id = g.player_b
  where g.event_id = p_event_id
    and g.round = p_round
  order by g.board;
end $$;

/**
 * The round currently on the boards, for anybody.
 *
 * A participant's phone has to know which round to ask for, and it cannot read the
 * games table to find out. Returns 0 before anything is published, so an early
 * refresh shows "not paired yet" rather than an error.
 */
create or replace function public.event_current_round(p_event_id text)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(max(round), 0) from public.games where event_id = p_event_id;
$$;

revoke all on function public.staff_publish_round(text, integer, jsonb) from public;
revoke all on function public.staff_clear_round(text, integer) from public;
revoke all on function public.staff_record_result(uuid, integer, integer, text, text) from public;
revoke all on function public.staff_clear_result(uuid) from public;

grant execute on function public.staff_publish_round(text, integer, jsonb) to authenticated;
grant execute on function public.staff_clear_round(text, integer) to authenticated;
grant execute on function public.staff_record_result(uuid, integer, integer, text, text) to authenticated;
grant execute on function public.staff_clear_result(uuid) to authenticated;
grant execute on function public.staff_games(text) to authenticated;

-- The pairing sheet is public, like a sheet taped to the wall.
grant execute on function public.event_round_boards(text, integer) to anon, authenticated;
grant execute on function public.event_current_round(text) to anon, authenticated;
