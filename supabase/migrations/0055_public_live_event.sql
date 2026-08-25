-- "Which event is running right now?", answerable without an account.
--
-- The venue screens — the television, the wall display, the pairing sheet — have no event
-- id in their URL and no session to read a staff-only list with. They resolved to a single
-- hardcoded event id instead, which is correct only while exactly one tournament has ever
-- existed. This is the public lookup they need.
--
-- "Running" means the event has reached the day and has not finished: check-in through final
-- review. A draft, an event still taking registrations, a completed one and an archived one
-- are all deliberately excluded — a television in an empty hall should say nothing rather
-- than confidently show last season's boards.
--
-- Ordered by `updated_at` so that if two events are somehow mid-day at once, the one being
-- actively worked on wins. That is a tie-break, not a licence: the screens accept an explicit
-- `?event=` parameter, which is what a venue running two rooms at once should use.

drop function if exists public.event_live_now();

create function public.event_live_now()
returns table (out_id text, out_slug text, out_name text, out_state text, out_data jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.slug, e.name, e.state, e.data
  from public.events e
  where e.status = 'active'
    and e.state in (
      'check-in-open', 'check-in-closed', 'round-published',
      'round-active', 'result-entry', 'break', 'final-review'
    )
  order by e.updated_at desc
  limit 1;
$$;

revoke all on function public.event_live_now() from public;
grant execute on function public.event_live_now() to anon, authenticated;

do $$
begin
  if not has_function_privilege('anon', 'public.event_live_now()', 'execute') then
    raise exception 'the venue screens have no account and must be able to call this';
  end if;
  raise notice 'the live event is publicly resolvable';
end $$;

-- ---------------------------------------------------------------------------
-- Resolving an explicit `?event=` on a venue screen.
-- ---------------------------------------------------------------------------
--
-- Whoever sets up a television copies whichever identifier they have to hand — the id from a
-- staff URL, or the slug from the public one — so this accepts either. Returning nothing for
-- a value that matches neither is the point: a screen given a name that does not exist must
-- say so, rather than quietly rendering an empty tournament that looks like a real one where
-- nobody has arrived yet.
--
-- Unlike `public_event_by_slug` this does not require the event to be public: a venue screen
-- is inside the venue, and an event still being set up is exactly when somebody is testing
-- the wall. It exposes only what a wall shows anyway — name, slug, state, date and venue.

create or replace function public.public_event_by_ref(p_ref text)
returns table (out_id text, out_slug text, out_name text, out_state text, out_data jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.slug, e.name, e.state, e.data
  from public.events e
  where e.status = 'active'
    and (e.id = p_ref or e.slug = p_ref)
  limit 1;
$$;

revoke all on function public.public_event_by_ref(text) from public;
grant execute on function public.public_event_by_ref(text) to anon, authenticated;

do $$
begin
  if not has_function_privilege('anon', 'public.public_event_by_ref(text)', 'execute') then
    raise exception 'a venue screen has no account and must be able to resolve its own event';
  end if;
  raise notice 'an explicit ?event= resolves by id or slug';
end $$;
