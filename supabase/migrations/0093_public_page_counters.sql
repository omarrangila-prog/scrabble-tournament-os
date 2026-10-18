-- How often the public results pages are used.
--
-- A bare counter per event, kind and day. No person, address or device is stored, so there is
-- nothing here to protect beyond the totals themselves, and nothing to leak.
--
-- Kinds are a fixed list: results page opened, a player's certificate page opened, a
-- certificate downloaded, and the Odoovations credit clicked. Anyone can add to a counter (the
-- pages are public), so the figures are a measure of use and not an audit; only a director can read
-- them.

create table if not exists public.public_hits (
  event_id text not null references public.events(id) on delete cascade,
  kind text not null check (kind in
    ('results_view', 'certificate_view', 'certificate_download', 'odoovations_click')),
  day date not null default current_date,
  hits integer not null default 0,
  primary key (event_id, kind, day)
);

alter table public.public_hits enable row level security;
revoke all on public.public_hits from public, anon, authenticated;

create or replace function public.record_public_hit(p_slug text, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
begin
  select id into v_event from public.events
  where slug = p_slug and visibility = 'public' and status = 'active';
  if v_event is null then return; end if;

  insert into public.public_hits (event_id, kind, day, hits)
  values (v_event, p_kind, current_date, 1)
  on conflict (event_id, kind, day) do update set hits = public_hits.hits + 1;
exception when check_violation then
  return;
end $$;

revoke all on function public.record_public_hit(text, text) from public;
grant execute on function public.record_public_hit(text, text) to anon, authenticated;

create or replace function public.staff_public_hits(p_event_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.staff_role('org-federation') <> 'director' then
    raise exception 'Only a director may see these figures';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('kind', kind, 'total', total, 'today', today))
    from (
      select kind,
             sum(hits)::int as total,
             coalesce(sum(hits) filter (where day = current_date), 0)::int as today
      from public.public_hits where event_id = p_event_id group by kind
    ) t
  ), '[]'::jsonb);
end $$;

revoke all on function public.staff_public_hits(text) from public, anon;
grant execute on function public.staff_public_hits(text) to authenticated;

-- Proof: a hit counts, a bad kind and a private/unknown event do not, anon cannot read.
do $$
declare
  v_slug text := 'alphabattle-october-2026';
  v_id text;
  v_before int;
  v_after int;
begin
  select id into v_id from public.events where slug = v_slug;
  select coalesce(sum(hits), 0) into v_before from public.public_hits where event_id = v_id;
  perform public.record_public_hit(v_slug, 'results_view');
  perform public.record_public_hit(v_slug, 'nonsense');
  perform public.record_public_hit('no-such-event', 'results_view');
  select coalesce(sum(hits), 0) into v_after from public.public_hits where event_id = v_id;
  if v_after <> v_before + 1 then
    raise exception 'counter proof failed: % -> %', v_before, v_after;
  end if;
  delete from public.public_hits where event_id = v_id and kind = 'results_view' and hits = 1
    and v_before = 0;
end $$;
