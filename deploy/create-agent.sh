#!/bin/sh
# Creates an agent with Monday to Friday hours and two meeting types, or sets a new
# password for an existing slug (which ends that agent's sessions).
#
#   deploy/create-agent.sh <slug> <email> <name> <brand name> <timezone>
#
# Prompts for the password. For production, pass the compose command:
#   COMPOSE="docker compose --env-file .env.production -f compose.yaml -f compose.prod.yaml" \
#     deploy/create-agent.sh jane jane@example.com "Jane Rivera" "Jane Rivera Homes" America/New_York
set -eu

if [ $# -ne 5 ]; then
  echo "usage: $0 <slug> <email> <name> <brand name> <timezone>" >&2
  exit 64
fi

printf 'Password for %s: ' "$2" >&2
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

# The password travels on stdin as a psql \set line, so it stays out of process arguments.
escaped=$(printf '%s' "$password" | sed -e 's/\\/\\\\/g' -e "s/'/''/g")
{
  printf "\\\\set password '%s'\n" "$escaped"
  cat "$(dirname "$0")/../db/seed/agent.sql"
} | ${COMPOSE:-docker compose} exec -T postgres sh -c \
  'exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql \
  -v slug="$1" -v email="$2" -v name="$3" -v brand_name="$4" -v timezone="$5" -f -

echo "Saved $2. Booking page: /book/$1" >&2
