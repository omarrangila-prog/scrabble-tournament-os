-- The audit log becomes readable.
--
-- `audit_logs` has been written to since 0047 — every score correction, dispute, check-in,
-- payment decision, phase change, round publish and round-robin format change carries a row.
-- The "Audit log" tab in Settings has shown none of it: it reads `store.audit`, a Zustand
-- array seeded once with demo data and never touched by any real write since. A director
-- opening that tab today sees a handful of fictional entries from before this session while
-- the real trail — everything this whole project has been adding audit coverage to — sits in
-- Postgres with no screen reading it back. The exact "toggle exists, does nothing" pattern
-- Phase 1 fixed for QR and self check-in, just on the read side this time.
--
-- `audit_logs`' own RLS policy already scopes reads to directors (`is_director`, stricter
-- than `is_staff` — this table records who on the team did what, which is a level more
-- sensitive than day-to-day operational data). This RPC enforces the same check directly
-- rather than relying on the client querying the table straight through RLS, matching how
-- every other read in this app works.

create or replace function public.staff_audit_log(p_event_id text, p_limit integer default 300)
returns table (
  out_id uuid,
  out_created_at timestamptz,
  out_actor text,
  out_action text,
  out_detail jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.created_at, a.actor, a.action, a.detail
  from public.audit_logs a
  join public.events e on e.id = p_event_id
  where a.event_id = p_event_id
    and public.is_director(e.organization_id)
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 300), 1000));
$$;

revoke all on function public.staff_audit_log(text, integer) from public, anon;
grant execute on function public.staff_audit_log(text, integer) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.staff_audit_log(text, integer)', 'execute') then
    raise exception 'the audit log names staff members and must not be public';
  end if;
  raise notice 'audit log is readable by directors';
end $$;
