-- One shape for the table plan, the one the app already used.
--
-- Migration 0073 introduced table ranges as `{division, from, to}` under `events.data.tablePlan`.
-- The application had been storing `{division, tables: [1, 2, 3]}` under that same key since
-- migration 0055 — `staff_set_table_plan` writes it, `assignTables` in the browser reads it,
-- and the Live Event table-plan card edits it. Two shapes under one key: the moment somebody
-- used the existing card, the range readers found no `from` and every category's range came
-- back null, which is a round that cannot seat a late arrival and an error that names nothing.
--
-- Caught on the practice event during the rolling-entry test, which is what the practice
-- event is for.
--
-- The app's shape wins. It was there first, three places already read it, and an explicit
-- list of tables says exactly what a range says while also allowing a category to skip a
-- broken table. Everything from 0073 now reads that shape, and tolerates the other one for
-- anything already saved in it.

create or replace function public.table_plan_tables(p_entry jsonb)
returns integer[]
language sql
immutable
set search_path = public
as $$
  /*
   * The tables one plan entry names, whichever way it was written.
   *
   * `tables: [..]` is the application's own shape. `from`/`to` is the shape 0073 wrote for a
   * few days and may still be stored on an event; it is expanded rather than refused so a
   * plan saved that way keeps working until it is next edited.
   */
  select case
    when jsonb_typeof(p_entry -> 'tables') = 'array' then
      (select coalesce(array_agg(t::integer order by t::integer), '{}')
       from jsonb_array_elements_text(p_entry -> 'tables') as t
       where t ~ '^[0-9]+$')
    when (p_entry ->> 'from') ~ '^[0-9]+$' and (p_entry ->> 'to') ~ '^[0-9]+$' then
      (select coalesce(array_agg(t), '{}')
       from generate_series((p_entry ->> 'from')::integer, (p_entry ->> 'to')::integer) as t)
    else '{}'::integer[]
  end
$$;

revoke all on function public.table_plan_tables(jsonb) from public, anon;
grant execute on function public.table_plan_tables(jsonb) to authenticated;

-- ---------------------------------------------------------------------------

create or replace function public.event_table_plan(p_event_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  /*
   * The organiser's plan where one exists, in the application's shape.
   *
   * The fallback is four non-overlapping blocks for thirty tables. The ranges this replaces
   * shared their boundary tables — 1-9 and 9-16 both claimed table 9 — which the browser
   * refuses to publish, so the round would not start and nothing said why.
   */
  select coalesce(
    (select data -> 'tablePlan' from public.events where id = p_event_id),
    jsonb_build_array(
      jsonb_build_object('division', 'beginner',     'tables', to_jsonb(array(select generate_series(1, 9)))),
      jsonb_build_object('division', 'recreational', 'tables', to_jsonb(array(select generate_series(10, 16)))),
      jsonb_build_object('division', 'advanced',     'tables', to_jsonb(array(select generate_series(17, 25)))),
      jsonb_build_object('division', 'masters',      'tables', to_jsonb(array(select generate_series(26, 30))))
    )
  );
$$;

-- ---------------------------------------------------------------------------

create or replace function public.free_table_for(p_event_id text, p_round integer, p_division text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  /* The first table in this category's block that no game this round is sitting at. */
  with mine as (
    select unnest(public.table_plan_tables(r)) as t
    from jsonb_array_elements(public.event_table_plan(p_event_id)) as r
    where r ->> 'division' = p_division
  ),
  taken as (
    select board from public.games
    where event_id = p_event_id and round = p_round and player_b is not null
  )
  select t from mine
  where t not in (select board from taken)
  order by t
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Writing a plan normalises it to the application's shape, whatever was sent.

create or replace function public.staff_set_table_ranges(
  p_event_id text,
  p_plan jsonb,
  p_by text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_overlap integer;
  v_normalised jsonb;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  if jsonb_typeof(p_plan) <> 'array' then
    raise exception 'A table plan must be a JSON array';
  end if;

  /* Whatever shape arrived, what is stored is `{division, tables}`. */
  select coalesce(jsonb_agg(jsonb_build_object(
           'division', r ->> 'division',
           'tables', to_jsonb(public.table_plan_tables(r)))), '[]'::jsonb)
  into v_normalised
  from jsonb_array_elements(p_plan) as r;

  if exists (
    select 1 from jsonb_array_elements(v_normalised) as r, unnest(public.table_plan_tables(r)) as t
    where t < 1
  ) then
    raise exception 'Table numbers start at 1';
  end if;

  /* No table in two categories. */
  select count(*) into v_overlap
  from (
    select t
    from jsonb_array_elements(v_normalised) as r, unnest(public.table_plan_tables(r)) as t
    group by t having count(*) > 1
  ) clash;

  if v_overlap > 0 then
    raise exception
      '% table(s) are listed for more than one category. Two games cannot share a table.',
      v_overlap;
  end if;

  update public.events
  set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('tablePlan', v_normalised),
      updated_at = now()
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(btrim(coalesce(p_by, '')), ''), 'unknown'),
    'set-table-ranges', jsonb_build_object('plan', v_normalised));

  return true;
end $$;

-- ---------------------------------------------------------------------------
-- The practice event's seed wrote the 0073 shape. Put it in the application's.

update public.events
set data = data || jsonb_build_object('tablePlan', jsonb_build_array(
      jsonb_build_object('division', 'beginner',     'tables', to_jsonb(array(select generate_series(1, 9)))),
      jsonb_build_object('division', 'recreational', 'tables', to_jsonb(array(select generate_series(10, 16)))),
      jsonb_build_object('division', 'advanced',     'tables', to_jsonb(array(select generate_series(17, 25)))),
      jsonb_build_object('division', 'masters',      'tables', to_jsonb(array(select generate_series(26, 30))))))
where id = 'evt-desk-practice';

-- Any other event saved in the 0073 shape is converted in place.
update public.events e
set data = e.data || jsonb_build_object('tablePlan', (
      select jsonb_agg(jsonb_build_object(
               'division', r ->> 'division',
               'tables', to_jsonb(public.table_plan_tables(r))))
      from jsonb_array_elements(e.data -> 'tablePlan') as r))
where jsonb_typeof(e.data -> 'tablePlan') = 'array'
  and exists (
    select 1 from jsonb_array_elements(e.data -> 'tablePlan') as r
    where r ? 'from' and not (r ? 'tables'));
