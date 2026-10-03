-- A painting seat is not an entry in the Scrabble tournament.
--
-- The Cafe Leap event sells a painting place beside the boards. Somebody who buys one is a
-- guest of the event — they check in, they owe money, they belong on the desk's list and in
-- the check-in report — but they are not in the draw.
--
-- The registration form did not say so. It filed every entry with a division, defaulting to
-- "recreational" when none was chosen, so a painting-only registration arrived looking like a
-- Recreational / Intermediate player: that is what the desk screen printed, and `event_checked_in`
-- would have handed them to the pairing engine on the day. One painter has already registered
-- that way for 18 October.
--
-- The form now records the activity by key and states no division for a painter. This is the
-- other half: the feed that answers "who is here to play" stops counting them.
--
-- Keyed on the activity key, never on its label. The label is organiser copy — "Painting"
-- today, "Art Workshop" after somebody edits Settings — and a tournament must not turn on the
-- spelling of a button.

create or replace function public.event_checked_in(p_event_id text)
returns table(out_number text, out_name text, out_division text, out_at timestamp with time zone)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.data ->> 'playerNumber',
    btrim(r.data ->> 'fullName'),
    coalesce(r.data ->> 'preferredDivision', ''),
    r.checked_in_at
  from public.records r
  where r.collection = 'registrations'
    and r.event_id = p_event_id
    and r.status = 'active'
    and r.checked_in_at is not null
    and btrim(coalesce(r.data ->> 'fullName', '')) <> ''
    /*
     * Everything that is not explicitly a painting-only ticket is a player. Absence means
     * yes: every registration taken before painting was ever sold has no activity recorded,
     * and must not be dropped out of its own tournament by a column that did not exist then.
     */
    and coalesce(r.data -> 'answers' ->> 'activityKey', '') <> 'painting'
  order by
    coalesce(r.data ->> 'preferredDivision', ''),
    btrim(r.data ->> 'fullName');
$$;

revoke all on function public.event_checked_in(text) from public;
grant execute on function public.event_checked_in(text) to authenticated, anon;
