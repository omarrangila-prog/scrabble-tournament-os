-- Give every entrant a short player number, and a way to prove it is theirs.
--
-- The six-digit check-in code was doing two jobs badly. As an identity it is too long to
-- remember, announce over a microphone, or type at a noisy door — and as a secret it was
-- the only thing standing between a stranger and somebody else's registration.
--
-- Those jobs are now split:
--
--   Player number   101, 102, 103 …  Short, sequential, public. Printed, announced, typed.
--                                    It identifies. It proves nothing.
--
--   Last four digits of the mobile   Known to the person, not to the room. Asked once, when
--                                    a player number is first used on a device.
--
-- Guessing 117 is trivial and is meant to be. Guessing 117 *and* the last four digits of
-- that person's phone is not, and that pairing is what a check-in or a score submission
-- actually requires.
--
-- Numbers start at 101 rather than 1, so every number is three digits. A field that
-- sometimes wants "7" and sometimes "117" is a field people get wrong.

/* ---------------------------------------------------------------------------
   Assigning
   --------------------------------------------------------------------------- */

/**
 * The next free number for an event.
 *
 * Reads the highest in use rather than counting rows: deleting somebody must not hand their
 * number to the next person who registers, or two entrants end up sharing a number in
 * anybody's notes and on anything already printed.
 */
create or replace function public.next_player_number(p_event_id text)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(
    max((data ->> 'playerNumber')::integer),
    100
  ) + 1
  from public.records
  where event_id = p_event_id
    and collection = 'registrations'
    and data ->> 'playerNumber' ~ '^[0-9]+$';
$$;

/**
 * Assigns one on the way in, when the caller has not.
 *
 * A trigger rather than something the app does, because registrations are inserted straight
 * from the browser. Two people submitting at the same moment would otherwise read the same
 * highest number and both take it.
 */
create or replace function public.assign_player_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.collection = 'registrations' and (new.data ->> 'playerNumber') is null then
    new.data := new.data || jsonb_build_object(
      'playerNumber', public.next_player_number(new.event_id)::text
    );
  end if;

  return new;
end $$;

drop trigger if exists records_assign_player_number on public.records;
create trigger records_assign_player_number
  before insert on public.records
  for each row
  execute function public.assign_player_number();

/* Backfill, in the order people registered, so the numbers follow the entry list. */
with numbered as (
  select
    id,
    100 + row_number() over (partition by event_id order by created_at, id) as number
  from public.records
  where collection = 'registrations'
    and status = 'active'
    and (data ->> 'playerNumber') is null
)
update public.records r
set data = r.data || jsonb_build_object('playerNumber', n.number::text)
from numbered n
where r.id = n.id;

/*
 * One number per person, per event. The index is what makes that true rather than hoped
 * for — the trigger reads the highest in use, and this catches anything that slips past it.
 */
create unique index if not exists records_player_number_idx
  on public.records (event_id, (data ->> 'playerNumber'))
  where collection = 'registrations' and status = 'active';

/* ---------------------------------------------------------------------------
   Using
   --------------------------------------------------------------------------- */

/**
 * Who a player number belongs to, shown back before anything is done with it.
 *
 * The name is masked. Somebody typing numbers at random should not be able to read out the
 * entry list, but the person holding the number needs enough to recognise themselves —
 * "Muhammad A." does that, and does not hand a stranger a full name.
 *
 * Nothing here checks the phone. This only asks "is this you?", which the person then has
 * to prove.
 */
create or replace function public.player_by_number(p_event_id text, p_number text)
returns table (
  out_masked_name text,
  out_division text,
  out_checked_in boolean,
  out_payment_status text,
  out_amount_due numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return query
  select
    /* First name, then the initial of the last — enough to recognise, not enough to harvest. */
    case
      when position(' ' in btrim(r.data ->> 'fullName')) > 0
        then split_part(btrim(r.data ->> 'fullName'), ' ', 1) || ' ' ||
             left(split_part(btrim(r.data ->> 'fullName'), ' ',
                  array_length(string_to_array(btrim(r.data ->> 'fullName'), ' '), 1)), 1) || '.'
      else btrim(r.data ->> 'fullName')
    end,
    coalesce(r.data ->> 'confirmedDivision', r.data ->> 'preferredDivision'),
    r.checked_in_at is not null,
    r.data ->> 'paymentStatus',
    (r.data ->> 'amountDue')::numeric
  from public.records r
  where r.event_id = p_event_id
    and r.collection = 'registrations'
    and r.status = 'active'
    and r.data ->> 'playerNumber' = btrim(p_number);
end $$;

/**
 * Proves a player number belongs to the person holding the phone, and returns their session
 * token if it does.
 *
 * The token is the one already stored on the registration — the same secret behind a
 * personal check-in link. Handing it over here is what lets a phone remember who it belongs
 * to for the rest of the day, so the number and the four digits are asked once and never
 * again.
 *
 * A wrong answer returns nothing at all, and takes the same path as an unknown number.
 */
create or replace function public.claim_player_number(
  p_event_id text,
  p_number text,
  p_last_four text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.records;
  v_digits text;
begin
  select * into v_record
  from public.records
  where event_id = p_event_id
    and collection = 'registrations'
    and status = 'active'
    and data ->> 'playerNumber' = btrim(p_number);

  if not found then
    return null;
  end if;

  /* Compared as digits, because a number is stored as 0300-1234567 or 0300 1234567. */
  v_digits := regexp_replace(coalesce(v_record.data ->> 'mobile', ''), '\D', '', 'g');

  if length(v_digits) < 4 or right(v_digits, 4) <> regexp_replace(btrim(p_last_four), '\D', '', 'g') then
    return null;
  end if;

  return v_record.data ->> 'token';
end $$;

revoke all on function public.next_player_number(text) from public, anon;
revoke all on function public.player_by_number(text, text) from public;
revoke all on function public.claim_player_number(text, text, text) from public;

grant execute on function public.player_by_number(text, text) to anon, authenticated;
grant execute on function public.claim_player_number(text, text, text) to anon, authenticated;

do $$
declare
  v_missing integer;
  v_dupes integer;
begin
  select count(*) into v_missing
  from public.records
  where collection = 'registrations' and status = 'active'
    and (data ->> 'playerNumber') is null;

  if v_missing > 0 then
    raise exception '% active registrations have no player number', v_missing;
  end if;

  select count(*) into v_dupes from (
    select event_id, data ->> 'playerNumber' as n
    from public.records
    where collection = 'registrations' and status = 'active'
    group by 1, 2 having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise exception '% player numbers are shared by more than one person', v_dupes;
  end if;

  if has_function_privilege('anon', 'public.next_player_number(text)', 'execute') then
    raise exception 'anon can read the next player number';
  end if;

  raise notice 'every entrant has a unique player number; identity needs the last four digits too';
end $$;
