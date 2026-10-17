-- An import records which account applied it, not only the name the screen supplied.
--
-- `p_by` is typed or defaulted by the browser, which is how every staff action in this app has
-- always named its author, and on a shared laptop it can be somebody else's name. The audit log
-- is the record of who changed an official result, so an import writes the signed-in account's
-- own address beside it — `current_staff_email()` reads it from the session, not from anything the
-- caller sent. The name stays as it was, for people; the account is for the day somebody asks.
--
-- Nothing else changes: same signature, same grants, same behaviour.

create or replace function public.staff_import_round(
  p_event_id text,
  p_round integer,
  p_matches jsonb,
  p_by text,
  p_apply_corrections boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text;
  v_existing integer;
  v_boards jsonb;
  m jsonb;
  g public.games;
  v_a uuid;
  v_b uuid;
  v_sa integer;
  v_sb integer;
  v_swap boolean;
  v_published boolean := false;
  v_recorded integer := 0;
  v_corrected integer := 0;
  v_unchanged integer := 0;
  v_pending integer := 0;
  v_conflicts jsonb := '[]'::jsonb;
begin
  if not public.can_results('org-federation') then
    raise exception 'Not authorised';
  end if;

  if coalesce(btrim(p_by), '') = '' then
    raise exception 'The person applying the import is required';
  end if;

  if p_round is null or p_round < 1 then
    raise exception 'A round number is required';
  end if;

  if jsonb_typeof(p_matches) <> 'array' or jsonb_array_length(p_matches) = 0 then
    raise exception 'There is nothing to import';
  end if;

  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    raise exception 'Unknown event %', p_event_id;
  end if;

  select count(*) into v_existing
  from public.games where event_id = p_event_id and round = p_round;

  if v_existing = 0 then
    select jsonb_agg(jsonb_build_object(
             'board', x -> 'board',
             'division', x -> 'division',
             'playerA', x -> 'playerA',
             'playerB', x -> 'playerB',
             'aPlaysFirst', x -> 'aPlaysFirst'
           ) order by (x ->> 'board')::integer)
      into v_boards
    from jsonb_array_elements(p_matches) as x;

    perform public.staff_publish_round(p_event_id, p_round, v_boards, p_by);
    v_published := true;
  else
    for m in select * from jsonb_array_elements(p_matches) loop
      select * into g
      from public.games
      where event_id = p_event_id and round = p_round and board = (m ->> 'board')::integer;

      v_a := (m ->> 'playerA')::uuid;
      v_b := nullif(m ->> 'playerB', '')::uuid;

      if not found
         or not ((g.player_a = v_a and g.player_b is not distinct from v_b)
              or (g.player_b is not null and g.player_a = v_b and g.player_b = v_a)) then
        raise exception
          'Board % in round % does not match the pairing already published.',
          m ->> 'board', p_round;
      end if;
    end loop;
  end if;

  for m in select * from jsonb_array_elements(p_matches) loop
    if nullif(m ->> 'scoreA', '') is null then
      v_pending := v_pending + 1;
      continue;
    end if;

    select * into g
    from public.games
    where event_id = p_event_id and round = p_round and board = (m ->> 'board')::integer;

    v_a := (m ->> 'playerA')::uuid;
    v_swap := g.player_b is not null and g.player_a <> v_a;

    -- Scores are given in the imported board's order; the stored game may be seated the other
    -- way round, and a score on the wrong side is a result for the wrong player.
    v_sa := case when v_swap then (m ->> 'scoreB')::integer else (m ->> 'scoreA')::integer end;
    v_sb := case when g.player_b is null then null
                 when v_swap then (m ->> 'scoreA')::integer
                 else (m ->> 'scoreB')::integer end;

    if g.score_a is null then
      perform public.staff_record_result(g.id, v_sa, v_sb, p_by, 'Imported from an outside source');
      v_recorded := v_recorded + 1;
    elsif g.score_a = v_sa and g.score_b is not distinct from v_sb then
      v_unchanged := v_unchanged + 1;
    elsif p_apply_corrections then
      perform public.staff_record_result(g.id, v_sa, v_sb, p_by, 'Corrected from an outside source');
      v_corrected := v_corrected + 1;
    else
      v_conflicts := v_conflicts || jsonb_build_object(
        'board', g.board,
        'old', jsonb_build_array(g.score_a, g.score_b),
        'new', jsonb_build_array(v_sa, v_sb)
      );
    end if;
  end loop;

  if jsonb_array_length(v_conflicts) > 0 then
    -- Raising rolls back the publish and every score above with it: a changed result is the
    -- one thing an import must not quietly decide.
    raise exception 'RESULT CHANGED AT SOURCE: % board(s) differ from the official result. Apply the correction on purpose to continue.',
      jsonb_array_length(v_conflicts);
  end if;

  perform public.write_audit_log(
    v_org, p_event_id, p_by, 'import-round',
    jsonb_build_object(
      'round', p_round, 'published', v_published, 'recorded', v_recorded,
      'corrected', v_corrected, 'unchanged', v_unchanged, 'pending', v_pending,
      'account', public.current_staff_email()
    )
  );

  return jsonb_build_object(
    'published', v_published, 'recorded', v_recorded, 'corrected', v_corrected,
    'unchanged', v_unchanged, 'pending', v_pending
  );
end $$;

revoke all on function public.staff_import_round(text, integer, jsonb, text, boolean) from public, anon;
grant execute on function public.staff_import_round(text, integer, jsonb, text, boolean) to authenticated;
