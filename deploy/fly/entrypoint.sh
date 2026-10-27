#!/bin/sh
set -eu

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${AUTHENTICATOR_PASSWORD:?AUTHENTICATOR_PASSWORD is required}"
: "${PGRST_JWT_SECRET:?PGRST_JWT_SECRET is required}"
: "${CORS_ALLOWED_ORIGINS:?CORS_ALLOWED_ORIGINS is required}"

export POSTGRES_USER="${POSTGRES_USER:-booking}"
export POSTGRES_DB="${POSTGRES_DB:-booking}"
export PGDATA="${PGDATA:-/var/lib/postgresql/data/pgdata}"
export PGHOST=127.0.0.1
export PGUSER="$POSTGRES_USER"
export PGPASSWORD="$POSTGRES_PASSWORD"
export PGDATABASE="$POSTGRES_DB"

postgres_pid=
postgrest_pid=
caddy_pid=

shutdown() {
  [ -n "$caddy_pid" ] && kill "$caddy_pid" 2>/dev/null || true
  [ -n "$postgrest_pid" ] && kill "$postgrest_pid" 2>/dev/null || true
  [ -n "$postgres_pid" ] && kill "$postgres_pid" 2>/dev/null || true
  wait || true
  exit 0
}
trap shutdown TERM INT

mkdir -p "$PGDATA"
docker-entrypoint.sh postgres &
postgres_pid=$!

i=0
until pg_isready -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 90 ]; then
    echo "postgres did not become ready" >&2
    exit 1
  fi
  sleep 1
done

sh /deploy/migrate.sh

if [ -n "${SEED_AGENT_PASSWORD:-}" ]; then
  escaped=$(printf '%s' "$SEED_AGENT_PASSWORD" | sed -e 's/\\/\\\\/g' -e "s/'/''/g")
  {
    printf "\\\\set password '%s'\n" "$escaped"
    cat /db/seed/agent.sql
  } | psql -X -q -v ON_ERROR_STOP=1 \
    -v slug=jane -v email=jane@example.com -v name='Jane Rivera' \
    -v brand_name='Jane Rivera Homes' -v timezone=America/New_York \
    -f -
fi

if [ -n "${SEED_CLIENT_PASSWORD:-}" ]; then
  escaped=$(printf '%s' "$SEED_CLIENT_PASSWORD" | sed -e 's/\\/\\\\/g' -e "s/'/''/g")
  {
    printf "\\\\set password '%s'\n" "$escaped"
    cat /db/seed/client.sql
  } | psql -X -q -v ON_ERROR_STOP=1 \
    -v email=client@example.com -v name='Alex Chen' -v phone='555-010-0100' \
    -f -
fi

export PGRST_DB_URI="postgres://authenticator:${AUTHENTICATOR_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}"
export PGRST_DB_SCHEMAS=api
export PGRST_DB_ANON_ROLE=web_anon
export PGRST_DB_EXTRA_SEARCH_PATH=
export PGRST_DB_PRE_REQUEST=api.pre_request
export PGRST_JWT_SECRET
export PGRST_SERVER_CORS_ALLOWED_ORIGINS="$CORS_ALLOWED_ORIGINS"
export PGRST_ADMIN_SERVER_HOST=127.0.0.1
export PGRST_ADMIN_SERVER_PORT=3001
export PGRST_SERVER_PORT=3000
export PGRST_LOG_LEVEL=warn

postgrest &
postgrest_pid=$!

i=0
until postgrest --ready >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 30 ]; then
    echo "postgrest did not become ready" >&2
    exit 1
  fi
  sleep 1
done

caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
caddy_pid=$!
wait "$caddy_pid"
