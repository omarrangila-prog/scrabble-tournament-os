-- 1. The Art Activity again, on 20 December, with code SCRABBLE: Rs 300 off for anybody registered
--    for Blufy's Alphabattle on 20 December in Rookie or Recreational.
-- 2. Staff can attach a receipt to a registration that never had one stored (23 Aug and 20 Sep
--    kept only the file's name), so those payments get a "View receipt" like every later event.

-- ---------------------------------------------------------------------------
-- The December Art Activity, copied from November with the date, hours and venue of the
-- December tournament. November's form had no sign-ups; it is closed and taken off the site.
insert into public.events (id, organization_id, slug, name, subtitle, data, visibility, state, status)
select 'evt-art-activity-december-2026', a.organization_id, 'art-december-2026', a.name, a.subtitle,
  a.data || jsonb_build_object(
    'startDate', '2026-12-20',
    'startTime', d.data ->> 'startTime',
    'endTime', d.data ->> 'endTime',
    'venueName', d.data ->> 'venueName',
    'venueAddress', d.data ->> 'venueAddress',
    'mapsUrl', d.data ->> 'mapsUrl',
    'artPromo', jsonb_build_object(
      'code', 'SCRABBLE', 'amountOff', 300,
      'eventId', 'evt-alphabattle-december-2026',
      'categories', jsonb_build_array('rookie', 'recreational'))),
  'public', 'registration-open', 'active'
from public.events a, public.events d
where a.id = 'evt-art-activity' and d.id = 'evt-alphabattle-december-2026'
on conflict (id) do nothing;

update public.events set state = 'registration-closed', visibility = 'private', updated_at = now()
where id = 'evt-art-activity'
  and not exists (select 1 from public.records where event_id = 'evt-art-activity' and status = 'active');

-- ---------------------------------------------------------------------------
-- Whether a phone number is registered for the tournament the code belongs to, in a category it
-- covers. Answers yes or no and nothing else: no name, no category, no count.
create or replace function public.art_promo_eligible(p_art_event_id text, p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events a
    join public.records r on r.event_id = a.data -> 'artPromo' ->> 'eventId'
    where a.id = p_art_event_id
      and r.collection = 'registrations'
      and r.status = 'active'
      and length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 10
      and right(regexp_replace(coalesce(r.data ->> 'mobile', ''), '\D', '', 'g'), 10)
          = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
      and coalesce(r.data ->> 'confirmedDivision', r.data ->> 'preferredDivision')
          in (select jsonb_array_elements_text(a.data -> 'artPromo' -> 'categories'))
  );
$$;

revoke all on function public.art_promo_eligible(text, text) from public;
grant execute on function public.art_promo_eligible(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The price rule, now with the code: one fee per activity, less the code's amount when the phone
-- number qualifies. A code that does not qualify is refused rather than ignored.
create or replace function public.enforce_art_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee numeric;
  v_off numeric := 0;
  v_promo jsonb;
  v_code text := upper(btrim(coalesce(new.data ->> 'promoCode', '')));
  v_age jsonb := new.data -> 'age';
  v_acts jsonb := new.data -> 'activities';
  v_count integer;
begin
  if new.collection <> 'artRegistrations' then
    return new;
  end if;

  if length(btrim(coalesce(new.data ->> 'fullName', ''))) < 2 then
    raise exception 'Please give your full name';
  end if;

  if v_age is null or jsonb_typeof(v_age) <> 'number'
     or (v_age #>> '{}')::numeric <> trunc((v_age #>> '{}')::numeric)
     or (v_age #>> '{}')::numeric < 3 or (v_age #>> '{}')::numeric > 99 then
    raise exception 'Please give a real age';
  end if;

  if length(regexp_replace(coalesce(new.data ->> 'phone', ''), '\D', '', 'g')) < 10 then
    raise exception 'Please give a phone number';
  end if;

  if coalesce(new.data ->> 'email', '') <> '' and new.data ->> 'email' !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address does not look right';
  end if;

  if v_acts is null or jsonb_typeof(v_acts) <> 'array' then
    raise exception 'Please choose at least one activity';
  end if;
  select count(*) into v_count from jsonb_array_elements_text(v_acts) a;
  if v_count = 0 then
    raise exception 'Please choose at least one activity';
  end if;
  if exists (select 1 from jsonb_array_elements_text(v_acts) a where a not in ('canvas', 'tote'))
     or v_count <> (select count(distinct a) from jsonb_array_elements_text(v_acts) a) then
    raise exception 'Unknown activity';
  end if;

  if coalesce(new.data ->> 'payment', '') not in ('online', 'cash') then
    raise exception 'Please choose how you will pay';
  end if;
  if new.data ->> 'payment' = 'online' and btrim(coalesce(new.data -> 'paymentProof' ->> 'path', '')) = '' then
    raise exception 'Please attach your payment proof';
  end if;

  select coalesce(nullif(e.data ->> 'activityFee', '')::numeric, 1000), e.data -> 'artPromo'
  into v_fee, v_promo
  from public.events e where e.id = new.event_id;

  if v_code <> '' then
    if v_promo is null or v_code <> upper(v_promo ->> 'code') then
      raise exception 'That code is not recognised';
    end if;
    if not public.art_promo_eligible(new.event_id, new.data ->> 'phone') then
      raise exception 'This code is for players registered for Blufy''s Alphabattle in Rookie or Recreational. Use the phone number you registered with.';
    end if;
    v_off := coalesce((v_promo ->> 'amountOff')::numeric, 0);
  end if;

  if coalesce((new.data ->> 'amountDue')::numeric, -1) <> greatest(0, v_fee * v_count - v_off) then
    raise exception 'The amount does not match the price';
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Attaching a receipt a registration never had. The file must already be in the bucket, under the
-- registration's own event, so a row can only ever point at its own event's files.
create or replace function public.staff_attach_payment_proof(p_record_id uuid, p_proof jsonb, p_by text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.records%rowtype;
  v_path text := btrim(coalesce(p_proof ->> 'path', ''));
  v_by text := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'desk');
begin
  if not coalesce(public.can_desk('org-federation'), false) then
    raise exception 'Not authorised';
  end if;
  select * into v_row from public.records where id = p_record_id and status = 'active';
  if not found then
    raise exception 'That registration could not be found';
  end if;
  if v_path = '' or split_part(v_path, '/', 1) <> v_row.event_id then
    raise exception 'That receipt does not belong to this event';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'payment-proofs' and name = v_path) then
    raise exception 'The receipt file was not uploaded';
  end if;

  update public.records
  set data = data || jsonb_build_object('paymentProof', p_proof || jsonb_build_object('attachedBy', v_by, 'attachedAt', now())),
      updated_at = now()
  where id = p_record_id;

  perform public.write_audit_log(v_row.organization_id, v_row.event_id, v_by, 'attach-payment-proof',
    jsonb_build_object('name', v_row.data ->> 'fullName', 'path', v_path));
  return true;
end $$;

revoke all on function public.staff_attach_payment_proof(uuid, jsonb, text) from public, anon;
grant execute on function public.staff_attach_payment_proof(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Proof, inside savepoints that are always rolled back.
do $$
declare
  v_phone text;
  v_bad text := '03000000001';
  v_base jsonb := jsonb_build_object('fullName', 'Probe Art', 'age', 12,
    'activities', jsonb_build_array('canvas', 'tote'), 'payment', 'cash', 'paymentStatus', 'cash-at-venue');
begin
  select r.data ->> 'mobile' into v_phone from public.records r
  where r.event_id = 'evt-alphabattle-december-2026' and r.collection = 'registrations' and r.status = 'active'
    and coalesce(r.data ->> 'confirmedDivision', r.data ->> 'preferredDivision') in ('rookie', 'recreational')
  limit 1;

  if v_phone is not null then
    if not public.art_promo_eligible('evt-art-activity-december-2026', v_phone) then
      raise exception 'a registered Rookie/Recreational phone was not eligible';
    end if;
    begin
      insert into public.records (collection, organization_id, event_id, data, status)
      values ('artRegistrations', 'org-federation', 'evt-art-activity-december-2026',
        v_base || jsonb_build_object('phone', v_phone, 'promoCode', 'scrabble', 'amountDue', 1700), 'active');
      raise exception 'rollback-ok';
    exception when others then
      if sqlerrm <> 'rollback-ok' then raise exception 'an eligible SCRABBLE sign-up was refused: %', sqlerrm; end if;
    end;
  end if;

  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('artRegistrations', 'org-federation', 'evt-art-activity-december-2026',
      v_base || jsonb_build_object('phone', v_bad, 'promoCode', 'SCRABBLE', 'amountDue', 1700), 'active');
    raise exception 'an ineligible SCRABBLE sign-up was accepted';
  exception when others then
    if sqlerrm like 'an ineligible%' then raise; end if;
  end;

  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('artRegistrations', 'org-federation', 'evt-art-activity-december-2026',
      v_base || jsonb_build_object('phone', v_bad, 'amountDue', 2000), 'active');
    raise exception 'rollback-ok';
  exception when others then
    if sqlerrm <> 'rollback-ok' then raise exception 'a plain sign-up was refused: %', sqlerrm; end if;
  end;
end $$;
