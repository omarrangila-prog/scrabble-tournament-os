-- Art Activity: Canvas Painting and Tote Bag Printing / Painting, one or both.
--
-- Its own collection, `artRegistrations`, so a sign-up can never reach the Scrabble draw (which
-- reads only `registrations`). The price is decided here, not trusted from the browser: each
-- activity costs the event's `activityFee`, and the amount sent must equal that times the number
-- chosen.

-- ---------------------------------------------------------------------------
-- A stranger may write to the collection (and not read it); a stored receipt marks it paid, as for
-- every other form.
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.is_public_writable(text)'::regprocedure);
  if v_def not like '%artRegistrations%' then
    v_def := replace(v_def, $q$'mafiaRegistrations'$q$, $q$'mafiaRegistrations',
    'artRegistrations'$q$);
    if v_def not like '%artRegistrations%' then raise exception 'is_public_writable not patched'; end if;
    execute v_def;
  end if;

  v_def := pg_get_functiondef('public.promote_receipt_after_insert()'::regprocedure);
  if v_def not like '%artRegistrations%' then
    v_def := replace(v_def, $q$'mafiaRegistrations')$q$, $q$'mafiaRegistrations', 'artRegistrations')$q$);
    if v_def not like '%artRegistrations%' then raise exception 'promote_receipt_after_insert not patched'; end if;
    execute v_def;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- What an Art Activity sign-up must contain. The form checks the same; anybody can post directly.
create or replace function public.enforce_art_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee numeric;
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

  select coalesce(nullif(e.data ->> 'activityFee', '')::numeric, 1000) into v_fee
  from public.events e where e.id = new.event_id;
  if coalesce((new.data ->> 'amountDue')::numeric, -1) <> v_fee * v_count then
    raise exception 'The amount does not match the price';
  end if;

  return new;
end $$;

drop trigger if exists enforce_art_entry_trigger on public.records;
create trigger enforce_art_entry_trigger
  before insert on public.records
  for each row
  execute function public.enforce_art_entry();

-- ---------------------------------------------------------------------------
-- The event. Open, public and active, which is what the public insert policy demands.
insert into public.events (id, organization_id, slug, name, subtitle, data, visibility, state, status)
values (
  'evt-art-activity',
  'org-federation',
  'art',
  'Art Activity',
  'Choose your activity and reserve your spot.',
  jsonb_build_object(
    'isArt', true,
    'activityFee', 1000,
    'currency', 'PKR',
    'city', 'Karachi',
    'startDate', '2026-11-22',
    'paymentInstructions', coalesce(
      (select data ->> 'paymentInstructions' from public.events where id = 'evt-alphabattle-november-2026'), '')
  ),
  'public',
  'registration-open',
  'active'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The sign-ups, for staff only.
create or replace function public.art_registrations()
returns table(out_id uuid, out_data jsonb, out_created_at timestamp with time zone)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.data, r.created_at
  from public.records r
  where r.collection = 'artRegistrations'
    and r.status = 'active'
    and coalesce(public.is_any_staff(), false)
  order by r.created_at asc;
$$;

revoke all on function public.art_registrations() from public, anon;
grant execute on function public.art_registrations() to authenticated;

create or replace function public.staff_set_art_payment(p_id uuid, p_paid boolean, p_by text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.records%rowtype;
  v_by text := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'desk');
begin
  if not coalesce(public.can_desk('org-federation'), false) then
    raise exception 'Not authorised';
  end if;
  select * into v_row from public.records where id = p_id and collection = 'artRegistrations' and status = 'active';
  if not found then
    raise exception 'That registration could not be found';
  end if;

  if p_paid then
    update public.records
    set data = data || jsonb_build_object('paymentStatus', 'verified', 'verifiedBy', v_by, 'verifiedAt', now(),
                                          'paymentNote', 'Marked paid by ' || v_by || '.'),
        updated_at = now()
    where id = p_id;
  else
    update public.records
    set data = (data - 'autoVerified' - 'verifiedBy' - 'verifiedAt' - 'paymentNote')
          || jsonb_build_object('paymentStatus',
               case when data ->> 'payment' = 'cash' then 'cash-at-venue' else 'receipt-uploaded' end),
        updated_at = now()
    where id = p_id;
  end if;

  perform public.write_audit_log(v_row.organization_id, v_row.event_id, v_by,
    case when p_paid then 'art-marked-paid' else 'art-marked-unpaid' end,
    jsonb_build_object('name', v_row.data ->> 'fullName'));
  return true;
end $$;

create or replace function public.staff_remove_art(p_id uuid, p_by text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.records%rowtype;
  v_by text := coalesce(nullif(btrim(coalesce(p_by, '')), ''), public.current_staff_email(), 'desk');
begin
  if not coalesce(public.can_desk('org-federation'), false) then
    raise exception 'Not authorised';
  end if;
  select * into v_row from public.records where id = p_id and collection = 'artRegistrations' and status = 'active';
  if not found then
    raise exception 'That registration could not be found';
  end if;
  update public.records set status = 'deleted', updated_at = now() where id = p_id;
  perform public.write_audit_log(v_row.organization_id, v_row.event_id, v_by, 'art-removed',
    jsonb_build_object('name', v_row.data ->> 'fullName'));
  return true;
end $$;

revoke all on function public.staff_set_art_payment(uuid, boolean, text) from public, anon;
revoke all on function public.staff_remove_art(uuid, text) from public, anon;
grant execute on function public.staff_set_art_payment(uuid, boolean, text) to authenticated;
grant execute on function public.staff_remove_art(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Proof: written as an anonymous visitor writes, inside a savepoint that is always rolled back.
do $$
declare
  v_ok jsonb := jsonb_build_object('fullName', 'Probe Art', 'age', 12, 'phone', '03001234567',
    'activities', jsonb_build_array('canvas', 'tote'), 'payment', 'cash', 'amountDue', 2000,
    'paymentStatus', 'cash-at-venue');
  v_refused text;
begin
  if not public.is_public_writable('artRegistrations') then
    raise exception 'artRegistrations is not publicly writable';
  end if;

  begin
    insert into public.records (collection, organization_id, event_id, data, status)
    values ('artRegistrations', 'org-federation', 'evt-art-activity', v_ok, 'active');
    raise exception 'rollback-ok';
  exception when others then
    if sqlerrm <> 'rollback-ok' then raise exception 'a valid sign-up was refused: %', sqlerrm; end if;
  end;

  foreach v_refused in array array[
    (v_ok || '{"amountDue": 1000}')::text,
    (v_ok || '{"activities": []}')::text,
    (v_ok || '{"activities": ["canvas","canvas"], "amountDue": 2000}')::text,
    (v_ok || '{"payment": "online", "paymentStatus": "receipt-uploaded"}')::text,
    (v_ok || '{"phone": "123"}')::text
  ] loop
    begin
      insert into public.records (collection, organization_id, event_id, data, status)
      values ('artRegistrations', 'org-federation', 'evt-art-activity', v_refused::jsonb, 'active');
      raise exception 'an invalid sign-up was accepted: %', v_refused;
    exception when others then
      if sqlerrm like 'an invalid sign-up was accepted%' then raise; end if;
    end;
  end loop;
end $$;
