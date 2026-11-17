-- Rookie and Premier are categories, not Recreational.
--
-- `division_for` turns whatever a registration stored into a category id. It knew Masters,
-- Beginner and Advanced and sent everything else to 'recreational', so on the 22 November event
-- every Rookie and every Premier player was read as Recreational. Worse, publishing a round checks
-- that both players on a board are in the same category through this function, so a Rookie could
-- have been paired against a Premier player and the database would have allowed it.
--
-- Mirrors `divisionFor` in src/lib/domain/roster.ts.
create or replace function public.division_for(p_level text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(btrim(coalesce(p_level, ''))) like '%rookie%'   then 'rookie'
    when lower(btrim(coalesce(p_level, ''))) like '%premier%'  then 'premier'
    when lower(btrim(coalesce(p_level, ''))) like '%master%'   then 'masters'
    when lower(btrim(coalesce(p_level, ''))) like '%expert%'   then 'masters'
    when lower(btrim(coalesce(p_level, ''))) like '%beginner%' then 'beginner'
    when lower(btrim(coalesce(p_level, ''))) like '%new%'      then 'beginner'
    when lower(btrim(coalesce(p_level, ''))) like '%advanced%' then 'advanced'
    when lower(btrim(coalesce(p_level, ''))) like '%regular%'  then 'advanced'
    else 'recreational'
  end
$$;

do $$
begin
  if public.division_for('rookie') <> 'rookie' or public.division_for('premier') <> 'premier'
     or public.division_for('recreational') <> 'recreational' or public.division_for('Beginner') <> 'beginner' then
    raise exception 'division_for still misreads a category';
  end if;
end $$;
