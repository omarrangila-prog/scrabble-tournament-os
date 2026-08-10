-- Take EXECUTE away from anonymous callers on the staff functions.
--
-- Found by checking `has_function_privilege('anon', ...)` after applying 0018
-- rather than by reading the migration back: every staff function was executable
-- by an anonymous caller holding nothing but the publishable key.
--
-- There are two causes, and the first attempt at this migration only fixed one of
-- them — its own assertion caught that and rolled the whole thing back.
--
--   1. Supabase sets default privileges granting EXECUTE on new functions in
--      `public` to `anon`, `authenticated` and `service_role`. A
--      `revoke ... from public` removes the implicit PUBLIC grant and does nothing
--      to the explicit `anon` one.
--   2. Postgres itself grants EXECUTE on every new function to PUBLIC, and `anon`
--      inherits it. Revoking from `anon` alone leaves that intact, so
--      `has_function_privilege` still answers yes.
--
-- Both have to go, which is why each function is revoked from `public` and from
-- `anon` rather than one or the other.
--
-- Nothing leaked. Every one of these functions checks `is_staff` in its body and
-- either raises or returns an empty set, and that check was verified working. But
-- a single guard inside a function is one mistake away from being the only thing
-- between an anonymous request and the participant list. An anonymous caller should
-- be refused at the door, not admitted and then turned around inside.
--
-- The two genuinely public functions keep their grant: `event_round_boards` and
-- `event_current_round` are the pairing sheet, which is meant to be readable by
-- somebody standing in the room with a phone and no account.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'staff_add_walkin',
        'staff_check_in',
        'staff_undo_check_in',
        'staff_decide_payment',
        'staff_publish_round',
        'staff_clear_round',
        'staff_record_result',
        'staff_clear_result',
        'staff_games',
        'organizer_registrations',
        'verify_payment'
      )
  loop
    /*
     * Both grants. `public` is the implicit one Postgres adds to every function
     * and which `anon` inherits; `anon` is the explicit one Supabase's default
     * privileges add. Revoking either alone leaves the function callable.
     */
    execute format('revoke all on function %s from public', fn.signature);
    execute format('revoke all on function %s from anon', fn.signature);
    raise notice 'revoked public and anon execute on %', fn.signature;
  end loop;
end $$;

/*
 * Stop the next migration reintroducing this.
 *
 * Default privileges are why the problem existed; changing them means a function
 * added later is not exposed to anon merely because nobody remembered to revoke
 * it. Anything genuinely public gets an explicit grant, which is a decision
 * somebody has to write down.
 */
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;

-- Prove it, in the same transaction that did it.
do $$
declare
  leaked text;
begin
  select string_agg(p.proname, ', ')
  into leaked
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname like any (array['staff_%', 'organizer_%', 'verify_payment'])
    and has_function_privilege('anon', p.oid, 'execute');

  if leaked is not null then
    raise exception 'These are still executable by anon: %', leaked;
  end if;

  -- And the pairing sheet must still be readable without an account.
  if not has_function_privilege('anon', 'public.event_round_boards(text, integer)', 'execute')
     or not has_function_privilege('anon', 'public.event_current_round(text)', 'execute') then
    raise exception 'The public board list is no longer readable by anon.';
  end if;

  raise notice 'anon can read the board list and nothing else.';
end $$;
