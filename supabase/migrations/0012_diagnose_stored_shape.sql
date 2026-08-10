-- Diagnose what the registration form actually stored.
--
-- The end-to-end test proved a registration reaches the database, but recovery by
-- mobile and surname found nothing and the confirmation showed no check-in code.
-- Both read specific keys out of the jsonb payload, so the question is whether
-- those keys are present and under the names the functions expect.
--
-- Raises the shape rather than the contents: enough to see which keys exist
-- without printing a participant's details into a migration log.

do $$
declare
  r record;
begin
  for r in
    select
      id,
      check_in_code,
      (select string_agg(k, ', ' order by k) from jsonb_object_keys(data) as k) as keys,
      data ->> 'mobile' is not null as has_mobile,
      data ->> 'fullName' is not null as has_full_name,
      data ->> 'checkInCode' is not null as has_nested_code,
      data ->> 'paymentStatus' as payment_status
    from public.records
    where collection = 'registrations'
    order by created_at desc
    limit 3
  loop
    raise notice 'row % | column code: % | nested code: % | mobile: % | name: % | payment: %',
      r.id, coalesce(r.check_in_code, '(null)'), r.has_nested_code,
      r.has_mobile, r.has_full_name, r.payment_status;
    raise notice '  keys: %', r.keys;
  end loop;
end $$;
