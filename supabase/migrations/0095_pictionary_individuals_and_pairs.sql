-- Speed Pictionary, as the organiser now describes it.
--
-- The first version (0094) was a team of up to four paying PKR 1,400 each. The sign-up is now
-- for young players aged 13 to 23, either alone (PKR 1,250) or as a pair (PKR 2,000 for both),
-- lunch included, with spots limited and a cash prize for the winning team.
--
-- The collection stays `pictionaryTeams` and so does everything that keeps it out of the Scrabble
-- draw. What changes is what an entry is and what the database refuses:
--
--   * An entry is one person or two. It stores `entryType`, the names in `players`, and the ages in
--     `ages`, one for each name, in the same order.
--   * Spots are counted in people, not in entries. A pair uses two, so "limited spots" cannot be
--     oversold by pairs the way a count of rows would allow.
--   * The age limit and the price are enforced here as well as on the form. A form is a courtesy;
--     anybody can post to the API directly, and an age limit that only the browser checks is not
--     one. Nobody under 13 or over 23 gets in, and the amount owed must be the published price.
--
-- Nothing has been registered yet (the table is empty), so no stored entry needs converting.

-- ---------------------------------------------------------------------------
-- The event's settings.
update public.events
set data = (data - 'maxTeams' - 'teamSize')
    || jsonb_build_object(
         'fee', 1250,
         'individualFee', 1250,
         'teamFee', 2000,
         'teamOf', 2,
         'ageMin', 13,
         'ageMax', 23,
         'maxPlayers', 32,
         'prizes', jsonb_build_array(
           jsonb_build_object('place', 'Winning team', 'award', 'Rs. 2,500')
         )
       ),
    updated_at = now()
where id = 'evt-pictionary-22-nov-2026';

-- ---------------------------------------------------------------------------
-- What an entry may be, and how many people it brings.
create or replace function public.enforce_team_places()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event jsonb;
  v_max integer;
  v_taken integer;
  v_type text := new.data ->> 'entryType';
  v_names jsonb := coalesce(new.data -> 'players', '[]'::jsonb);
  v_ages jsonb := coalesce(new.data -> 'ages', '[]'::jsonb);
  v_count integer;
  v_min_age integer;
  v_max_age integer;
  v_age jsonb;
  v_expected numeric;
begin
  if new.collection <> 'pictionaryTeams' or new.event_id is null then
    return new;
  end if;

  select e.data into v_event from public.events e where e.id = new.event_id;
  if v_event is null then
    return new;
  end if;

  /* ---- Shape: one person or two, and an age for every name ----------------------------- */
  if jsonb_typeof(v_names) <> 'array' or jsonb_typeof(v_ages) <> 'array' then
    raise exception 'The entry needs its players and their ages';
  end if;
  v_count := jsonb_array_length(v_names);

  if v_type not in ('individual', 'team') then
    raise exception 'The entry must be an individual or a team of two';
  end if;
  if (v_type = 'individual' and v_count <> 1) or (v_type = 'team' and v_count <> coalesce(nullif(v_event ->> 'teamOf', '')::int, 2)) then
    raise exception 'That entry has the wrong number of players for its type';
  end if;
  if jsonb_array_length(v_ages) <> v_count then
    raise exception 'Every player needs an age';
  end if;
  if exists (select 1 from jsonb_array_elements_text(v_names) n where btrim(n) = '') then
    raise exception 'Every player needs a name';
  end if;

  /* ---- The age limit -------------------------------------------------------------------- */
  v_min_age := nullif(v_event ->> 'ageMin', '')::int;
  v_max_age := nullif(v_event ->> 'ageMax', '')::int;
  for v_age in select * from jsonb_array_elements(v_ages) loop
    if jsonb_typeof(v_age) <> 'number' or (v_age #>> '{}')::numeric <> trunc((v_age #>> '{}')::numeric) then
      raise exception 'Ages must be whole numbers';
    end if;
    if v_min_age is not null and (v_age #>> '{}')::int < v_min_age then
      raise exception 'Players must be between % and % years old', v_min_age, v_max_age;
    end if;
    if v_max_age is not null and (v_age #>> '{}')::int > v_max_age then
      raise exception 'Players must be between % and % years old', v_min_age, v_max_age;
    end if;
  end loop;

  /* ---- The price is the published price ------------------------------------------------- */
  v_expected := case v_type
    when 'individual' then nullif(v_event ->> 'individualFee', '')::numeric
    else nullif(v_event ->> 'teamFee', '')::numeric
  end;
  if v_expected is not null and coalesce((new.data ->> 'amountDue')::numeric, -1) <> v_expected then
    raise exception 'The amount does not match the price for this entry';
  end if;

  /* ---- Spots, counted in people ---------------------------------------------------------- */
  v_max := nullif(v_event ->> 'maxPlayers', '')::int;
  if v_max is not null then
    perform pg_advisory_xact_lock(hashtext('pictionaryTeams:' || new.event_id));

    select coalesce(sum(jsonb_array_length(coalesce(r.data -> 'players', '[]'::jsonb))), 0)::int
    into v_taken
    from public.records r
    where r.event_id = new.event_id and r.collection = 'pictionaryTeams' and r.status = 'active';

    if v_taken >= v_max then
      raise exception 'All % spots are taken', v_max;
    end if;
    if v_taken + v_count > v_max then
      raise exception 'Only % spot% left, which is not enough for a team of two. Please register as an individual.',
        v_max - v_taken, case when v_max - v_taken = 1 then ' is' else 's are' end;
    end if;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Spots taken, in people. Safe for anybody: a number and nothing else.
create or replace function public.pictionary_spots_taken(p_slug text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(jsonb_array_length(coalesce(r.data -> 'players', '[]'::jsonb))), 0)::int
  from public.records r
  join public.events e on e.id = r.event_id
  where e.slug = p_slug
    and e.visibility = 'public'
    and e.status = 'active'
    and r.collection = 'pictionaryTeams'
    and r.status = 'active';
$$;

revoke all on function public.pictionary_spots_taken(text) from public;
grant execute on function public.pictionary_spots_taken(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The staff actions name the entry by its first player now that there is no team name.
create or replace function public.staff_set_team_payment(
  p_id uuid,
  p_paid boolean,
  p_by text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.records%rowtype;
  v_by text := coalesce(nullif(btrim(coalesce(p_by, '')), ''), 'desk');
begin
  if not public.can_desk('org-federation') then
    raise exception 'Not authorised';
  end if;

  select * into v_row from public.records
  where id = p_id and collection = 'pictionaryTeams' and status = 'active';
  if not found then
    raise exception 'That entry could not be found';
  end if;

  if p_paid then
    update public.records
    set data = data || jsonb_build_object(
          'paymentStatus', 'verified',
          'verifiedBy', v_by,
          'verifiedAt', now(),
          'paymentNote', 'Marked paid by ' || v_by || '.'),
        updated_at = now()
    where id = p_id;
  else
    update public.records
    set data = (data - 'autoVerified' - 'verifiedBy' - 'verifiedAt' - 'paymentNote')
          || jsonb_build_object('paymentStatus',
               case when data ->> 'payment' = 'cash' then 'cash-at-venue' else 'receipt-uploaded' end),
        updated_at = now()
    where id = p_id;
  end if;

  perform public.write_audit_log(
    v_row.organization_id, v_row.event_id, v_by,
    case when p_paid then 'pictionary-marked-paid' else 'pictionary-marked-unpaid' end,
    jsonb_build_object('entry', v_row.data -> 'players', 'account', public.current_staff_email()));

  return true;
end $$;

revoke all on function public.staff_set_team_payment(uuid, boolean, text) from public, anon;
grant execute on function public.staff_set_team_payment(uuid, boolean, text) to authenticated;

create or replace function public.staff_remove_team(p_id uuid, p_by text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.records%rowtype;
  v_by text := coalesce(nullif(btrim(coalesce(p_by, '')), ''), 'desk');
begin
  if not public.can_desk('org-federation') then
    raise exception 'Not authorised';
  end if;

  select * into v_row from public.records
  where id = p_id and collection = 'pictionaryTeams' and status = 'active';
  if not found then
    raise exception 'That entry could not be found';
  end if;

  update public.records set status = 'deleted', updated_at = now() where id = p_id;

  perform public.write_audit_log(
    v_row.organization_id, v_row.event_id, v_by, 'pictionary-entry-removed',
    jsonb_build_object('entry', v_row.data -> 'players', 'account', public.current_staff_email()));

  return true;
end $$;

revoke all on function public.staff_remove_team(uuid, text) from public, anon;
grant execute on function public.staff_remove_team(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Proof, rather than assumption. Written as an anonymous visitor writes, so the policy and the
-- trigger are what approve or refuse each row.
do $$
declare
  v_ev text := 'evt-pictionary-22-nov-2026';
  v_refused text;
  v_before int;
  i int;
begin
  if (select count(*) from public.records where collection = 'pictionaryTeams' and status = 'active') <> 0 then
    raise notice 'entries already exist; skipping the capacity probe so real entries are not disturbed';
    return;
  end if;

  v_before := public.pictionary_spots_taken('pictionary');
  if v_before <> 0 then raise exception 'spots taken should start at zero, got %', v_before; end if;

  set local role anon;

  /* A valid individual, a valid pair, and the edges of the age range are accepted. */
  insert into public.records (collection, organization_id, event_id, data, status)
  values ('pictionaryTeams', 'org-federation', v_ev,
    jsonb_build_object('entryType', 'individual', 'players', jsonb_build_array('Probe One'),
      'ages', jsonb_build_array(13), 'amountDue', 1250, 'paymentStatus', 'cash-at-venue', 'payment', 'cash'), 'active');
  insert into public.records (collection, organization_id, event_id, data, status)
  values ('pictionaryTeams', 'org-federation', v_ev,
    jsonb_build_object('entryType', 'team', 'players', jsonb_build_array('Probe Two', 'Probe Three'),
      'ages', jsonb_build_array(23, 18), 'amountDue', 2000, 'paymentStatus', 'cash-at-venue', 'payment', 'cash'), 'active');
  reset role;

  if public.pictionary_spots_taken('pictionary') <> 3 then
    raise exception 'one individual and one pair should be 3 spots, got %', public.pictionary_spots_taken('pictionary');
  end if;

  /* Refusals: too young, too old, wrong price, wrong shape, a missing age. */
  set local role anon;
  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('pictionaryTeams', 'org-federation', v_ev,
      jsonb_build_object('entryType', 'individual', 'players', jsonb_build_array('Too Young'),
        'ages', jsonb_build_array(12), 'amountDue', 1250, 'paymentStatus', 'cash-at-venue'), 'active');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like '%between 13 and 23%' then raise exception 'age 12 was not refused: %', v_refused; end if;

  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('pictionaryTeams', 'org-federation', v_ev,
      jsonb_build_object('entryType', 'team', 'players', jsonb_build_array('Ok Age', 'Too Old'),
        'ages', jsonb_build_array(20, 24), 'amountDue', 2000, 'paymentStatus', 'cash-at-venue'), 'active');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like '%between 13 and 23%' then raise exception 'age 24 in a pair was not refused: %', v_refused; end if;

  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('pictionaryTeams', 'org-federation', v_ev,
      jsonb_build_object('entryType', 'individual', 'players', jsonb_build_array('Cheap'),
        'ages', jsonb_build_array(20), 'amountDue', 100, 'paymentStatus', 'cash-at-venue'), 'active');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like '%does not match the price%' then raise exception 'a wrong price was not refused: %', v_refused; end if;

  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('pictionaryTeams', 'org-federation', v_ev,
      jsonb_build_object('entryType', 'team', 'players', jsonb_build_array('Alone'),
        'ages', jsonb_build_array(20), 'amountDue', 2000, 'paymentStatus', 'cash-at-venue'), 'active');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like '%wrong number of players%' then raise exception 'a pair of one was not refused: %', v_refused; end if;

  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('pictionaryTeams', 'org-federation', v_ev,
      jsonb_build_object('entryType', 'individual', 'players', jsonb_build_array('No Age'),
        'ages', jsonb_build_array(), 'amountDue', 1250, 'paymentStatus', 'cash-at-venue'), 'active');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like '%needs an age%' then raise exception 'a missing age was not refused: %', v_refused; end if;
  reset role;

  /* Capacity, in people: fill to 31, then a pair is refused with a clear reason and a single fits. */
  for i in 1 .. 14 loop
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('pictionaryTeams', 'org-federation', v_ev,
      jsonb_build_object('entryType', 'team', 'players', jsonb_build_array('Fill A ' || i, 'Fill B ' || i),
        'ages', jsonb_build_array(20, 20), 'amountDue', 2000, 'paymentStatus', 'cash-at-venue'), 'active');
  end loop;
  /* 3 + 28 = 31 */
  if public.pictionary_spots_taken('pictionary') <> 31 then
    raise exception 'expected 31 spots taken, got %', public.pictionary_spots_taken('pictionary');
  end if;

  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('pictionaryTeams', 'org-federation', v_ev,
      jsonb_build_object('entryType', 'team', 'players', jsonb_build_array('Late A', 'Late B'),
        'ages', jsonb_build_array(20, 20), 'amountDue', 2000, 'paymentStatus', 'cash-at-venue'), 'active');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like 'Only 1 spot is left%' then raise exception 'a pair into one spot was not refused clearly: %', v_refused; end if;

  insert into public.records (collection, organization_id, event_id, data, status)
  values ('pictionaryTeams', 'org-federation', v_ev,
    jsonb_build_object('entryType', 'individual', 'players', jsonb_build_array('Last One'),
      'ages', jsonb_build_array(20), 'amountDue', 1250, 'paymentStatus', 'cash-at-venue'), 'active');

  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('pictionaryTeams', 'org-federation', v_ev,
      jsonb_build_object('entryType', 'individual', 'players', jsonb_build_array('Over'),
        'ages', jsonb_build_array(20), 'amountDue', 1250, 'paymentStatus', 'cash-at-venue'), 'active');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like 'All 32 spots are taken%' then raise exception 'a 33rd spot was not refused: %', v_refused; end if;

  /* Removing an entry gives its spots back. */
  update public.records set status = 'deleted'
  where collection = 'pictionaryTeams' and data -> 'players' ->> 0 = 'Fill A 1';
  if public.pictionary_spots_taken('pictionary') <> 30 then
    raise exception 'removing a pair should free two spots, got %', public.pictionary_spots_taken('pictionary');
  end if;

  /* Nothing under this event reached the Scrabble draw. */
  if exists (select 1 from public.records where collection = 'registrations' and event_id = v_ev) then
    raise exception 'an entry is being counted as a Scrabble registration';
  end if;

  delete from public.records where collection = 'pictionaryTeams' and event_id = v_ev;
end $$;
