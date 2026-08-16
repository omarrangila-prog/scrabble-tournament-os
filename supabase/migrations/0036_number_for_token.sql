-- The player number for somebody who has just registered.
--
-- The number is assigned by a trigger, after the row is inserted, so the browser that
-- submitted the form does not have it — and the confirmation page is the one place a
-- participant is guaranteed to look. Showing them a six-digit code there and a three-digit
-- number in their email is two identities for one person, and the one they remember will be
-- whichever they saw first.
--
-- Returns only a number, and only to somebody already holding that registration's token.

create or replace function public.player_number_for_token(p_event_id text, p_token text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select data ->> 'playerNumber'
  from public.records
  where event_id = p_event_id
    and collection = 'registrations'
    and status = 'active'
    and data ->> 'token' = btrim(p_token);
$$;

revoke all on function public.player_number_for_token(text, text) from public;
grant execute on function public.player_number_for_token(text, text) to anon, authenticated;

do $$
begin
  if public.player_number_for_token('evt-alphabattle-23-august', 'not-a-token') is not null then
    raise exception 'an unknown token returned a player number';
  end if;

  raise notice 'a new registration can read its own player number';
end $$;
