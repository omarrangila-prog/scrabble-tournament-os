-- Recovering a forgotten check-in code.
--
-- Somebody who has lost their confirmation still needs to get in. The obvious
-- implementation — search registrations by phone number — is also a way to ask
-- "is this person attending?" for any number somebody cares to try, so it needs
-- to be narrower than that.
--
-- Two facts are required together: a contact detail and the surname. Either alone
-- would let somebody sweep; together they only confirm what the person asking
-- already knows about themselves.
--
-- What comes back is the masked name and the personal token — enough to recognise
-- yourself and proceed, and not the code itself. Returning the code would turn one
-- lucky guess into a working credential.

create or replace function public.recover_registration(
  p_event_id text,
  p_contact text,
  p_last_name text
)
returns table (
  out_masked_name text,
  out_token text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  digits text;
  needle text;
  surname text;
begin
  needle := lower(btrim(coalesce(p_contact, '')));
  digits := regexp_replace(needle, '\D', '', 'g');
  surname := lower(btrim(coalesce(p_last_name, '')));

  -- Both are mandatory. A blank surname would make this a phone-number lookup.
  if surname = '' or needle = '' then
    return;
  end if;

  return query
  select
    /*
     * "Ahmed Khan" becomes "A**** K***": enough for the right person to
     * recognise themselves, not enough to learn who is attending.
     */
    (
      select string_agg(
        upper(left(part, 1)) || repeat('*', greatest(1, length(part) - 1)),
        ' '
      )
      from unnest(string_to_array(btrim(r.data ->> 'fullName'), ' ')) as part
      where part <> ''
    ),
    r.data ->> 'token'
  from public.records r
  where r.collection = 'registrations'
    and r.event_id = p_event_id
    and r.status = 'active'
    -- Last seven digits, so a leading zero or a country code still matches.
    and (
      (length(digits) >= 7
        and regexp_replace(coalesce(r.data ->> 'mobile', ''), '\D', '', 'g')
            like '%' || right(digits, 7))
      or (needle like '%@%' and lower(coalesce(r.data ->> 'email', '')) = needle)
    )
    and lower(coalesce(r.data ->> 'fullName', '')) like '%' || surname || '%'
  limit 1;
end $$;

grant execute on function public.recover_registration(text, text, text) to anon, authenticated;
