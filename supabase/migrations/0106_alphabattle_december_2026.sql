-- Blufy's Alphabattle on 20 December: the 22 November event copied as it stands, with the date moved.
-- The early bird moves with it (10 Nov -> 10 Dec), or the December form would offer a price that
-- had already closed. Nothing else changes: prices, categories, promo codes, prizes, venue, hours,
-- tables, terms and payment details are the November ones.
insert into public.events (id, organization_id, slug, name, subtitle, state, visibility, status, data)
select
  'evt-alphabattle-december-2026', e.organization_id, 'alphabattle-december-2026', e.name, e.subtitle,
  'registration-open', 'public', 'active',
  jsonb_set(
    (e.data - 'officialStandings') || jsonb_build_object('startDate', '2026-12-20'),
    '{activities}',
    (select jsonb_agg(
       jsonb_set(a, '{rates}', (
         select jsonb_agg(case when r ->> 'id' = 'early-bird'
           then r || jsonb_build_object('label', 'Early bird, until 10 Dec', 'availableUntil', '2026-12-10T23:59:59+05:00')
           else r end)
         from jsonb_array_elements(a -> 'rates') r)))
     from jsonb_array_elements(e.data -> 'activities') a))
from public.events e
where e.id = 'evt-alphabattle-november-2026'
on conflict (id) do nothing;

do $$
begin
  if (select data ->> 'startDate' from public.events where id = 'evt-alphabattle-december-2026') <> '2026-12-20'
     or (select data::text from public.events where id = 'evt-alphabattle-december-2026') like '%10 Nov%' then
    raise exception 'December event not set up as intended';
  end if;
end $$;
