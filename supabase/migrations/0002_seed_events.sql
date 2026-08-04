-- Seed the two real August 2026 events.
--
-- public.records carries a foreign key to public.events, so a registration
-- cannot be stored until its event exists as a row. The app builds its event
-- definitions client-side from src/lib/domain/eventSeed.ts, which is enough to
-- render a form but leaves the database with no matching row — every submission
-- then fails with a foreign key violation.
--
-- Only the columns the database itself constrains or indexes are set here: id,
-- slug, name, visibility and state. The richer definition (pricing, tracks,
-- venue, payment accounts) stays in the app so it remains editable in Event
-- Settings without a migration.
--
-- Both events stay `draft` and `private`. Opening registration is a deliberate
-- act the organizer takes in Settings once the payment account is set, and
-- GAME ON! does not have one yet.

insert into public.events (id, organization_id, slug, name, subtitle, visibility, state)
values
  (
    'evt-game-on-8-august',
    'org-federation',
    'game-on-8-august',
    'GAME ON!',
    'An Evening of Board Games & Speed Scrabble',
    'private',
    'draft'
  ),
  (
    'evt-alphabattle-23-august',
    'org-federation',
    'alphabattle-23-august',
    'Blufy''s AlphaBattle',
    'A fast-paced Scrabble showdown',
    'private',
    'draft'
  )
on conflict (id) do update
  set slug       = excluded.slug,
      name       = excluded.name,
      subtitle   = excluded.subtitle,
      updated_at = now();
