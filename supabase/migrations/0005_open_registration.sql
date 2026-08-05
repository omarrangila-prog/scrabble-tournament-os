-- Open registration for both August 2026 events.
--
-- 0002 seeded both as private drafts because GAME ON! had no receiving account
-- and money would have had nowhere to go. The organizer has since confirmed
-- both events collect into the same HabibMetro and EasyPaisa accounts, so the
-- reason for holding them closed no longer applies.
--
-- `visibility` also moves to public: the select policy on public.events exposes
-- only public + active rows, so a private event stays invisible to the anonymous
-- key the registration page uses.

update public.events
set state      = 'registration-open',
    visibility = 'public',
    updated_at = now()
where id in ('evt-game-on-8-august', 'evt-alphabattle-23-august');

do $$
declare
  open_count integer;
begin
  select count(*) into open_count
  from public.events
  where id in ('evt-game-on-8-august', 'evt-alphabattle-23-august')
    and state = 'registration-open'
    and visibility = 'public'
    and status = 'active';

  if open_count <> 2 then
    raise exception
      'EXPECTED 2 OPEN EVENTS, FOUND %. Registration links would show '
      '"Registration Not Open".', open_count;
  end if;

  raise notice 'Both events are open and publicly visible.';
end $$;
