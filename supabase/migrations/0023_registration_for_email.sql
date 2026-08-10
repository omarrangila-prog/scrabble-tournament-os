-- What the confirmation email needs.
--
-- `find_registration_by_token` exists and is nearly right, but it returns neither the
-- email address nor the check-in code — it was written for the check-in screen, which
-- needs neither. A send built on it would have addressed mail to `undefined` and
-- omitted the one thing the message exists to carry.
--
-- The token is the credential. It was given to that participant and to nobody else, so
-- knowing it is what entitles the caller to the address — the same rule the personal
-- check-in link already runs on. Nothing here is reachable by guessing an email.

create or replace function public.registration_for_email(p_event_id text, p_token text)
returns table (
  out_full_name text,
  out_email text,
  out_check_in_code text,
  out_amount_due numeric,
  out_currency text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.data ->> 'fullName',
    r.data ->> 'email',
    r.check_in_code,
    (r.data ->> 'amountDue')::numeric,
    coalesce(r.data ->> 'currency', 'PKR')
  from public.records r
  where r.collection = 'registrations'
    and r.event_id = p_event_id
    and r.status = 'active'
    and r.data ->> 'token' = btrim(p_token)
  limit 1;
$$;

/*
 * Granted explicitly to anon.
 *
 * 0019 took EXECUTE away from anon by default precisely so that a new function is
 * never public by accident. This one has to be — the confirmation is sent for somebody
 * who has just registered and has no account — so the grant is written down as a
 * decision rather than inherited.
 */
grant execute on function public.registration_for_email(text, text) to anon, authenticated;

do $$
begin
  if not has_function_privilege('anon', 'public.registration_for_email(text, text)', 'execute') then
    raise exception 'The confirmation lookup is not callable by anon, so no email can be sent.';
  end if;

  -- A wrong token must return nothing rather than somebody else's address.
  if exists (select 1 from public.registration_for_email('evt-alphabattle-23-august', 'not-a-real-token')) then
    raise exception 'An unknown token returned a registration.';
  end if;

  raise notice 'registration_for_email is callable by anon and refuses an unknown token';
end $$;
