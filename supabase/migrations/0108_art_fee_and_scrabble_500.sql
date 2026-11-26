-- The Art Activity costs Rs 1,000 an activity, and code SCRABBLE takes Rs 500 off (Rookie and
-- Recreational players of Blufy's Alphabattle on 20 December only).
--
-- `fee` is what the generic event page and the event lists read; without it they showed PKR 0.
-- `formPath` sends anybody who reaches the generic event page or its Scrabble form to the Art form.
update public.events
set data = data
      || jsonb_build_object('fee', coalesce(nullif(data ->> 'activityFee', '')::numeric, 1000), 'formPath', '/art/register')
      || case when data ? 'artPromo'
              then jsonb_build_object('artPromo', (data -> 'artPromo') || '{"amountOff": 500}'::jsonb)
              else '{}'::jsonb end,
    updated_at = now()
where id in ('evt-art-activity', 'evt-art-activity-december-2026');

do $$
begin
  if (select (data -> 'artPromo' ->> 'amountOff')::int from public.events where id = 'evt-art-activity-december-2026') <> 500
     or (select (data ->> 'fee')::int from public.events where id = 'evt-art-activity-december-2026') <> 1000 then
    raise exception 'art fee or code not set';
  end if;
end $$;
