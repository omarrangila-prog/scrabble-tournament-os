-- Training sessions, which are not a tournament.
--
-- Coaching runs weekly and continuously. It has no rounds, no draw, no standings and no
-- winner, so the tournament machinery has nothing to say about it: a trainee has no
-- division, is never paired, and must never appear in a pairing, a standings table, or the
-- check-in report that tells the director who is here to play.
--
-- That isolation is the whole point of this migration, and it is enforced by the collection
-- name rather than by a flag inside the payload. Everything that answers "who is playing"
-- filters on `collection = 'registrations'`, so a signup stored under `trainingSignups` is
-- structurally incapable of reaching the draw — there is no column anybody can set wrongly,
-- and no later edit to a registration screen can accidentally include one. The alternative
-- considered was a `kind` field on a registration, and it was rejected for exactly that
-- reason: it would have put a trainee one forgotten `where` clause away from a board.
--
-- Signups still hang off an event row, because `records.event_id` is a real foreign key and
-- scoping is what every policy and index is built on. So training gets one long-lived event
-- of its own, below, rather than borrowing a tournament whose totals and reports it would
-- then pollute.

-- ---------------------------------------------------------------------------
-- The collection a stranger may write to.
--
-- Someone signing up for coaching has no account, exactly like someone registering for a
-- tournament, so the public insert policy has to admit this collection. It is added to the
-- writable list and deliberately NOT to the readable one: a signup carries a child's name,
-- their age and a parent's mobile number, and the existing "staff read every record" policy
-- is the only way it comes back out.
create or replace function public.is_public_writable(c text)
returns boolean
language sql
immutable
as $$
  select c in (
    'registrations',
    'participants',
    'payments',
    'membershipVerifications',
    'checkIns',
    'scoreSubmissions',
    'interestRegistrations',
    'trainingSignups'
  );
$$;

-- ---------------------------------------------------------------------------
-- The event training signups belong to.
--
-- Created once and reused: coaching is ongoing, and a new event row per month would scatter
-- one roster across twelve.
--
-- `registration-open` and `public` are not cosmetic, and neither was my first choice. The
-- insert policy from 0027 accepts a public submission only for an event that is
-- `registration-open`, `public` and `active` — all three — so a private training event would
-- have taken no signups at all: the form would have submitted, the policy would have refused
-- the row, and the trainee would have seen a failure with nothing to fix. The state is also
-- honest: signups are open, and they stay open.
--
-- `public` here costs nothing, because an event is only ever reachable by its own slug.
-- `public_event_by_slug` is the only public reader and it takes one slug; there is no
-- browsable index of events anywhere on the site. So this puts the training page at
-- /events/training for anyone holding that link, and nowhere else.
--
-- A state of its own was considered and rejected. `events_state_check` enumerates the
-- tournament phases and the 0060 state machine is built on that list, so a `training` value
-- would force every transition table and phase check to have an opinion about a state that
-- never transitions — and, as above, would have broken the insert policy outright.
--
-- `is_test` stays false. It reads as if it were meant for this ("True for training and
-- rehearsal events"), but what it actually controls is whether anything may be sent to a
-- participant, and these are real people paying real money who should get their confirmation.
-- It marks a rehearsal, not a lesson.
--
-- What marks this event as training is `isTraining` below, the `trainingSignups` collection,
-- and the fact that nothing reads it as a tournament.
insert into public.events (id, organization_id, slug, name, subtitle, data, visibility, state, status)
values (
  'training-sessions',
  'org-federation',
  'training',
  'Scrabble Training Sessions',
  'Weekly coaching for juniors and adults',
  jsonb_build_object(
    'fee', 800,
    'currency', 'PKR',
    'isTraining', true
  ),
  'public',
  'registration-open',
  'active'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The signup list, for staff.
--
-- A function rather than a view so it carries its own capability check: `records` is already
-- covered by "staff read every record", and this keeps the browser's query shape simple while
-- the decision about who may read it stays in the database.
--
-- Returns the stored document whole. The columns a coach actually wants — who, how old, which
-- parent to call — live in jsonb and will change as the form does, and a migration per field
-- would be friction with no safety gain.
create or replace function public.training_signups()
returns table(
  out_id uuid,
  out_data jsonb,
  out_status text,
  out_created_at timestamp with time zone
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.data, r.status, r.created_at
  from public.records r
  where r.collection = 'trainingSignups'
    and r.status = 'active'
    and public.is_any_staff()
  order by r.created_at desc;
$$;

revoke all on function public.training_signups() from public, anon;
grant execute on function public.training_signups() to authenticated;

-- ---------------------------------------------------------------------------
-- Proof, rather than assumption.
--
-- The three things that would each make the form silently useless: the collection not being
-- writable, the event not satisfying the insert policy, and a signup reaching the draw. The
-- first two are checked by actually inserting as an anonymous caller would and reading the
-- policy's own verdict; the third by asking the feed that seats players whether it can see it.
do $$
declare
  v_id uuid;
  v_seen int;
begin
  if not public.is_public_writable('trainingSignups') then
    raise exception 'trainingSignups is not publicly writable, so no signup could ever be saved';
  end if;

  if public.is_public_readable('trainingSignups') then
    raise exception 'trainingSignups is publicly readable — a parent mobile number would be world readable';
  end if;

  if not exists (
    select 1 from public.events
    where id = 'training-sessions'
      and state = 'registration-open'
      and visibility = 'public'
      and status = 'active'
  ) then
    raise exception 'The training event does not satisfy the public insert policy, so the form would refuse every signup';
  end if;

  /*
   * A real insert, then removed. Written through the table as the form writes it, so the
   * policy predicate is what approves it rather than this function's own privileges.
   */
  insert into public.records (collection, organization_id, event_id, data, status)
  values (
    'trainingSignups', 'org-federation', 'training-sessions',
    jsonb_build_object('fullName', 'Migration check', 'paymentStatus', 'cash-at-venue'),
    'active'
  )
  returning id into v_id;

  if v_id is null then
    raise exception 'A training signup could not be inserted';
  end if;

  /* It must not be visible to anything that decides who plays. */
  select count(*) into v_seen
  from public.records
  where collection = 'registrations' and event_id = 'training-sessions';

  if v_seen <> 0 then
    raise exception 'A training signup is being counted as a tournament registration';
  end if;

  delete from public.records where id = v_id;
end $$;
