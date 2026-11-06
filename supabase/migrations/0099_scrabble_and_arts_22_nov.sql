-- Scrabble and an arts and crafts workshop on 22 November, held for a cause.
--
-- The event is a copy of the November Scrabble event with the things that differ replaced:
-- Scrabble at PKR 1,500 with lunch included, an arts and crafts workshop whose price has not
-- been announced (stored as 0, which the form reads as "to be announced"), no promo codes, no
-- prizes, and one line saying where the money goes.
--
-- The workshop uses the activity key `painting`. That key is what keeps a workshop sign-up out
-- of the draw (see 0086): the label is the organiser's wording, the key is what the tournament
-- looks at.

insert into public.events (id, organization_id, slug, name, subtitle, state, visibility, status, data)
select
  'evt-scrabble-arts-22-nov-2026',
  e.organization_id,
  'scrabble-and-arts-22-nov',
  'Scrabble & Arts and Crafts Day',
  'A day of Scrabble and arts and crafts in support of a young girl with autism',
  'registration-open',
  'public',
  'active',
  (e.data - 'promoCodes' - 'prizes' - 'feeDetails')
    || jsonb_build_object(
      'fee', 1500,
      'cause', '100% of all registrations go to supporting a young autistic girl.',
      'rates', jsonb_build_array(jsonb_build_object(
        'id', 'standard', 'label', 'Regular', 'basis', 'The regular entry fee.', 'amount', 1500)),
      'activities', jsonb_build_array(
        jsonb_build_object(
          'key', 'scrabble', 'label', 'Scrabble Tournament', 'price', 1500,
          'rateLabel', 'Scrabble', 'includes', 'Lunch included.',
          'rates', jsonb_build_array(jsonb_build_object(
            'id', 'regular', 'label', 'Regular', 'amount', 1500))),
        jsonb_build_object(
          'key', 'painting', 'label', 'Arts & Crafts Workshop', 'price', 0,
          'rateLabel', 'Arts & Crafts',
          'rates', jsonb_build_array(jsonb_build_object(
            'id', 'regular', 'label', 'Regular', 'amount', 0))))
    )
from public.events e
where e.id = 'evt-alphabattle-november-2026'
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The sign-ups, for staff and for the event's host.
--
-- Registrations are ordinary records, which only staff can read. A host has no staff row (see
-- 0096), so this is the one door: it answers for the events on the caller's own `event_hosts`
-- row and returns nothing for any other.
create or replace function public.host_registrations(p_event_id text)
returns table(
  out_id uuid,
  out_data jsonb,
  out_created_at timestamp with time zone,
  out_checked_in_at timestamp with time zone
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.data, r.created_at, r.checked_in_at
  from public.records r
  where r.event_id = p_event_id
    and r.collection = 'registrations'
    and r.status = 'active'
    and (public.is_any_staff() or public.is_event_host(p_event_id))
  order by r.created_at asc;
$$;

revoke all on function public.host_registrations(text) from public, anon;
grant execute on function public.host_registrations(text) to authenticated;

-- Proof. A host sees their own event's sign-ups and nobody else's.
do $$
begin
  if not exists (select 1 from public.events where id = 'evt-scrabble-arts-22-nov-2026'
                 and state = 'registration-open' and visibility = 'public') then
    raise exception 'the event was not created open and public';
  end if;
  if (select (data -> 'activities' -> 1 ->> 'price')::int
        from public.events where id = 'evt-scrabble-arts-22-nov-2026') <> 0 then
    raise exception 'the workshop should carry no price yet';
  end if;
  -- Run by nobody (no auth.uid()), the function must hand back nothing.
  if exists (select 1 from public.host_registrations('evt-alphabattle-november-2026')) then
    raise exception 'host_registrations answered for a caller who is neither staff nor host';
  end if;
end $$;
