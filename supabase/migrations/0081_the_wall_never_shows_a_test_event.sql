-- A training event never reaches the venue screen.
--
-- `event_live_now` picks "the tournament running today" by state, and the practice event
-- lives in `check-in-open` permanently so the desk can rehearse against it. The night before
-- the real event, with Cafe Leap still in `registration-open`, that made the practice event
-- the one running today — and the TV at the venue would have shown forty invented names.
--
-- `is_test` exists exactly so that nothing meant for participants can pick a rehearsal by
-- accident. This is the first reader to actually consult it. The rest of the resolution is
-- unchanged: same states, most recently touched first.
--
-- The four states added by 0060 are included too. An event in `round-preview` or
-- `result-review` is as live as one in `round-published`, and was falling off the wall.

create or replace function public.event_live_now()
returns table (out_id text, out_slug text, out_name text, out_state text, out_data jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.slug, e.name, e.state, e.data
  from public.events e
  where e.status = 'active'
    and not e.is_test
    and e.state in (
      'check-in-open', 'check-in-closed',
      'round-preview', 'round-published', 'round-active',
      'result-entry', 'result-review', 'round-finalized',
      'break', 'final-review', 'awards'
    )
  order by e.updated_at desc
  limit 1;
$$;
