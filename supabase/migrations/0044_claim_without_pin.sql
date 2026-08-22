-- Picking your own name is enough to be let in.
--
-- Check-in used to ask for the last four digits of the mobile after the name. It is a real
-- protection — it is what stops one phone claiming another player and entering their score —
-- and the organizer has asked for it to go, because at a door with seventy-nine people the
-- step costs more than it earns.
--
-- So the trade, stated plainly: anybody who can read the name off the pairing list can now
-- claim that player. What that buys them is a check-in and the ability to type a score for a
-- board they are not sitting at. What stops it mattering is that the opponent confirms every
-- score on their own phone, and a disagreement halts the board for a person to settle.
--
-- The token returned is the registration's own, the same one its personal link carries.

create or replace function public.claim_player_open(p_event_id text, p_number text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  select data ->> 'token' into v_token
  from public.records
  where collection = 'registrations'
    and event_id = p_event_id
    and status = 'active'
    and data ->> 'playerNumber' = btrim(p_number)
  limit 1;

  /* Null for an unknown number, so this cannot be used to discover which numbers exist. */
  return v_token;
end $$;

revoke all on function public.claim_player_open(text, text) from public;
grant execute on function public.claim_player_open(text, text) to anon, authenticated;

do $$
begin
  if public.claim_player_open('evt-alphabattle-23-august', '000') is not null then
    raise exception 'an unknown player number returned a token';
  end if;
  raise notice 'a player can be claimed by name alone';
end $$;
