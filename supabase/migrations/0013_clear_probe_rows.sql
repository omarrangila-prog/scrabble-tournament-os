-- Remove the registrations created while proving the save path works.
--
-- Two were submitted through the real form in a browser, because a save path that
-- has only been tested by calling the API directly is not a tested save path. They
-- must not be sitting in the participant list on the day, or in the arrivals
-- count on the venue display.
--
-- Matched on the probe names, plus any row with no name at all: the first run
-- saved an almost-empty record because the page read a stale store snapshot, and
-- that row has no name to match on. The form requires a name, so a nameless row
-- cannot be a genuine entrant.
--
-- The count is asserted afterwards rather than assumed. A first attempt at this
-- migration claimed success while one row survived; the assertion caught it.

do $$
declare
  removed integer;
  remaining integer;
begin
  delete from public.records
  where collection = 'registrations'
    and (
      data ->> 'fullName' in ('E2E Probe Khan', 'Verify Probe Rahman')
      or data ->> 'email' in ('e2e@example.com', 'verify@example.com')
      /*
       * Also the nameless row from the first end-to-end run, written before the
       * stale-snapshot bug was fixed. A registration with no name is not a real
       * one — the form requires it — so this cannot catch a genuine entrant.
       */
      or coalesce(data ->> 'fullName', '') = ''
    );

  get diagnostics removed = row_count;

  select count(*) into remaining
  from public.records
  where collection = 'registrations';

  raise notice 'Removed % probe registration(s); % remain.', removed, remaining;

  -- The participant list must start empty for a real event.
  if remaining <> 0 then
    raise exception
      'Expected no registrations after cleanup, found %. Check for leftover test data.',
      remaining;
  end if;
end $$;
