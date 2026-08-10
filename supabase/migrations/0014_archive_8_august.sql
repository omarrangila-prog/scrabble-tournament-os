-- Take the 8 August event out of the active system.
--
-- The seed was reduced to a single event, but the database was never told: GAME
-- ON! is still sitting there as `registration-open`. That matters because the
-- database is now the source of truth for registrations, so a stale open event
-- means somebody could still be admitted against a date that has passed, and any
-- code reading events from Postgres would show two.
--
-- Archived rather than deleted. The row carries the event's real details and any
-- history attached to it, and deleting it would also break the foreign key from
-- any record that referenced it. Archiving takes it out of every public and
-- organizer view while keeping the history intact.

update public.events
set state      = 'archived',
    visibility = 'private',
    status     = 'archived',
    updated_at = now()
where id = 'evt-game-on-8-august';

do $$
declare
  active integer;
  names text;
begin
  select count(*), coalesce(string_agg(name, ', '), '(none)')
  into active, names
  from public.events
  where status = 'active'
    and visibility = 'public'
    and state = 'registration-open';

  raise notice 'Active public events: % (%)', active, names;

  -- One event, and it must be the right one.
  if active <> 1 then
    raise exception 'Expected exactly one active event, found %: %', active, names;
  end if;

  if not exists (
    select 1 from public.events
    where id = 'evt-alphabattle-23-august'
      and status = 'active'
      and state = 'registration-open'
  ) then
    raise exception 'The 23 August event is not the active one.';
  end if;
end $$;
