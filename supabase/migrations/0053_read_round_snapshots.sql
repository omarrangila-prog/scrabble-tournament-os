-- Round snapshots become readable.
--
-- `staff_snapshot_round` (0049) has been writing an immutable pairings-and-standings record
-- for every round since it finished, on purpose — "what did the standings actually say the
-- moment this round was finalized" is a question a later correction can no longer answer by
-- recomputing live, and the whole point of a snapshot is that it does not move even when the
-- data behind it does. Nothing has ever read one back. This is that read.

create or replace function public.staff_round_snapshots(p_event_id text)
returns table (
  out_round integer,
  out_kind text,
  out_payload jsonb,
  out_created_at timestamptz,
  out_created_by text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.round, s.kind, s.payload, s.created_at, s.created_by
  from public.round_snapshots s
  join public.events e on e.id = s.event_id
  where s.event_id = p_event_id
    and public.is_staff(e.organization_id)
  order by s.round, s.kind;
$$;

revoke all on function public.staff_round_snapshots(text) from public, anon;
grant execute on function public.staff_round_snapshots(text) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.staff_round_snapshots(text)', 'execute') then
    raise exception 'round snapshots are staff-only';
  end if;
  raise notice 'round snapshots are readable by staff';
end $$;
