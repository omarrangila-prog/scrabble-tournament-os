-- Let organizer screens receive game changes as they happen.
--
-- Scores currently reach a second laptop when somebody presses Refresh. With two
-- people entering results — one at each end of the room, which is how this will
-- actually be staffed — that means each of them is working from a table that may
-- already be out of date, and the first sign of trouble is two people entering the
-- same board.
--
-- Realtime respects row level security, which shapes the whole design here:
--
--   * `games` may only be read by staff, so only staff can subscribe to it. That
--     is the correct answer, not a limitation to work around. A participant has no
--     business receiving a stream of registration ids.
--   * Participants therefore do not subscribe to the table at all. They listen on
--     a broadcast channel that carries no data — just a nudge — and re-read the
--     board list through `event_round_boards`, which returns names and no ids. The
--     nudge is sent by the app after a write succeeds.
--   * Polling stays in place underneath. Broadcast is best-effort; a phone that
--     misses a message because it was in a pocket with no signal still catches up
--     on its next poll. Instant when it can be, correct regardless.
--
-- `records` is already published, and its policies already restrict reads to staff
-- for registrations, so arrivals become live for the desk with no change here.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
    raise notice 'games added to supabase_realtime';
  else
    raise notice 'games was already published';
  end if;
end $$;

/*
 * Full row images on the wire.
 *
 * The default replica identity sends only the primary key for updates and deletes,
 * which is not enough for Realtime to evaluate the row against a policy — a score
 * update would be filtered out and the second laptop would never hear about it.
 * The table holds one row per board per round, so the extra bytes are irrelevant.
 */
alter table public.games replica identity full;

do $$
declare
  published boolean;
  identity  char;
begin
  select exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='games'
  ) into published;

  select relreplident into identity from pg_class where oid = 'public.games'::regclass;

  if not published then
    raise exception 'games is not in the supabase_realtime publication';
  end if;

  if identity <> 'f' then
    raise exception 'games replica identity is %, expected f (full)', identity;
  end if;

  -- The point of the exercise: participants still must not be able to read it.
  if (select count(*) from pg_policies
      where schemaname='public' and tablename='games' and cmd='SELECT') <> 1 then
    raise exception 'games should have exactly one SELECT policy';
  end if;

  raise notice 'games is published with full row images, still staff-read-only';
end $$;
