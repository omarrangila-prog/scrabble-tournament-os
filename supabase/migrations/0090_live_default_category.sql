-- Which category the public live results page opens on.
--
-- A venue where one field dominates may want a phone to open straight on it; absent means
-- "All", which is what a stranger scanning a code most likely wants. Stored beside the other
-- public-page settings in the event's own document, and changeable by whoever runs results.
--
-- The value is checked against the event's real categories (or the word "all") so a typo cannot
-- leave a public page opening on a category that does not exist and showing nothing.

create or replace function public.staff_set_live_default_category(
  p_event_id text,
  p_category text,
  p_by text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_value text := lower(btrim(coalesce(p_category, 'all')));
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  if v_value <> 'all' and not exists (
    select 1 from jsonb_array_elements(public.event_categories(p_event_id)) c
    where c ->> 'id' = v_value
  ) then
    raise exception 'That is not one of this event''s categories';
  end if;

  update public.events
  set data = jsonb_set(coalesce(data, '{}'::jsonb), '{liveDefaultCategory}', to_jsonb(v_value))
  where id = p_event_id;

  perform public.write_audit_log(
    v_org, p_event_id, coalesce(nullif(btrim(p_by), ''), public.current_staff_email(), 'unknown'),
    'set-live-default-category', jsonb_build_object('category', v_value)
  );

  return true;
end $$;

revoke all on function public.staff_set_live_default_category(text, text, text) from public, anon;
grant execute on function public.staff_set_live_default_category(text, text, text) to authenticated;
