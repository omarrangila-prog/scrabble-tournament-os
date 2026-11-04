-- Promo codes for Speed Pictionary.
--
-- An entry may carry a code that takes a percentage off the price. The event row holds the codes
-- (`promoCodes`, the same shape the Scrabble form reads), and the database — not the form —
-- decides what a code is worth, for the reason 0095 gives for the price itself: anybody can post
-- to the API directly, and a discount that only the browser checks is a discount anybody can
-- give themselves.
--
-- So when an entry names a code, the trigger looks it up on the event (case-blind, and not past
-- its end date if it has one), works out the discounted price the same way the form does
-- (rounded to the nearest whole rupee) and requires the amount owed to be exactly that. An
-- unknown or closed code is refused, and so is a discounted amount sent without a code.

update public.events
set data = data || jsonb_build_object(
      'promoCodes', jsonb_build_array(
        jsonb_build_object('code', 'ASMA', 'label', 'ASMA — 40% off', 'percentOff', 40))),
    updated_at = now()
where id = 'evt-pictionary-22-nov-2026'
  and not coalesce(data -> 'promoCodes', '[]'::jsonb) @> '[{"code":"ASMA"}]'::jsonb;

-- Patched from the live definition rather than retyped, so nothing else about the function can
-- drift in the process. Each replacement is asserted, so a changed function fails loudly here
-- instead of silently skipping the rule.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'enforce_team_places';
  if v_def is null then raise exception 'enforce_team_places not found'; end if;

  v_new := replace(v_def, 'v_expected numeric;', E'v_expected numeric;\n  v_code text;\n  v_pct numeric;');
  if v_new = v_def then raise exception 'declaration anchor not found'; end if;

  v_def := v_new;
  v_new := replace(v_def,
    'if v_expected is not null and coalesce((new.data ->> ''amountDue'')::numeric, -1) <> v_expected then',
    $q$v_code := upper(btrim(coalesce(new.data ->> 'promoCode', '')));
  if v_code <> '' then
    select (c ->> 'percentOff')::numeric into v_pct
    from jsonb_array_elements(coalesce(v_event -> 'promoCodes', '[]'::jsonb)) c
    where upper(btrim(c ->> 'code')) = v_code
      and (nullif(c ->> 'availableUntil', '') is null or now() <= (c ->> 'availableUntil')::timestamptz)
    limit 1;
    if v_pct is null or v_pct <= 0 or v_pct > 100 then
      raise exception 'That promo code is not valid';
    end if;
    if v_expected is not null then
      v_expected := round(v_expected * (1 - v_pct / 100));
    end if;
  end if;
  if v_expected is not null and coalesce((new.data ->> 'amountDue')::numeric, -1) <> v_expected then$q$);
  if v_new = v_def then raise exception 'price anchor not found'; end if;

  execute v_new;
end $$;

-- ---------------------------------------------------------------------------
-- Proof, rather than assumption. Written as an anonymous visitor writes.
do $$
declare
  v_ev text := 'evt-pictionary-22-nov-2026';
  v_refused text;
  v_one jsonb := jsonb_build_object('entryType', 'individual', 'players', jsonb_build_array('Promo One'),
                   'ages', jsonb_build_array(17), 'paymentStatus', 'cash-at-venue', 'payment', 'cash');
begin
  if (select count(*) from public.records where collection = 'pictionaryTeams' and status = 'active') <> 0 then
    raise notice 'entries already exist; skipping the write probes';
    return;
  end if;

  set local role anon;
  /* A real code at its discounted price is accepted, for one and for a pair. */
  insert into public.records (collection, organization_id, event_id, data, status)
  values ('pictionaryTeams', 'org-federation', v_ev, v_one || '{"promoCode":"asma","amountDue":750}', 'active');
  insert into public.records (collection, organization_id, event_id, data, status)
  values ('pictionaryTeams', 'org-federation', v_ev,
    jsonb_build_object('entryType', 'team', 'players', jsonb_build_array('Promo A', 'Promo B'),
      'ages', jsonb_build_array(17, 18), 'paymentStatus', 'cash-at-venue', 'payment', 'cash',
      'promoCode', 'ASMA', 'amountDue', 1200), 'active');

  /* The refusals. */
  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('pictionaryTeams', 'org-federation', v_ev, v_one || '{"promoCode":"ASMA","amountDue":1250}', 'active');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like '%does not match the price%' then raise exception 'a code with the full price was not refused: %', v_refused; end if;

  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('pictionaryTeams', 'org-federation', v_ev, v_one || '{"amountDue":750}', 'active');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like '%does not match the price%' then raise exception 'a discount with no code was not refused: %', v_refused; end if;

  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('pictionaryTeams', 'org-federation', v_ev, v_one || '{"promoCode":"NOPE","amountDue":750}', 'active');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null or v_refused not like '%promo code is not valid%' then raise exception 'an unknown code was not refused: %', v_refused; end if;

  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('pictionaryTeams', 'org-federation', v_ev, v_one || '{"promoCode":"ASMA","amountDue":1}', 'active');
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null then raise exception 'a tampered amount with a real code was accepted'; end if;
  reset role;

  /* An ordinary entry with no code is unaffected. */
  insert into public.records (collection, organization_id, event_id, data, status)
  values ('pictionaryTeams', 'org-federation', v_ev, v_one || '{"amountDue":1250}', 'active');

  delete from public.records where collection = 'pictionaryTeams' and event_id = v_ev;
end $$;
