-- An account with no role is not "maybe staff". It is not staff.
--
-- `staff_role(org)` answers null for an account that is not on the staff list. `can_desk` and
-- `can_results` are `staff_role(org) in (...)`, and in SQL `null in (...)` is null, not false.
-- Every staff function guards itself with
--
--     if not public.can_desk('org-federation') then raise exception 'Not authorised'; end if;
--
-- and `not null` is null, so the `if` does not fire and the function carries on. A roleless
-- account sailed through the one check that exists to stop it.
--
-- It went unnoticed because every earlier test used an account that had a role — a results
-- account trying the desk, say — and that case is false, not null, and was refused correctly.
-- The case nobody tried was an account with no role at all, which is exactly what anybody who
-- signs up on the login page is (sign-ups are enabled on this project).
--
-- The fix is at the root so that all of the ~40 functions behind those two checks are fixed
-- together and any later function guarded the same way is safe from the start: the two
-- helpers answer false, never null. Two director-only guards written as
-- `staff_role(...) <> 'director'` have the same flaw and are corrected in place.

create or replace function public.can_desk(org text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.staff_role(org) in ('director', 'desk', 'checkin'), false);
$$;

create or replace function public.can_results(org text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.staff_role(org) in ('director', 'results', 'scorekeeper', 'arbiter'), false);
$$;

-- The two director-only guards. Patched from the live definitions rather than retyped, so
-- nothing else about either function can drift in the process.
do $$
declare
  v_name text;
  v_def text;
  v_fixed text;
begin
  foreach v_name in array array['staff_set_public_registration_settings', 'staff_public_hits'] loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name;

    if v_def is null then
      raise exception 'function % not found', v_name;
    end if;

    v_fixed := replace(v_def, $q$staff_role('org-federation') <> 'director'$q$,
                              $q$staff_role('org-federation') is distinct from 'director'$q$);

    if v_fixed = v_def then
      raise exception 'function % did not contain the guard this migration expected', v_name;
    end if;

    execute v_fixed;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Proof, rather than assumption: an account that exists and has no role at all.
do $$
declare
  v_stranger uuid := gen_random_uuid();
  v_refused text;
  v_directors int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_stranger, 'role', 'authenticated', 'email', 'nobody@example.test')::text, true);
  set local role authenticated;

  if public.can_desk('org-federation') is distinct from false then
    raise exception 'can_desk is not false for an account with no role: %', public.can_desk('org-federation');
  end if;
  if public.can_results('org-federation') is distinct from false then
    raise exception 'can_results is not false for an account with no role: %', public.can_results('org-federation');
  end if;

  /* The functions themselves, not just the helpers they rely on. */
  begin
    perform public.staff_public_hits('evt-alphabattle-october-2026');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like '%director%' then
    raise exception 'staff_public_hits let an account with no role through: %', v_refused;
  end if;

  begin
    perform public.staff_set_public_registration_settings('evt-alphabattle-october-2026', true, array['name']::text[], 'x');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like '%director%' then
    raise exception 'staff_set_public_registration_settings let an account with no role through: %', v_refused;
  end if;

  begin
    perform public.staff_set_team_payment('00000000-0000-0000-0000-000000000000', true, 'x');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like '%Not authorised%' then
    raise exception 'staff_set_team_payment let an account with no role through: %', v_refused;
  end if;

  begin
    perform public.staff_remove_team('00000000-0000-0000-0000-000000000000', 'x');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like '%Not authorised%' then
    raise exception 'staff_remove_team let an account with no role through: %', v_refused;
  end if;

  reset role;

  /* And nobody who should have access lost it. */
  select count(*) into v_directors from public.staff where role = 'director';
  if v_directors < 1 then raise exception 'no directors remain'; end if;
end $$;
