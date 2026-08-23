-- Who has arrived, readable by a television.
--
-- The wall could show the round, the boards and the standings without an account, but not
-- the one thing the room asks for before the first pairing exists: the list of people who
-- are here. That read went through the staff roster, so on an actual TV — which has never
-- signed in — it was empty. The same mistake as the arrival counter and the board list,
-- and this is the last screen it was still hiding in.
--
-- It returns a name, a category and a player number, and nothing else. All three are
-- already on the badge and on the pairing sheet taped to the wall. No phone number, no
-- email, no payment state, no date of birth: nothing here says anything about a person
-- that the room cannot already see by looking at them.
--
-- Only checked-in players. Somebody who registered and did not come is not on this list,
-- because the list's whole job is to answer "am I in".
create or replace function public.event_checked_in(p_event_id text)
returns table (
  out_number text,
  out_name text,
  out_division text,
  out_at timestamptz
)
language sql
security definer
stable
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
  order by
    coalesce(r.data ->> 'preferredDivision', ''),
    btrim(r.data ->> 'fullName');
$$;

revoke all on function public.event_checked_in(text) from public;
grant execute on function public.event_checked_in(text) to anon, authenticated;

do $$
begin
  if not has_function_privilege('anon', 'public.event_checked_in(text)', 'execute') then
    raise exception 'the wall still cannot read who has arrived';
  end if;
  raise notice 'the wall can list arrivals without signing in';
end $$;
