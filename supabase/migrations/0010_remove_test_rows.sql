-- Remove the rows written while testing the check-in functions.
--
-- The insert, lookup, duplicate-protection and counting paths were all exercised
-- against the live database, because a check-in system that has only ever been
-- tested against mocks is a check-in system nobody has tested. Those probe rows
-- must not be sitting in the participant list on the day.
--
-- Scoped to the probe token and name so it cannot reach a real entrant, and
-- verified afterwards rather than assumed.

do $$
declare
  removed integer;
  remaining integer;
begin
  delete from public.records
  where collection = 'registrations'
    and (
      data ->> 'token' in ('TESTTOK1', 'T1', 'CHEAT')
      or data ->> 'fullName' in ('Test Person DELETE', 'Test', 'Cheat')
    );

  get diagnostics removed = row_count;
  raise notice 'Removed % test registration(s).', removed;

  select count(*) into remaining
  from public.records
  where collection = 'registrations';

  raise notice '% registration(s) remain.', remaining;
end $$;
