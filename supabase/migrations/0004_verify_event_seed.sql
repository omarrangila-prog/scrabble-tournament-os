-- Confirm both August 2026 events exist as rows.
--
-- Anonymous reads return [] because the public select policy exposes only
-- public + active events, and both are deliberately still private drafts. That
-- makes the REST response useless for telling "seeded but hidden" apart from
-- "never inserted", so this checks from inside the database and fails loudly
-- if either row is missing.

do $$
declare
  missing text;
begin
  select string_agg(want.id, ', ')
  into missing
  from (values
    ('evt-game-on-8-august'),
    ('evt-alphabattle-23-august')
  ) as want (id)
  where not exists (
    select 1 from public.events e where e.id = want.id
  );

  if missing is not null then
    raise exception 'EVENT SEED MISSING: %', missing;
  end if;

  raise notice 'Both events present.';
end $$;
