-- Let the other player confirm — or dispute — the score their opponent sent.
--
-- The organizer asked for both things at different moments: a result that counts
-- immediately, and a result the opponent agrees to. They are only in conflict if the
-- confirmation is a gate. It is not.
--
-- The score is official the moment it is submitted, exactly as before, and the standings
-- move. What is added is the other player's chance to say it is wrong, from their own phone,
-- without finding a volunteer. Confirming changes nothing except that everybody can see it
-- was agreed; disputing sends the board to Conflicts, where the round stops until a person
-- settles it.
--
-- That way a mistyped score is caught by the one person in the room guaranteed to notice,
-- and nobody has to wait for their opponent to have a phone, a signal, or the patience.

/*
 * Who sent it. `verified_by` holds a display name, which is fine for a score sheet and no
 * use for deciding whose turn it is to confirm — two people called Muhammad would be one
 * person to it.
 */
alter table public.games
  add column if not exists submitted_by uuid references public.records (id) on delete set null;

alter table public.games
  add column if not exists confirmed_by uuid references public.records (id) on delete set null;

alter table public.games
  add column if not exists confirmed_at timestamptz;

/**
 * What this phone should be shown about its own board, after a result exists.
 *
 * Returns the score as sent, whether this player was the one who sent it, and whether they
 * have already agreed. The page needs all three: the submitter is shown their own entry, the
 * opponent is asked, and somebody who has already confirmed is not asked twice.
 */
create or replace function public.result_state_by_token(p_event_id text, p_token text)
returns table (
  out_game_id uuid,
  out_round integer,
  out_board integer,
  out_my_score integer,
  out_their_score integer,
  out_opponent text,
  out_i_submitted boolean,
  out_confirmed boolean,
  out_disputed boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_record public.records;
  v_round integer;
begin
  select * into v_record
  from public.records
  where event_id = p_event_id
    and collection = 'registrations'
    and status = 'active'
    and checked_in_at is not null
    and data ->> 'token' = btrim(p_token);

  if not found then
    return;
  end if;

  select max(g.round) into v_round from public.games g where g.event_id = p_event_id;
  if v_round is null then
    return;
  end if;

  return query
  select
    g.id,
    g.round,
    g.board,
    case when g.player_a = v_record.id then g.score_a else g.score_b end,
    case when g.player_a = v_record.id then g.score_b else g.score_a end,
    case
      when g.player_b is null then null
      when g.player_a = v_record.id then rb.data ->> 'fullName'
      else ra.data ->> 'fullName'
    end,
    g.submitted_by is not distinct from v_record.id,
    g.confirmed_at is not null,
    g.status = 'disputed'
  from public.games g
  left join public.records ra on ra.id = g.player_a
  left join public.records rb on rb.id = g.player_b
  where g.event_id = p_event_id
    and g.round = v_round
    and (g.player_a = v_record.id or g.player_b = v_record.id)
    and g.score_a is not null;
end $$;

/**
 * The opponent agreeing.
 *
 * Records who agreed and when. It does not change the score — that was already official —
 * so this is the cheap half of the exchange, and the one almost everybody will take.
 */
create or replace function public.confirm_result_by_token(p_event_id text, p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.records;
  v_game public.games;
  v_round integer;
begin
  select * into v_record
  from public.records
  where event_id = p_event_id
    and collection = 'registrations'
    and status = 'active'
    and checked_in_at is not null
    and data ->> 'token' = btrim(p_token);

  if not found then
    return 'not-found';
  end if;

  select max(g.round) into v_round from public.games g where g.event_id = p_event_id;

  select * into v_game
  from public.games g
  where g.event_id = p_event_id
    and g.round = v_round
    and (g.player_a = v_record.id or g.player_b = v_record.id);

  if not found or v_game.score_a is null then
    return 'no-result';
  end if;

  /* The person who sent it cannot also be the one who agrees to it. */
  if v_game.submitted_by is not distinct from v_record.id then
    return 'you-submitted-it';
  end if;

  update public.games
  set confirmed_by = v_record.id,
      confirmed_at = now(),
      /* A dispute that is then confirmed is settled, and the round can move again. */
      status = 'verified'
  where id = v_game.id;

  return 'confirmed';
end $$;

/**
 * The opponent saying it is wrong.
 *
 * The score stays exactly as it was. Nothing about a disagreement tells us which number is
 * right, and letting the second player overwrite the first would just move the problem —
 * so the board goes to Conflicts and the round waits for somebody to settle it.
 */
create or replace function public.dispute_result_by_token(
  p_event_id text,
  p_token text,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.records;
  v_game public.games;
  v_round integer;
  v_name text;
begin
  select * into v_record
  from public.records
  where event_id = p_event_id
    and collection = 'registrations'
    and status = 'active'
    and checked_in_at is not null
    and data ->> 'token' = btrim(p_token);

  if not found then
    return 'not-found';
  end if;

  v_name := coalesce(v_record.data ->> 'fullName', 'A player');

  select max(g.round) into v_round from public.games g where g.event_id = p_event_id;

  select * into v_game
  from public.games g
  where g.event_id = p_event_id
    and g.round = v_round
    and (g.player_a = v_record.id or g.player_b = v_record.id);

  if not found or v_game.score_a is null then
    return 'no-result';
  end if;

  update public.games
  set status = 'disputed',
      note = 'Disputed by ' || v_name ||
             case when coalesce(btrim(p_reason), '') = '' then '' else ': ' || btrim(p_reason) end
  where id = v_game.id;

  return 'disputed';
end $$;

/* Record the sender, so the opponent can be told apart from them. */
create or replace function public.submit_result_by_token(
  p_event_id text,
  p_token text,
  p_my_score integer,
  p_their_score integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.records;
  v_game public.games;
  v_round integer;
  v_name text;
begin
  select * into v_record
  from public.records
  where event_id = p_event_id
    and collection = 'registrations'
    and status = 'active'
    and checked_in_at is not null
    and data ->> 'token' = btrim(p_token);

  if not found then
    return 'not-found';
  end if;

  v_name := coalesce(v_record.data ->> 'fullName', 'A player');

  select max(g.round) into v_round from public.games g where g.event_id = p_event_id;
  if v_round is null then
    return 'no-round';
  end if;

  select * into v_game
  from public.games g
  where g.event_id = p_event_id
    and g.round = v_round
    and (g.player_a = v_record.id or g.player_b = v_record.id);

  if not found then
    return 'no-board';
  end if;

  if v_game.player_b is null then
    return 'bye';
  end if;

  if v_game.score_a is not null then
    return 'already-recorded';
  end if;

  if p_my_score is null or p_their_score is null then
    return 'missing-score';
  end if;

  if p_my_score < 0 or p_their_score < 0 or p_my_score > 1500 or p_their_score > 1500 then
    return 'out-of-range';
  end if;

  update public.games
  set score_a = case when v_game.player_a = v_record.id then p_my_score else p_their_score end,
      score_b = case when v_game.player_a = v_record.id then p_their_score else p_my_score end,
      status = 'verified',
      submitted_by = v_record.id,
      verified_by = v_name || ' (from their phone)',
      verified_at = now()
  where id = v_game.id;

  return 'recorded';
end $$;

revoke all on function public.result_state_by_token(text, text) from public;
revoke all on function public.confirm_result_by_token(text, text) from public;
revoke all on function public.dispute_result_by_token(text, text, text) from public;

grant execute on function public.result_state_by_token(text, text) to anon, authenticated;
grant execute on function public.confirm_result_by_token(text, text) to anon, authenticated;
grant execute on function public.dispute_result_by_token(text, text, text) to anon, authenticated;

do $$
begin
  if public.confirm_result_by_token('evt-alphabattle-23-august', 'nope') <> 'not-found' then
    raise exception 'an unknown token confirmed a result';
  end if;

  if public.dispute_result_by_token('evt-alphabattle-23-august', 'nope', 'x') <> 'not-found' then
    raise exception 'an unknown token disputed a result';
  end if;

  raise notice 'the opponent may agree or object; neither changes the score';
end $$;
