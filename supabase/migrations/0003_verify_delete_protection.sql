-- Verify that anonymous DELETE cannot destroy submitted records.
--
-- PostgREST answers an anonymous DELETE with 204 whether it removed rows or
-- matched none, and RLS hides every row from anon, so the status code alone
-- cannot distinguish "refused" from "deleted". This raises the true count from
-- inside the database, where row-level security does not apply, and fails the
-- migration if the marker rows written during testing are gone.
--
-- This migration asserts and then cleans up. It writes nothing permanent.

do $$
declare
  marker_count integer;
  probe_count integer;
begin
  select count(*) into marker_count
  from public.records
  where data ->> 'marker' = 'survives-delete';

  if marker_count = 0 then
    raise exception
      'DELETE PROTECTION FAILED: anonymous delete destroyed the marker row. '
      'public.records needs an explicit delete policy.';
  end if;

  raise notice 'Delete protection holds: % marker row(s) survived.', marker_count;

  /*
   * Remove only rows written by connectivity testing.
   *
   * Every condition is anchored to something a real registration always has:
   * a participant name. A test row either carries an explicit probe marker or
   * has no name at all. Mixing `or` with an unparenthesised `and` here would
   * bind more loosely than intended and could match a genuine entry, so the
   * name check wraps the whole set.
   */
  delete from public.records
  where created_at > now() - interval '2 hours'
    and (
      data ->> 'marker' = 'survives-delete'
      or data ->> 'fullName' in ('RLS Probe', 'RLS Probe DELETE ME', 'x')
      or data ->> 'fullName' is null
    );

  get diagnostics probe_count = row_count;
  raise notice 'Removed % test row(s).', probe_count;
end $$;
