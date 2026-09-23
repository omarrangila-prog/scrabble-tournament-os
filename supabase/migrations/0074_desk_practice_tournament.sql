-- A practice tournament, so the desk can be trained without touching a real one.
--
-- The desk volunteer arrives on the morning and learns the software on live registrations,
-- which means their first undo, their first walk-in and their first miscategorised player all
-- happen to somebody who actually paid. This is a place to get those wrong.
--
-- Marked as a test event in the row itself, not merely by its name. Anything that sends —
-- confirmations, certificates, payment notices — can ask the database whether this event is
-- real, rather than relying on nobody having renamed it.

alter table public.events
  add column if not exists is_test boolean not null default false;

comment on column public.events.is_test is
  'True for training and rehearsal events. Nothing that reaches a participant may fire for these.';

-- ---------------------------------------------------------------------------
-- Is this event safe to send from? One question, asked in one place.

create or replace function public.event_is_test(p_event_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_test from public.events where id = p_event_id), false);
$$;

revoke all on function public.event_is_test(text) from public, anon;
grant execute on function public.event_is_test(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- The event itself.

insert into public.events (id, organization_id, slug, name, subtitle, state, visibility, status, is_test, data)
values (
  'evt-desk-practice', 'org-federation', 'desk-practice',
  'Desk Practice Tournament',
  'Training only — nothing here is a real registration',
  'check-in-open',
  /* Private: a training event on the public site would take real registrations. */
  'private',
  'active',
  true,
  jsonb_build_object(
    'startDate', '2026-09-20', 'startTime', '16:00', 'endTime', '21:00',
    'venueName', 'Training room', 'city', 'Karachi',
    'fee', 0, 'currency', 'PKR', 'rounds', 5, 'roundMinutes', 20,
    'categories', jsonb_build_array(
      jsonb_build_object('id','beginner','name','Beginner / Newcomer','shortName','NEW','accent','warning'),
      jsonb_build_object('id','recreational','name','Recreational / Intermediate','shortName','REC','accent','success'),
      jsonb_build_object('id','advanced','name','Regular / Advanced','shortName','ADV','accent','secondary'),
      jsonb_build_object('id','masters','name','Masters','shortName','MST','accent','primary')),
    'tablePlan', jsonb_build_array(
      jsonb_build_object('division','beginner','from',1,'to',9),
      jsonb_build_object('division','recreational','from',10,'to',16),
      jsonb_build_object('division','advanced','from',17,'to',25),
      jsonb_build_object('division','masters','from',26,'to',30))
  ))
on conflict (id) do update
  set is_test = true,
      data = excluded.data,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Forty players: ten in each category, nobody checked in.
--
-- Rebuilt from scratch every time this runs, so re-applying the migration is the same as
-- resetting the practice event.

create or replace function public.seed_desk_practice()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_names text[] := array[
    'Ayesha Khan','Bilal Ahmed','Fatima Noor','Hamza Iqbal','Iqra Shah',
    'Junaid Malik','Kiran Baig','Laiba Farooq','Mohsin Raza','Nida Aslam',
    'Omar Siddiqui','Parisa Jamil','Qasim Butt','Rabia Hussain','Saad Mirza',
    'Tania Qureshi','Usman Tariq','Vania Haider','Waqar Younis','Xenia Ali',
    'Yasir Nawaz','Zara Sheikh','Adeel Anwar','Beenish Kamal','Casim Rauf',
    'Danish Sabir','Erum Zaidi','Faraz Habib','Ghazala Amin','Hassan Javed',
    'Imran Sultan','Jaweria Rizvi','Kamran Aziz','Lubna Saeed','Moiz Akhtar',
    'Nashit Bhatti','Obaid Rehman','Pakeeza Gill','Qurat Ul Ain','Rizwan Dar'
  ];
  v_divisions text[] := array['beginner','recreational','advanced','masters'];
  v_division text;
  v_i integer;
  v_n integer := 0;
  v_code text;
begin
  /*
   * A director through the app, or anybody holding a direct database connection.
   *
   * `auth.uid()` is null outside a web request, which is how this migration seeds the event
   * in the first place. Refusing there would mean the function could never run at install
   * time; and a direct connection already has more authority than this function grants.
   */
  if auth.uid() is not null and not public.is_director('org-federation') then
    raise exception 'Not authorised';
  end if;

  delete from public.games where event_id = 'evt-desk-practice';
  delete from public.roster_entries where event_id = 'evt-desk-practice';
  delete from public.records where event_id = 'evt-desk-practice';

  for v_i in 1 .. 40 loop
    v_division := v_divisions[((v_i - 1) / 10) + 1];
    v_n := v_n + 1;
    /* Predictable codes: this is a training event, and a trainer needs to be able to read one out. */
    v_code := lpad((900000 + v_i)::text, 6, '0');

    insert into public.records (collection, organization_id, event_id, check_in_code, status, data)
    values ('registrations', 'org-federation', 'evt-desk-practice', v_code, 'active',
      jsonb_build_object(
        'id', 'practice-' || v_i,
        'fullName', v_names[v_i],
        'mobile', '0300' || lpad(v_i::text, 7, '0'),
        'email', '', 'city', 'Karachi', 'club', 'Unaffiliated',
        'token', 'PRACTICE' || lpad(v_i::text, 4, '0'),
        'checkInCode', v_code,
        'playerNumber', (100 + v_i)::text,
        'eventId', 'evt-desk-practice',
        'status', 'submitted',
        'preferredDivision', v_division,
        'experience', 'New to competition',
        'participationTrack', 'speed_scrabble',
        'currency', 'PKR',
        'amountDue', 0, 'discountAmount', 0,
        'paymentMethod', 'cash',
        /* A spread of payment states, because the desk has to practise all of them. */
        'paymentStatus', (array['verified','cash-at-venue','review-required','complimentary'])[((v_i - 1) % 4) + 1],
        'submittedAt', now(),
        'answers', jsonb_build_object('age', (12 + (v_i % 50))::text),
        'source', 'practice-seed'
      ));
  end loop;

  /* Nobody has arrived. That is the whole point of a check-in rehearsal. */
  update public.records set checked_in_at = null where event_id = 'evt-desk-practice';

  perform public.write_audit_log(
    'org-federation', 'evt-desk-practice', 'system', 'reset-practice-tournament',
    jsonb_build_object('players', v_n));

  return v_n;
end $$;

revoke all on function public.seed_desk_practice() from public, anon;
grant execute on function public.seed_desk_practice() to authenticated;

-- ---------------------------------------------------------------------------
-- Resetting is seeding: everybody back to not-arrived, practice walk-ins and rounds gone.

create or replace function public.staff_reset_practice_tournament(p_by text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_director('org-federation') then
    raise exception 'Not authorised';
  end if;

  v_count := public.seed_desk_practice();

  update public.events
  set state = 'check-in-open', updated_at = now()
  where id = 'evt-desk-practice';

  perform public.write_audit_log(
    'org-federation', 'evt-desk-practice',
    coalesce(nullif(btrim(coalesce(p_by, '')), ''), 'unknown'),
    'reset-practice-tournament', jsonb_build_object('players', v_count));

  return v_count;
end $$;

revoke all on function public.staff_reset_practice_tournament(text) from public, anon;
grant execute on function public.staff_reset_practice_tournament(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed it now, as the director applying this migration.

select public.seed_desk_practice();
