-- Masters comes back, and every category gets its own block of tables.
--
-- Two changes that belong together: a fourth category is only usable if the room can seat it.
--
-- MASTERS
--
-- Masters was removed earlier, on the grounds that those players enter as advanced. That is
-- a reasonable way to run a three-category event and a bad way to run a four-category one,
-- and the event now being planned has four. `division_for` mapped the word "masters" onto
-- recreational — the catch-all for anything unrecognised — so a player who wrote "Masters"
-- on the form was filed two categories below where they belong.
--
-- Recognised here, not forced: `event_categories` still returns whatever an event was given,
-- and an event that runs three categories keeps running three. What changes is that an event
-- which *does* offer Masters can now have people land in it.
--
-- TABLE RANGES
--
-- The ranges in use overlapped at tables 9, 16 and 25 — the last table of one category was
-- also the first table of the next, which seats four people at one board. `assignTables`
-- already refuses to publish a round with an overlap, so this was a setting that made a
-- round unpublishable rather than a silent double-booking. The defaults below do not overlap.
--
-- Stored per event. A different venue has a different number of tables, and a range baked
-- into the software is a range that cannot be changed on the morning.

create or replace function public.division_for(p_level text)
returns text
language sql
immutable
set search_path = public
as $$
  /*
   * Plain language in, division id out.
   *
   * Order matters: "masters" is checked before the advanced words, because a Masters player
   * describing themselves as an "advanced masters player" belongs in Masters. Anything
   * unrecognised becomes 'recreational' rather than nothing — somebody who registered and
   * paid has to appear on the roster, and the middle division is a judgement a director can
   * correct, whereas dropping them is a person turned away at the door.
   *
   * Mirrors `divisionFor` in src/lib/domain/roster.ts, which is what the pairing engine sees.
   * The two must agree: a roster that classified players differently from the engine that
   * paired them would be worse than one that said nothing, because it would look right.
   */
  select case
    when lower(btrim(coalesce(p_level, ''))) like '%master%'   then 'masters'
    when lower(btrim(coalesce(p_level, ''))) like '%expert%'   then 'masters'
    when lower(btrim(coalesce(p_level, ''))) like '%beginner%' then 'beginner'
    when lower(btrim(coalesce(p_level, ''))) like '%new%'      then 'beginner'
    when lower(btrim(coalesce(p_level, ''))) like '%advanced%' then 'advanced'
    when lower(btrim(coalesce(p_level, ''))) like '%regular%'  then 'advanced'
    else 'recreational'
  end
$$;

revoke all on function public.division_for(text) from public, anon;
grant execute on function public.division_for(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The table plan an event uses, and a default that does not seat two games at one board.

create or replace function public.event_table_plan(p_event_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  /*
   * The organiser's own plan where one exists.
   *
   * The fallback covers a four-category event at thirty tables and, critically, no number
   * appears in two ranges. The previous ranges shared their boundary tables — 1-9 and 9-16
   * both claimed table 9 — which `assignTables` refuses to publish, so the event could not
   * start until somebody worked out why.
   *
   * A category the event does not run simply has no boards to seat, so carrying a range for
   * it costs nothing.
   */
  select coalesce(
    (select data -> 'tablePlan' from public.events where id = p_event_id),
    '[
      {"division":"beginner",     "from":1,  "to":9},
      {"division":"recreational", "from":10, "to":16},
      {"division":"advanced",     "from":17, "to":25},
      {"division":"masters",      "from":26, "to":30}
    ]'::jsonb
  );
$$;

revoke all on function public.event_table_plan(text) from public, anon;
grant execute on function public.event_table_plan(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Writing it. Refuses a plan that would seat two games at one table, because the alternative
-- is discovering it when the round will not publish.

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

  /* Every range has to run forwards and start at a real table. */
  if exists (
    select 1 from jsonb_array_elements(p_plan) as r
    where (r ->> 'from')::integer < 1
       or (r ->> 'to')::integer < (r ->> 'from')::integer
  ) then
    raise exception 'A table range must start at 1 or higher and end at or after it starts';
  end if;

  /*
   * No table in two ranges. Counted by expanding each range and looking for a number that
   * appears twice — the same check `overlappingTables` makes in the browser, made again here
   * because this is the trust boundary.
   */
  select count(*) into v_overlap
  from (
    select t
    from jsonb_array_elements(p_plan) as r,
         generate_series((r ->> 'from')::integer, (r ->> 'to')::integer) as t
    group by t having count(*) > 1
  ) clash;

  if v_overlap > 0 then
    raise exception
      '% table(s) are listed for more than one category. Two games cannot share a table.',
      v_overlap;
  end if;

  update public.events
  set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('tablePlan', p_plan),
      updated_at = now()
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(btrim(coalesce(p_by, '')), ''), 'unknown'),
    'set-table-ranges', jsonb_build_object('plan', p_plan));

  return true;
end $$;

revoke all on function public.staff_set_table_ranges(text, jsonb, text) from public, anon;
grant execute on function public.staff_set_table_ranges(text, jsonb, text) to authenticated;
