#!/usr/bin/env bash
#
# Refuses to find a credential in anything git tracks — working tree and history.
#
# Run before a push, and after any session where a key was pasted somewhere. A secret
# in history is not removed by deleting the file: the old commit still carries it, and
# anybody who clones the repository gets it.
#
# Exits non-zero if anything matches, so it can be used as a pre-push hook:
#   ln -s ../../scripts/check-secrets.sh .git/hooks/pre-push

set -uo pipefail

cd "$(dirname "$0")/.."

# Placeholders in documentation are not secrets, so the example file is excluded by
# name rather than by pattern — a real key pasted into .env.example would then be
# caught by the history scan below.
# A placeholder is not a credential. The connection-string pattern therefore excludes
# anything with < > in it, which is how every example in this repository is written — a
# scanner that reports the documentation is a scanner people learn to ignore.
PATTERNS='re_[A-Za-z0-9_]{20,}|sb_secret_[A-Za-z0-9_-]{10,}|BEGIN [A-Z ]*PRIVATE KEY|"private_key"|AIza[0-9A-Za-z_-]{30,}|postgresql://[^<> "]*:[^<> "@]{6,}@'

fail=0

echo "== Working tree"
# This script is excluded from its own scan: the patterns it looks for are, necessarily,
# written down in it. Without this it reports itself the moment it is committed, and a
# scanner whose first finding is a false alarm does not get run twice.
if git grep -nIE "$PATTERNS" -- . ':!.env.example' ':!scripts/check-secrets.sh' 2>/dev/null; then
  echo "!! a credential appears in a tracked file" >&2
  fail=1
else
  echo "clean"
fi

echo
echo "== Files that should never be tracked"
# .env.example is meant to be tracked; it holds names, not values.
if git ls-files | grep -viE '(^|/)\.env\.example$' | grep -iE '(^|/)\.env(\.|$)|service.?account|\.pem$|\.p12$|credentials.*\.json$'; then
  echo "!! a credential file is tracked" >&2
  fail=1
else
  echo "clean"
fi

echo
echo "== History"
# Every commit's contents, not just the current ones.
found=$(git log --all -p --no-color -- . ':!scripts/check-secrets.sh' 2>/dev/null \
  | grep -aoE "$PATTERNS" | sort -u | head -20)
if [ -n "$found" ]; then
  echo "!! a credential appears somewhere in history" >&2
  printf '%s\n' "$found" >&2
  fail=1
else
  echo "clean"
fi

echo
if [ "$fail" -ne 0 ]; then
  cat >&2 <<'MSG'
Do not push. Rotate whatever was found first — a secret that has been committed must
be treated as public, whether or not the repository is. Removing the file is not
enough; the commit still contains it.
MSG
  exit 1
fi

echo "No credentials found in anything git tracks."
