-- Public live data, and a way to bring pairings and results in from another system.
--
-- Three things, kept together because each leans on the next:
--
--   1. What the public may read. A registration feed that returns only the columns an
--      organiser has chosen, and every game of an event with player names and nothing else.
--   2. How the public page learns something changed. Anonymous callers cannot subscribe to
--      table changes — row-level security hides `games` and `records` from them, which is
--      correct — so the database sends a ping carrying no data at all, and the page re-asks
--      the safe functions above. A ping cannot leak what it does not contain.
--   3. Importing from an outside source. Where sources are kept, how an outside player name is
--      mapped to a registration, and one function that applies a whole imported round or none
--      of it.
--
-- Nothing here changes an existing function or table. The one place this touches a hot path is
-- the two ping triggers, and they are written to be unable to fail a registration or a score.

-- ===========================================================================
-- 1. The live ping
-- ===========================================================================

create or replace function public.ping_event_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
begin
  v_event := coalesce(new.event_id, old.event_id);
  if v_event is null then
    return null;
  end if;

  begin
    -- Public channel, payload is a timestamp and nothing else. The page uses it only as a
    -- reason to ask again, so there is nothing in it to protect.
    perform realtime.send(
      jsonb_build_object('at', clock_timestamp()),
      'changed',
      'event:' || v_event,
      false
    );
  exception when others then
    -- A broadcast that fails must never fail the thing that caused it. A registration or a
    -- score is the record; the ping is a courtesy, and the page polls as a fallback anyway.
    null;
  end;

  return null;
end $$;

revoke all on function public.ping_event_changed() from public, anon, authenticated;

drop trigger if exists ping_games_changed on public.games;
create trigger ping_games_changed
  after insert or update or delete on public.games
  for each row execute function public.ping_event_changed();

drop trigger if exists ping_registrations_changed on public.records;
create trigger ping_registrations_changed
  after insert or update on public.records
  for each row
  when (new.collection = 'registrations')
  execute function public.ping_event_changed();

-- ===========================================================================
-- 2. The public registration feed
-- ===========================================================================

/*
 * Every column an organiser may expose, in one place. Anything not named here cannot be
 * published whatever a stored setting says: payment proofs, notes, internal ids and the
 * check-in code are absent on purpose, so a malformed or hostile setting has nothing private to
 * select. `phone` and `email` are here only because the organiser's brief allows a deliberate,
 * controlled export; they are never part of the default set.
 */
create or replace function public.public_registration_columns()
returns text[]
language sql
immutable
as $$
  select array[
    'registrationNumber', 'name', 'age', 'category', 'checkInStatus', 'paymentStatus',
    'registeredAt', 'activity', 'phone', 'email'
  ];
$$;

create or replace function public.public_registration_default_columns()
returns text[]
language sql
immutable
as $$
  select array[
    'registrationNumber', 'name', 'age', 'category', 'checkInStatus', 'paymentStatus',
    'registeredAt'
  ];
$$;

create or replace function public.public_registrations(p_slug text)
returns table (
  out_event_id text,
  out_event_name text,
  out_columns jsonb,
  out_rows jsonb,
  out_total integer,
  out_updated_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_cols text[];
  v_enabled boolean;
begin
  select * into v_event
  from public.events e
  where lower(btrim(e.slug)) = lower(btrim(p_slug))
    and e.visibility = 'public'
    and e.status = 'active';

  if not found then
    return;
  end if;

  v_enabled := coalesce((v_event.data -> 'publicRegistrations' ->> 'enabled')::boolean, true);
  if not v_enabled then
    return;
  end if;

  -- The stored choice, kept in the order it was stored, and cut down to the allowed list so a
  -- stale or tampered setting cannot widen what is exposed.
  select coalesce(array_agg(t.c order by t.ord), public.public_registration_default_columns())
    into v_cols
  from jsonb_array_elements_text(
         coalesce(v_event.data -> 'publicRegistrations' -> 'columns', '[]'::jsonb)
       ) with ordinality as t(c, ord)
  where t.c = any (public.public_registration_columns());

  return query
  with entries as (
    select
      r.created_at,
      r.updated_at,
      jsonb_build_object(
        'registrationNumber', coalesce(r.data ->> 'playerNumber', ''),
        'name', btrim(coalesce(r.data ->> 'fullName', '')),
        'age', coalesce(r.data -> 'answers' ->> 'age', r.data ->> 'age', ''),
        'category',
          case when r.data -> 'answers' ->> 'activityKey' = 'painting' then 'painting'
               else coalesce(r.data ->> 'preferredDivision', '') end,
        'checkInStatus',
          case when r.checked_in_at is not null then 'Checked in' else 'Not checked in' end,
        'paymentStatus',
          case coalesce(r.data ->> 'paymentStatus', '')
            when 'verified' then 'Paid'
            when 'complimentary' then 'Complimentary'
            when 'receipt-uploaded' then 'Receipt received'
            when 'cash-at-venue' then 'Pay at venue'
            when 'refunded' then 'Refunded'
            when 'rejected' then 'Not accepted'
            else 'Unpaid'
          end,
        'registeredAt', to_char(r.created_at at time zone 'Asia/Karachi', 'YYYY-MM-DD HH24:MI'),
        'activity', coalesce(r.data -> 'answers' ->> 'activity', ''),
        'phone', coalesce(r.data ->> 'mobile', ''),
        'email', coalesce(r.data ->> 'email', '')
      ) as everything,
      case when (r.data ->> 'playerNumber') ~ '^[0-9]+$'
           then (r.data ->> 'playerNumber')::integer end as number
    from public.records r
    where r.collection = 'registrations'
      and r.event_id = v_event.id
      and r.status = 'active'
      and btrim(coalesce(r.data ->> 'fullName', '')) <> ''
  )
  select
    v_event.id,
    v_event.name,
    to_jsonb(v_cols),
    coalesce(
      jsonb_agg(
        (select jsonb_object_agg(k, e.everything -> k) from unnest(v_cols) as k)
        order by e.number nulls last, e.created_at
      ),
      '[]'::jsonb
    ),
    count(*)::integer,
    coalesce(max(greatest(e.created_at, e.updated_at)), v_event.updated_at)
  from entries e;
end $$;

revoke all on function public.public_registrations(text) from public;
grant execute on function public.public_registrations(text) to anon, authenticated;

-- Chosen by a director, because what a public link reveals about people is theirs to decide.
create or replace function public.staff_set_public_registration_settings(
  p_event_id text,
  p_enabled boolean,
  p_columns text[],
  p_by text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
begin
  if public.staff_role('org-federation') <> 'director' then
    raise exception 'Only a director may change what the public link shows';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  if p_columns is null or array_length(p_columns, 1) is null then
    raise exception 'Choose at least one column';
  end if;

  if exists (select 1 from unnest(p_columns) c where c <> all (public.public_registration_columns())) then
    raise exception 'One of those columns cannot be made public';
  end if;

  update public.events
  set data = jsonb_set(
        coalesce(data, '{}'::jsonb),
        '{publicRegistrations}',
        jsonb_build_object('enabled', coalesce(p_enabled, true), 'columns', to_jsonb(p_columns))
      )
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(btrim(p_by), ''), public.current_staff_email(), 'unknown'),
    'set-public-registration-columns',
    jsonb_build_object('enabled', coalesce(p_enabled, true), 'columns', to_jsonb(p_columns))
  );

  return true;
end $$;

revoke all on function public.staff_set_public_registration_settings(text, boolean, text[], text)
  from public, anon;
grant execute on function public.staff_set_public_registration_settings(text, boolean, text[], text)
  to authenticated;

-- ===========================================================================
-- 3. Every game of an event, for the public results page
-- ===========================================================================

/*
 * The same facts `event_round_boards` already serves one round at a time — table, division,
 * two names, two scores — for every round at once, so the page can show a round selector and
 * work standings out through any round without a request per round. No ids, no contact
 * details: a name and a number is all a results board has ever shown.
 */
create or replace function public.event_public_games(p_event_id text)
returns table (
  out_round integer,
  out_board integer,
  out_division text,
  out_player_a text,
  out_player_b text,
  out_score_a integer,
  out_score_b integer,
  out_status text,
  out_a_first boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.round,
    g.board,
    g.division,
    btrim(coalesce(ra.data ->> 'fullName', '')),
    case when g.player_b is null then null else btrim(coalesce(rb.data ->> 'fullName', '')) end,
    g.score_a,
    g.score_b,
    g.status,
    g.a_plays_first
  from public.games g
  join public.records ra on ra.id = g.player_a
  left join public.records rb on rb.id = g.player_b
  where g.event_id = p_event_id
  order by g.round, g.board;
$$;

revoke all on function public.event_public_games(text) from public;
grant execute on function public.event_public_games(text) to anon, authenticated;

-- ===========================================================================
-- 4. External sources and player mappings
-- ===========================================================================

create table if not exists public.external_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  event_id text not null references public.events (id) on delete cascade,
  /* Null means one address that holds every round. */
  round_number integer check (round_number is null or round_number > 0),
  url text not null check (url ~* '^https?://'),
  source_type text not null default 'auto'
    check (source_type in ('auto', 'csv', 'html', 'json')),
  /* Seconds between automatic checks. Zero is manual. */
  sync_interval_seconds integer not null default 0
    check (sync_interval_seconds in (0, 30, 60, 300)),
  last_synced_at timestamp with time zone,
  last_attempt_at timestamp with time zone,
  sync_status text not null default 'never'
    check (sync_status in ('never', 'ok', 'changes', 'error')),
  last_error text,
  /* A digest of what was last read, so an unchanged source is recognised without a diff. */
  last_fingerprint text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists external_sources_event_idx on public.external_sources (event_id);

create table if not exists public.external_player_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  event_id text not null references public.events (id) on delete cascade,
  /* The outside player's identity, normalised: a lower-cased name, or `id:<their id>`. */
  external_key text not null,
  external_name text not null,
  record_id uuid not null references public.records (id) on delete cascade,
  confirmed_by text,
  created_at timestamp with time zone not null default now(),
  unique (event_id, external_key)
);

alter table public.external_sources enable row level security;
alter table public.external_player_mappings enable row level security;

-- Staff may read; nobody writes except through the functions below. No anonymous access at all:
-- a source address can carry a token.
drop policy if exists "staff read external sources" on public.external_sources;
create policy "staff read external sources"
  on public.external_sources for select
  using (public.can_results(organization_id));

drop policy if exists "staff read external mappings" on public.external_player_mappings;
create policy "staff read external mappings"
  on public.external_player_mappings for select
  using (public.can_results(organization_id));

revoke all on public.external_sources from anon;
revoke all on public.external_player_mappings from anon;

create or replace function public.staff_save_external_source(
  p_event_id text,
  p_id uuid,
  p_round integer,
  p_url text,
  p_source_type text,
  p_interval integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_id uuid;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  if coalesce(btrim(p_url), '') !~* '^https?://' then
    raise exception 'The address must start with http:// or https://';
  end if;

  if p_id is null then
    insert into public.external_sources
      (organization_id, event_id, round_number, url, source_type, sync_interval_seconds)
    values
      (v_org, p_event_id, p_round, btrim(p_url), coalesce(p_source_type, 'auto'),
       coalesce(p_interval, 0))
    returning id into v_id;
  else
    update public.external_sources
    set round_number = p_round,
        url = btrim(p_url),
        source_type = coalesce(p_source_type, 'auto'),
        sync_interval_seconds = coalesce(p_interval, 0),
        updated_at = now()
    where id = p_id and event_id = p_event_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No such source';
    end if;
  end if;

  return v_id;
end $$;

create or replace function public.staff_delete_external_source(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  delete from public.external_sources where id = p_id;
  return found;
end $$;

create or replace function public.staff_record_source_sync(
  p_id uuid,
  p_status text,
  p_error text,
  p_fingerprint text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  if p_status not in ('ok', 'changes', 'error') then
    raise exception 'Unknown sync status %', p_status;
  end if;

  update public.external_sources
  set last_attempt_at = now(),
      last_synced_at = case when p_status = 'error' then last_synced_at else now() end,
      sync_status = p_status,
      last_error = case when p_status = 'error' then left(coalesce(p_error, ''), 500) else null end,
      last_fingerprint = coalesce(p_fingerprint, last_fingerprint),
      updated_at = now()
  where id = p_id;

  return found;
end $$;

create or replace function public.staff_save_external_mapping(
  p_event_id text,
  p_external_key text,
  p_external_name text,
  p_record_id uuid,
  p_by text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  -- The registration has to be a live one of this very event; a mapping is a statement that two
  -- names are one person, and it must not be able to point at somebody else's record.
  if not exists (
    select 1 from public.records r
    where r.id = p_record_id and r.event_id = p_event_id
      and r.collection = 'registrations' and r.status = 'active'
  ) then
    raise exception 'That registration does not belong to this event';
  end if;

  if coalesce(btrim(p_external_key), '') = '' then
    raise exception 'An outside identity is required';
  end if;

  insert into public.external_player_mappings
    (organization_id, event_id, external_key, external_name, record_id, confirmed_by)
  values
    (v_org, p_event_id, btrim(p_external_key), coalesce(p_external_name, p_external_key),
     p_record_id, nullif(btrim(coalesce(p_by, '')), ''))
  on conflict (event_id, external_key)
  do update set record_id = excluded.record_id,
                external_name = excluded.external_name,
                confirmed_by = excluded.confirmed_by,
                created_at = now();

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(btrim(p_by), ''), 'unknown'), 'confirm-external-mapping',
    jsonb_build_object('externalKey', p_external_key, 'recordId', p_record_id)
  );

  return true;
end $$;

create or replace function public.staff_external_mappings(p_event_id text)
returns table (out_key text, out_name text, out_record_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select m.external_key, m.external_name, m.record_id
  from public.external_player_mappings m
  where m.event_id = p_event_id
    and public.can_results(m.organization_id)
    and exists (select 1 from public.records r where r.id = m.record_id and r.status = 'active');
$$;

create or replace function public.staff_external_sources(p_event_id text)
returns table (
  out_id uuid, out_round integer, out_url text, out_type text, out_interval integer,
  out_last_synced_at timestamp with time zone, out_last_attempt_at timestamp with time zone,
  out_status text, out_error text, out_fingerprint text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.round_number, s.url, s.source_type, s.sync_interval_seconds,
         s.last_synced_at, s.last_attempt_at, s.sync_status, s.last_error, s.last_fingerprint
  from public.external_sources s
  where s.event_id = p_event_id
    and public.can_results(s.organization_id)
  order by s.round_number nulls first, s.created_at;
$$;

revoke all on function public.staff_save_external_source(text, uuid, integer, text, text, integer) from public, anon;
revoke all on function public.staff_delete_external_source(uuid) from public, anon;
revoke all on function public.staff_record_source_sync(uuid, text, text, text) from public, anon;
revoke all on function public.staff_save_external_mapping(text, text, text, uuid, text) from public, anon;
revoke all on function public.staff_external_mappings(text) from public, anon;
revoke all on function public.staff_external_sources(text) from public, anon;
grant execute on function public.staff_save_external_source(text, uuid, integer, text, text, integer) to authenticated;
grant execute on function public.staff_delete_external_source(uuid) to authenticated;
grant execute on function public.staff_record_source_sync(uuid, text, text, text) to authenticated;
grant execute on function public.staff_save_external_mapping(text, text, text, uuid, text) to authenticated;
grant execute on function public.staff_external_mappings(text) to authenticated;
grant execute on function public.staff_external_sources(text) to authenticated;

-- ===========================================================================
-- 5. Applying an imported round, all of it or none of it
-- ===========================================================================

/*
 * `p_matches` is an array of
 *   { board, division, playerA, playerB, aPlaysFirst, scoreA, scoreB }
 * where the players are registration ids the staff member has already confirmed, and the scores
 * are absent for a board with no result yet.
 *
 * It is one function rather than a publish followed by a loop of score entries because the
 * browser cannot make those atomic. A failure halfway through that loop would leave a round
 * published with some of its scores in and the rest not, which is a state nobody can reason
 * about at the table. Here any error rolls the whole import back.
 *
 * The existing functions do the actual work — `staff_publish_round` for the boards, with every
 * rule it enforces (the previous round must be verified, no player twice, the locked roster),
 * and `staff_record_result` for each score, which writes its own audit entry — so an import can
 * never do anything a person at the results table could not.
 *
 * A round that already exists is never re-paired from here. Its boards must match what was
 * imported exactly; what an import may add to it is scores, and a score that already stands and
 * differs is a correction, which is refused unless the caller says so on purpose.
 */
create or replace function public.staff_import_round(
  p_event_id text,
  p_round integer,
  p_matches jsonb,
  p_by text,
  p_apply_corrections boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_existing integer;
  v_boards jsonb;
  m jsonb;
  g public.games;
  v_a uuid;
  v_b uuid;
  v_sa integer;
  v_sb integer;
  v_swap boolean;
  v_published boolean := false;
  v_recorded integer := 0;
  v_corrected integer := 0;
  v_unchanged integer := 0;
  v_pending integer := 0;
  v_conflicts jsonb := '[]'::jsonb;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  if coalesce(btrim(p_by), '') = '' then
    raise exception 'The person applying the import is required';
  end if;

  if p_round is null or p_round < 1 then
    raise exception 'A round number is required';
  end if;

  if jsonb_typeof(p_matches) <> 'array' or jsonb_array_length(p_matches) = 0 then
    raise exception 'There is nothing to import';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  select count(*) into v_existing
  from public.games where event_id = p_event_id and round = p_round;

  if v_existing = 0 then
    select jsonb_agg(jsonb_build_object(
             'board', x -> 'board',
             'division', x -> 'division',
             'playerA', x -> 'playerA',
             'playerB', x -> 'playerB',
             'aPlaysFirst', x -> 'aPlaysFirst'
           ) order by (x ->> 'board')::integer)
      into v_boards
    from jsonb_array_elements(p_matches) as x;

    perform public.staff_publish_round(p_event_id, p_round, v_boards, p_by);
    v_published := true;
  else
    if v_existing <> jsonb_array_length(p_matches) then
      raise exception
        'Round % already has % boards and the import has %. A published round is not re-paired by an import.',
        p_round, v_existing, jsonb_array_length(p_matches);
    end if;

    for m in select * from jsonb_array_elements(p_matches) loop
      select * into g
      from public.games
      where event_id = p_event_id and round = p_round and board = (m ->> 'board')::integer;

      v_a := (m ->> 'playerA')::uuid;
      v_b := nullif(m ->> 'playerB', '')::uuid;

      if not found
         or not ((g.player_a = v_a and g.player_b is not distinct from v_b)
              or (g.player_b is not null and g.player_a = v_b and g.player_b = v_a)) then
        raise exception
          'Board % in round % does not match the pairing already published.',
          m ->> 'board', p_round;
      end if;
    end loop;
  end if;

  for m in select * from jsonb_array_elements(p_matches) loop
    if nullif(m ->> 'scoreA', '') is null then
      v_pending := v_pending + 1;
      continue;
    end if;

    select * into g
    from public.games
    where event_id = p_event_id and round = p_round and board = (m ->> 'board')::integer;

    v_a := (m ->> 'playerA')::uuid;
    v_swap := g.player_b is not null and g.player_a <> v_a;

    -- Scores are given in the imported board's order; the stored game may be seated the other
    -- way round, and a score on the wrong side is a result for the wrong player.
    v_sa := case when v_swap then (m ->> 'scoreB')::integer else (m ->> 'scoreA')::integer end;
    v_sb := case when g.player_b is null then null
                 when v_swap then (m ->> 'scoreA')::integer
                 else (m ->> 'scoreB')::integer end;

    if g.score_a is null then
      perform public.staff_record_result(g.id, v_sa, v_sb, p_by, 'Imported from an outside source');
      v_recorded := v_recorded + 1;
    elsif g.score_a = v_sa and g.score_b is not distinct from v_sb then
      v_unchanged := v_unchanged + 1;
    elsif p_apply_corrections then
      perform public.staff_record_result(g.id, v_sa, v_sb, p_by, 'Corrected from an outside source');
      v_corrected := v_corrected + 1;
    else
      v_conflicts := v_conflicts || jsonb_build_object(
        'board', g.board,
        'old', jsonb_build_array(g.score_a, g.score_b),
        'new', jsonb_build_array(v_sa, v_sb)
      );
    end if;
  end loop;

  if jsonb_array_length(v_conflicts) > 0 then
    -- Raising rolls back the publish and every score above with it: a changed result is the
    -- one thing an import must not quietly decide.
    raise exception 'RESULT CHANGED AT SOURCE: % board(s) differ from the official result. Apply the correction on purpose to continue.',
      jsonb_array_length(v_conflicts);
  end if;

  perform public.write_audit_log(
    v_org, p_event_id, p_by, 'import-round',
    jsonb_build_object(
      'round', p_round, 'published', v_published, 'recorded', v_recorded,
      'corrected', v_corrected, 'unchanged', v_unchanged, 'pending', v_pending
    )
  );

  return jsonb_build_object(
    'published', v_published, 'recorded', v_recorded, 'corrected', v_corrected,
    'unchanged', v_unchanged, 'pending', v_pending
  );
end $$;

revoke all on function public.staff_import_round(text, integer, jsonb, text, boolean) from public, anon;
grant execute on function public.staff_import_round(text, integer, jsonb, text, boolean) to authenticated;

-- ===========================================================================
-- Proof. A function that exposes people is checked by asking it, not by reading it.
-- ===========================================================================
do $$
declare
  v_event text := 'evt-probe-0089';
  v_cols jsonb;
  v_row jsonb;
begin
  insert into public.events (id, organization_id, slug, name, data, visibility, state, status)
  values (v_event, 'org-federation', 'probe-0089', 'Probe', '{}'::jsonb, 'public', 'registration-open', 'active');

  insert into public.records (collection, organization_id, event_id, status, data)
  values ('registrations', 'org-federation', v_event, 'active', jsonb_build_object(
    'fullName', 'Probe Person', 'mobile', '03001234567', 'email', 'probe@example.com',
    'paymentStatus', 'verified', 'preferredDivision', 'beginner',
    'answers', jsonb_build_object('age', '30'),
    'paymentProof', jsonb_build_object('path', 'secret/receipt.png'),
    'checkInCode', '999999', 'adminNote', 'do not show'
  ));

  select out_columns, out_rows -> 0 into v_cols, v_row from public.public_registrations('probe-0089');

  if v_row is null then
    raise exception 'The public feed returned no rows for a public event';
  end if;

  -- The default set, nothing wider.
  if v_row ? 'phone' or v_row ? 'email' or v_row ? 'paymentProof' or v_row ? 'checkInCode'
     or v_row ? 'adminNote' or v_row ? 'id' then
    raise exception 'The public feed exposed a private field by default: %', v_row;
  end if;

  if v_row ->> 'name' <> 'Probe Person' or v_row ->> 'paymentStatus' <> 'Paid' then
    raise exception 'The public feed returned the wrong values: %', v_row;
  end if;

  -- A stored setting cannot reach a column outside the allowed list.
  update public.events set data = jsonb_build_object('publicRegistrations',
    jsonb_build_object('enabled', true, 'columns', jsonb_build_array('name', 'paymentProof', 'checkInCode')))
  where id = v_event;

  select out_rows -> 0 into v_row from public.public_registrations('probe-0089');
  if v_row ? 'paymentProof' or v_row ? 'checkInCode' then
    raise exception 'A stored column setting reached a column that cannot be public: %', v_row;
  end if;
  if not (v_row ? 'name') then
    raise exception 'An allowed column was dropped';
  end if;

  -- An event that has switched the feed off returns nothing.
  update public.events set data = jsonb_build_object('publicRegistrations',
    jsonb_build_object('enabled', false, 'columns', jsonb_build_array('name')))
  where id = v_event;
  if exists (select 1 from public.public_registrations('probe-0089')) then
    raise exception 'A disabled public feed still returned rows';
  end if;

  -- A private event is not served at all.
  update public.events set visibility = 'private',
    data = '{}'::jsonb where id = v_event;
  if exists (select 1 from public.public_registrations('probe-0089')) then
    raise exception 'A private event was served on the public feed';
  end if;

  delete from public.records where event_id = v_event;
  delete from public.events where id = v_event;
end $$;
