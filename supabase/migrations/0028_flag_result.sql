-- Let a director put a board's result into dispute.
--
-- The schema has always allowed a game to be 'disputed', the dashboard counts disputed
-- boards, the Live Event screen shows a Conflicts figure, and the round-readiness check
-- refuses to advance while a conflict stands.
--
-- Nothing could set it. Every one of those was reporting on a state the system had no way
-- to enter, so a real disagreement over a score had nowhere to go: the board read
-- "verified", the round read "ready", and the only way to hold it was to remember.
--
-- Resolution is not a separate operation. Re-entering the score verifies the board again
-- and records who typed it, which is the same path a correction already takes — so there
-- is one place where a score becomes official, and it is always a person.

create or replace function public.staff_flag_result(
  p_game_id uuid,
  p_by text,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games;
begin
  if not public.is_staff('org-federation') then
    raise exception 'Not authorised';
  end if;

  if coalesce(trim(p_by), '') = '' then
    raise exception 'The person raising it is required';
  end if;

  /*
   * A reason is required. "Disputed" with no reason tells whoever picks it up nothing,
   * and somebody has to be able to settle this without the person who raised it.
   */
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'No such game';
  end if;

  /*
   * A board with no score is not disputed, it is outstanding — and the round-readiness
   * check already refuses to advance on those. Allowing it here would let one board be
   * counted as both.
   */
  if v_game.score_a is null then
    raise exception 'That board has no score to dispute yet';
  end if;

  if v_game.status = 'disputed' then
    return 'already-disputed';
  end if;

  update public.games
  set status = 'disputed',
      note = 'Flagged by ' || trim(p_by) || ': ' || trim(p_reason)
  where id = p_game_id;

  return 'disputed';
end $$;

revoke all on function public.staff_flag_result(uuid, text, text) from public, anon;
grant execute on function public.staff_flag_result(uuid, text, text) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.staff_flag_result(uuid, text, text)', 'execute') then
    raise exception 'anon can dispute a score';
  end if;

  raise notice 'staff_flag_result: staff only, reason required, scored boards only';
end $$;
