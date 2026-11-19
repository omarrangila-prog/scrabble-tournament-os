-- The Art Activity is on 22 November, at the same place and hours as the Scrabble & Arts and Crafts Day.
update public.events a
set data = a.data || jsonb_build_object(
      'startDate', '2026-11-22',
      'startTime', s.data ->> 'startTime',
      'endTime', s.data ->> 'endTime',
      'venueName', s.data ->> 'venueName',
      'venueAddress', s.data ->> 'venueAddress',
      'mapsUrl', s.data ->> 'mapsUrl'),
    updated_at = now()
from public.events s
where a.id = 'evt-art-activity' and s.id = 'evt-scrabble-arts-22-nov-2026';
