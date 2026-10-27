#!/bin/sh
set -eu

psql="psql -X -q -v ON_ERROR_STOP=1"

$psql -c "create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
)"

for file in /db/migrations/*.sql; do
  version=$(basename "$file" .sql)
  case $version in
    *[!A-Za-z0-9_]*)
      echo "migrate: version must be letters, digits, and underscores: $version" >&2
      exit 1
      ;;
  esac
  applied=$($psql -tA -c "select 1 from public.schema_migrations where version = '$version'")
  if [ -z "$applied" ]; then
    echo "migrate: applying $version"
    $psql -1 -f "$file" -c "insert into public.schema_migrations (version) values ('$version')"
  fi
done

$psql -v authenticator_password="$AUTHENTICATOR_PASSWORD" -v jwt_secret="$PGRST_JWT_SECRET" <<'SQL'
alter role authenticator with password :'authenticator_password';
select current_database() as db \gset
alter database :"db" set app.jwt_secret = :'jwt_secret';
notify pgrst, 'reload schema';
SQL

echo "migrate: up to date"
