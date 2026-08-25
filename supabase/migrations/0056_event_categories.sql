-- The categories an event runs become the director's to decide.
--
-- They were three fixed strings — 'beginner', 'recreational', 'advanced' — hardcoded in the
-- TypeScript union, in the seed, in the roster mapping, and in `staff_set_division`'s own
-- validation. Running an event with an Under-12 category, or a Schools section, or a single
-- Open field, meant editing code and redeploying.
--
-- Stored on the event alongside rounds, round length and pairing system, in the same
-- `events.data` document, for the same reason: it is a decision about one tournament, not a
-- property of the software.
--
-- Existing events keep exactly what they have. `event_categories` falls back to the three
-- that were hardcoded, so an event that has never been given a list behaves as it always did.

create or replace function public.staff_set_event_categories(
  p_event_id text,
  p_categories jsonb,
  p_by text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_before jsonb;
  v_count integer;
  v_ids text[];
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id, data -> 'categories' into v_org, v_before
  from public.events where id = p_event_id;

  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  if jsonb_typeof(p_categories) <> 'array' then
    raise exception 'Categories must be a JSON array';
  end if;

  select count(*) into v_count from jsonb_array_elements(p_categories);
  if v_count < 1 then
    raise exception 'A tournament needs at least one category';
  end if;

  -- Every entry needs an id and a name; a category with neither cannot be shown or paired.
  if exists (
    select 1 from jsonb_array_elements(p_categories) as c
    where coalesce(btrim(c ->> 'id'), '') = '' or coalesce(btrim(c ->> 'name'), '') = ''
  ) then
    raise exception 'Every category needs an id and a name';
  end if;

  -- Two categories sharing an id would silently merge two fields into one on every screen.
  select array_agg(c ->> 'id') into v_ids from jsonb_array_elements(p_categories) as c;
  if array_length(v_ids, 1) <> cardinality(array(select distinct unnest(v_ids))) then
    raise exception 'Two categories share the same id';
  end if;

  /*
   * A category somebody is already entered in cannot be removed: their registration would
   * point at a category that no longer exists, and they would vanish from every roster and
   * pairing screen that groups by it. Rename it instead, which keeps the id and moves nobody.
   */
  if exists (
    select 1
    from public.records r
    where r.event_id = p_event_id
      and r.collection = 'registrations'
      and r.status = 'active'
      and coalesce(r.data ->> 'confirmedDivision', r.data ->> 'preferredDivision') is not null
      and coalesce(r.data ->> 'confirmedDivision', r.data ->> 'preferredDivision') <> all(v_ids)
  ) then
    raise exception
      'Somebody is entered in a category this list removes. Move them first, or rename the category instead of deleting it.';
  end if;

  update public.events
  set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('categories', p_categories),
      updated_at = now()
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(btrim(p_by), ''), 'unknown'), 'set-event-categories',
    jsonb_build_object('before', v_before, 'after', p_categories)
  );

  return true;
end $$;

revoke all on function public.staff_set_event_categories(text, jsonb, text) from public, anon;
grant execute on function public.staff_set_event_categories(text, jsonb, text) to authenticated;

/**
 * The categories an event runs, readable by anyone — the wall groups boards by them.
 *
 * Falls back to the three that used to be hardcoded, so every event created before this
 * migration keeps behaving exactly as it did.
 */
create or replace function public.event_categories(p_event_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select data -> 'categories' from public.events where id = p_event_id),
    '[
      {"id":"advanced","name":"Advanced","shortName":"ADV","accent":"secondary"},
      {"id":"recreational","name":"Recreational","shortName":"REC","accent":"success"},
      {"id":"beginner","name":"Beginner","shortName":"NOV","accent":"warning"}
    ]'::jsonb
  );
$$;

revoke all on function public.event_categories(text) from public;
grant execute on function public.event_categories(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- staff_set_division: accept whatever the event actually runs.
-- ---------------------------------------------------------------------------
--
-- It validated against the same three hardcoded strings, so moving somebody into a category
-- the director had just created would have been refused by the database.

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
declare
  v_event text;
  v_org text;
  v_before text;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  select event_id, coalesce(data ->> 'confirmedDivision', data ->> 'preferredDivision')
  into v_event, v_before
  from public.records
  where id = p_record_id and collection = 'registrations';

  if v_event is null then
    raise exception 'No such registration';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(public.event_categories(v_event)) as c
    where c ->> 'id' = p_division
  ) then
    raise exception 'This event has no category %', p_division;
  end if;

  update public.records
  set data = data
             || jsonb_build_object(
                  'preferredDivision', p_division,
                  'confirmedDivision', p_division,
                  'divisionSetBy', coalesce(nullif(btrim(p_by), ''), 'Desk'),
                  'divisionSetAt', now()
                ),
      updated_at = now()
  where id = p_record_id;

  select organization_id into v_org from public.events where id = v_event;
  perform public.write_audit_log(
    v_org, v_event, coalesce(nullif(btrim(p_by), ''), 'Desk'), 'set-division',
    jsonb_build_object('registration', p_record_id, 'before', v_before, 'after', p_division)
  );

  return true;
end $$;

revoke all on function public.staff_set_division(uuid, text, text) from public, anon;
grant execute on function public.staff_set_division(uuid, text, text) to authenticated;

do $$
begin
  if jsonb_array_length(public.event_categories('evt-alphabattle-23-august')) < 1 then
    raise exception 'the fallback category list should never be empty';
  end if;
  raise notice 'categories are the event''s own';
end $$;
