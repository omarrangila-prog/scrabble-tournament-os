#!/usr/bin/env bash
#
# Applies the pending migrations, then proves they landed.
#
# Reads SUPABASE_DB_URL from .env.local so the credential never appears in a
# command line, in shell history, or in this file. `.env.local` is gitignored.
#
# Each migration runs in a single transaction (-1), so a file either applies
# completely or not at all. A half-applied migration is the worst outcome: some
# functions exist, some do not, and the app reports a different missing piece on
# every screen.
#
# Usage:  scripts/apply-migrations.sh [0016 0017 0018]

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "No .env.local found." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env.local; set +a

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  cat >&2 <<'MSG'
SUPABASE_DB_URL is not set in .env.local.

Get the URI from the Supabase dashboard:
  Project Settings -> Database -> Connection string -> URI

Then add it as one line in .env.local:
  SUPABASE_DB_URL="postgresql://postgres.<ref>:<password>@<host>:5432/postgres"
MSG
  exit 1
fi

# ON_ERROR_STOP makes psql exit non-zero on the first failure rather than
# carrying on and reporting success at the end.
PSQL=(psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --no-psqlrc)

echo "== Connection"
"${PSQL[@]}" -tAc "select 'connected to ' || current_database() || ' as ' || current_user"

targets=("$@")
if [ ${#targets[@]} -eq 0 ]; then
  targets=(0016 0017 0018)
fi

for prefix in "${targets[@]}"; do
  file=$(find supabase/migrations -name "${prefix}_*.sql" | head -1)

  if [ -z "$file" ]; then
    echo "!! no migration matching ${prefix}" >&2
    exit 1
  fi

  echo
  echo "== Applying $(basename "$file")"
  "${PSQL[@]}" -1 -f "$file"
done

echo
echo "== Verifying"

# Names, argument types and permissions, straight from the catalogue. Checking
# that a function exists is not enough: a function nobody may execute fails at
# the moment it is needed.
"${PSQL[@]}" <<'SQL'
select
  p.proname                                as function,
  pg_get_function_identity_arguments(p.oid) as arguments,
  case
    when has_function_privilege('authenticated', p.oid, 'execute') then 'authenticated'
    when has_function_privilege('anon', p.oid, 'execute')          then 'anon only'
    else 'NO EXECUTE GRANT'
  end                                      as callable_by
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'staff_add_walkin', 'staff_check_in', 'staff_undo_check_in',
    'organizer_registrations', 'staff_decide_payment',
    'staff_publish_round', 'staff_clear_round',
    'staff_record_result', 'staff_clear_result',
    'staff_games', 'event_round_boards', 'event_current_round'
  )
order by p.proname;

-- The games table must exist with row level security on. A table without RLS is
-- readable by anyone holding the anon key.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policy where polrelid = c.oid) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('games', 'staff_allowlist');

-- What is actually in there, so a leftover test row cannot hide.
select
  (select count(*) from public.records
     where collection = 'registrations' and status = 'active') as registrations,
  (select count(*) from public.records
     where collection = 'registrations' and status = 'active'
       and checked_in_at is not null)                          as checked_in,
  (select count(*) from public.games)                          as games;
SQL

echo
echo "== Done"
