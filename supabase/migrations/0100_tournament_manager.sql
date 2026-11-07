-- One-page tournament manager: students, sections, editing and deleting.
--
-- 1. The default category list loses Recreational. An event that has never been given a list
--    now runs Beginner and Masters. Events that already have people entered in Advanced or
--    Recreational keep those categories, because removing one somebody is entered in would
--    drop them off every roster.
-- 2. Staff can add, edit and delete a student on the roster.
-- 3. A director can delete an event, with everything that belongs to it.
-- 4. The Froebel High School event is set up with its 18 Grade 3 students in three sections.

create or replace function public.event_categories(p_event_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select data -> 'categories' from public.events where id = p_event_id),
    (
      select jsonb_agg(v.c order by v.ord)
      from (
        values
          (1, '{"id":"beginner","name":"Beginner","shortName":"BEG","accent":"warning"}'::jsonb, true),
          (2, '{"id":"masters","name":"Masters","shortName":"MAS","accent":"secondary"}'::jsonb, true),
          (3, '{"id":"advanced","name":"Advanced","shortName":"ADV","accent":"secondary"}'::jsonb,
            exists (select 1 from public.records r
                    where r.event_id = p_event_id and r.collection = 'registrations' and r.status = 'active'
                      and coalesce(r.data ->> 'confirmedDivision', r.data ->> 'preferredDivision') = 'advanced')),
          (4, '{"id":"recreational","name":"Recreational","shortName":"REC","accent":"success"}'::jsonb,
            exists (select 1 from public.records r
                    where r.event_id = p_event_id and r.collection = 'registrations' and r.status = 'active'
                      and coalesce(r.data ->> 'confirmedDivision', r.data ->> 'preferredDivision') = 'recreational'))
      ) as v(ord, c, keep)
      where v.keep
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Students

create or replace function public._new_check_in_code(p_event_id text)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_code text;
  v_attempts integer := 0;
begin
  loop
    v_code := lpad((floor(random() * 900000) + 100000)::text, 6, '0');
    exit when not exists (
      select 1 from public.records where event_id = p_event_id and check_in_code = v_code
    );
    v_attempts := v_attempts + 1;
    if v_attempts > 40 then
      raise exception 'Could not allocate a check-in code';
    end if;
  end loop;
  return v_code;
end $$;

revoke all on function public._new_check_in_code(text) from public, anon, authenticated;

-- Adds a student, already checked in: at a school event everybody is in the room.
create or replace function public.staff_add_student(
  p_event_id text, p_name text, p_category text, p_section text, p_by text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_code text;
  v_id uuid;
  v_number text;
  v_by text := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'staff');
begin
  if not coalesce(public.can_results('org-federation'), false) then
    raise exception 'Not authorised';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'A name is required';
  end if;
  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;
  if coalesce(btrim(p_category), '') = '' then
    raise exception 'Choose a category';
  end if;

  v_code := public._new_check_in_code(p_event_id);
  v_number := public.next_player_number(p_event_id);

  insert into public.records (collection, organization_id, event_id, data, check_in_code, checked_in_at, check_in_method)
  values (
    'registrations', v_org, p_event_id,
    jsonb_build_object(
      'fullName', btrim(p_name), 'mobile', '', 'email', '',
      'playerNumber', v_number, 'checkInCode', v_code,
      'preferredDivision', btrim(p_category), 'confirmedDivision', btrim(p_category),
      'status', 'approved', 'paymentStatus', 'complimentary', 'paymentMethod', 'complimentary',
      'amountDue', 0, 'discountAmount', 0, 'currency', 'PKR',
      'answers', jsonb_strip_nulls(jsonb_build_object('section', nullif(btrim(coalesce(p_section, '')), ''))),
      'source', 'manager', 'addedBy', v_by
    ),
    v_code, now(), 'staff_manual'
  )
  returning id into v_id;

  perform public.write_audit_log(v_org, p_event_id, v_by, 'add-student',
    jsonb_build_object('name', btrim(p_name), 'category', p_category, 'section', p_section));
  return v_id;
end $$;

create or replace function public.staff_update_student(
  p_record_id uuid, p_name text, p_category text, p_section text, p_by text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_event text;
  v_by text := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'staff');
begin
  if not coalesce(public.can_results('org-federation'), false) then
    raise exception 'Not authorised';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'A name is required';
  end if;
  if coalesce(btrim(p_category), '') = '' then
    raise exception 'Choose a category';
  end if;

  select organization_id, event_id into v_org, v_event
  from public.records where id = p_record_id and collection = 'registrations';
  if v_org is null then
    raise exception 'Unknown student';
  end if;

  update public.records
  set data = jsonb_set(
        (data || jsonb_build_object(
          'fullName', btrim(p_name),
          'preferredDivision', btrim(p_category),
          'confirmedDivision', btrim(p_category))),
        '{answers}',
        (coalesce(data -> 'answers', '{}'::jsonb) - 'section')
          || jsonb_strip_nulls(jsonb_build_object('section', nullif(btrim(coalesce(p_section, '')), ''))),
        true)
  where id = p_record_id;

  perform public.write_audit_log(v_org, v_event, v_by, 'update-student',
    jsonb_build_object('id', p_record_id, 'name', btrim(p_name), 'category', p_category, 'section', p_section));
  return true;
end $$;

-- A student with games cannot be deleted: the games are the record of who played whom.
create or replace function public.staff_delete_student(p_record_id uuid, p_by text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_event text;
  v_name text;
  v_by text := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'staff');
begin
  if not coalesce(public.can_results('org-federation'), false) then
    raise exception 'Not authorised';
  end if;

  select organization_id, event_id, data ->> 'fullName' into v_org, v_event, v_name
  from public.records where id = p_record_id and collection = 'registrations';
  if v_org is null then
    raise exception 'Unknown student';
  end if;

  if exists (select 1 from public.games where player_a = p_record_id or player_b = p_record_id) then
    raise exception 'This student already has games. Clear their rounds first, then delete them.';
  end if;
  if exists (select 1 from public.certificates where recipient_id = p_record_id) then
    raise exception 'This student has a certificate. Withdraw it first, then delete them.';
  end if;

  delete from public.roster_entries where player_id = p_record_id;
  delete from public.external_player_mappings where record_id = p_record_id;
  delete from public.records where id = p_record_id;

  perform public.write_audit_log(v_org, v_event, v_by, 'delete-student', jsonb_build_object('name', v_name));
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Deleting an event, and everything that belongs to it. Directors only.
create or replace function public.staff_delete_event(p_event_id text, p_by text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_name text;
  v_by text := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'staff');
begin
  if not coalesce(public.is_director('org-federation'), false) then
    raise exception 'Not authorised';
  end if;

  select organization_id, name into v_org, v_name from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'payment-proofs' and split_part(name, '/', 1) = p_event_id;

  delete from public.games where event_id = p_event_id;
  delete from public.round_snapshots where event_id = p_event_id;
  delete from public.certificates where event_id = p_event_id;
  delete from public.records where event_id = p_event_id;
  delete from public.events where id = p_event_id;

  -- Written after the delete, against no event: the log of what was removed outlives it.
  perform public.write_audit_log(v_org, null, v_by, 'delete-event',
    jsonb_build_object('id', p_event_id, 'name', v_name));
  return true;
end $$;

revoke all on function public.staff_add_student(text, text, text, text, text) from public, anon;
revoke all on function public.staff_update_student(uuid, text, text, text, text) from public, anon;
revoke all on function public.staff_delete_student(uuid, text) from public, anon;
revoke all on function public.staff_delete_event(text, text) from public, anon;
grant execute on function public.staff_add_student(text, text, text, text, text) to authenticated;
grant execute on function public.staff_update_student(uuid, text, text, text, text) to authenticated;
grant execute on function public.staff_delete_student(uuid, text) to authenticated;
grant execute on function public.staff_delete_event(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Froebel High School: Grade 3 Scrabble, 18 students in three sections, all Beginners.
do $$
declare
  v_ev constant text := 'evt-froebel-high-school';
  v_org text;
  v_row record;
  v_code text;
  v_number text;
begin
  select organization_id into v_org from public.events where id = v_ev;
  if v_org is null then
    raise notice 'Froebel High School is not in this database; nothing to set up.';
    return;
  end if;

  if exists (select 1 from public.records where event_id = v_ev and collection = 'registrations') then
    raise notice 'Froebel High School already has students; leaving them alone.';
    return;
  end if;

  update public.events
  set name = 'Froebel High School: Grade 3 Scrabble',
      data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
        'categories', jsonb_build_array(
          jsonb_build_object('id', 'beginner', 'name', 'Beginner', 'shortName', 'BEG', 'accent', 'warning')),
        'sections', jsonb_build_array('Section A', 'Section B', 'Section C'),
        'pairWithinSections', true,
        'rounds', 3,
        'pairingSystem', 'swiss'),
      updated_at = now()
  where id = v_ev;

  for v_row in
    select * from (values
      ('Section A', 1, 'Rania'), ('Section A', 2, 'Prachi'), ('Section A', 3, 'Khizer'),
      ('Section A', 4, 'Zoya'), ('Section A', 5, 'Aiza'), ('Section A', 6, 'Izhan'),
      ('Section B', 1, 'Ismail'), ('Section B', 2, 'Shanoor'), ('Section B', 3, 'Sakina'),
      ('Section B', 4, 'Zoya'), ('Section B', 5, 'Zunaira'), ('Section B', 6, 'Amina'),
      ('Section C', 1, 'Mehrbano'), ('Section C', 2, 'Huda'), ('Section C', 3, 'Zimmal'),
      ('Section C', 4, 'Shazain'), ('Section C', 5, 'Menaal'), ('Section C', 6, 'Ahmed')
    ) as s(section, n, name)
    order by section, n
  loop
    v_code := public._new_check_in_code(v_ev);
    v_number := public.next_player_number(v_ev);
    insert into public.records (collection, organization_id, event_id, data, check_in_code, checked_in_at, check_in_method)
    values (
      'registrations', v_org, v_ev,
      jsonb_build_object(
        'fullName', v_row.name, 'mobile', '', 'email', '',
        'playerNumber', v_number, 'checkInCode', v_code,
        'preferredDivision', 'beginner', 'confirmedDivision', 'beginner',
        'status', 'approved', 'paymentStatus', 'complimentary', 'paymentMethod', 'complimentary',
        'amountDue', 0, 'discountAmount', 0, 'currency', 'PKR',
        'answers', jsonb_build_object('section', v_row.section),
        'source', 'manager', 'addedBy', 'Migration 0100'),
      v_code, now(), 'staff_manual');
  end loop;

  if (select count(*) from public.records where event_id = v_ev and collection = 'registrations') <> 18 then
    raise exception 'Froebel High School should have 18 students';
  end if;
end $$;
