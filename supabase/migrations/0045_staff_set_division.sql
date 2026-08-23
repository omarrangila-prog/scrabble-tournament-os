-- Moving somebody between categories, on the day, from a phone.
--
-- A nine-year-old entered as Recreational, an adult who has clearly been playing for years in
-- Beginner: the organizer sees this in the room and needs to fix it before pairing, not by
-- asking somebody to edit a database.
--
-- Written to `confirmedDivision`, which every read already prefers over the level a
-- participant asked for — see 0006 and 0015. That keeps what they said about themselves
-- intact and records the organizer's decision beside it, rather than overwriting the answer
-- they gave.

create or replace function public.staff_set_division(
  p_record_id uuid,
  p_division text,
  p_by text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  if p_division not in ('beginner', 'recreational', 'advanced') then
    raise exception 'Unknown division %', p_division;
  end if;

  update public.records
  set data = data
             || jsonb_build_object(
                  'preferredDivision', p_division,
                  'confirmedDivision', p_division,
                  'divisionSetBy', coalesce(nullif(btrim(p_by), ''), 'Desk'),
                  'divisionSetAt', now()
                )
             || jsonb_build_object(
                  'timeline',
                  coalesce(data -> 'timeline', '[]'::jsonb) || jsonb_build_array(
                    jsonb_build_object(
                      'at', now(),
                      'by', coalesce(nullif(btrim(p_by), ''), 'Desk'),
                      'entry', 'Category changed to ' || initcap(p_division) || '.'
                    )
                  )
                ),
      updated_at = now()
  where id = p_record_id and collection = 'registrations';

  return found;
end $$;

revoke all on function public.staff_set_division(uuid, text, text) from public, anon;
grant execute on function public.staff_set_division(uuid, text, text) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.staff_set_division(uuid, text, text)', 'execute') then
    raise exception 'a participant must not be able to change their own category';
  end if;
  raise notice 'staff can move somebody between categories';
end $$;
