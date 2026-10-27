#!/bin/sh
set -eu

if [ $# -ne 3 ]; then
  echo "usage: $0 <email> <name> <phone>" >&2
  exit 64
fi

printf 'Password for %s: ' "$1" >&2
if [ -t 0 ]; then
  trap 'stty echo' EXIT INT TERM
  stty -echo
fi
IFS= read -r password
[ -t 0 ] && stty echo
echo >&2

if [ "${#password}" -lt 12 ]; then
  echo "Use at least 12 characters." >&2
  exit 65
fi

escaped=$(printf '%s' "$password" | sed -e 's/\\/\\\\/g' -e "s/'/''/g")
{
  printf "\\\\set password '%s'\n" "$escaped"
  cat "$(dirname "$0")/../db/seed/client.sql"
} | ${COMPOSE:-docker compose} exec -T postgres sh -c \
  'exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql \
  -v email="$1" -v name="$2" -v phone="$3" -f -

echo "Saved $1." >&2
