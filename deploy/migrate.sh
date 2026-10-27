#!/bin/sh
# Applies db/migrations/*.sql in filename order, once each, then copies the
# authenticator password and JWT secret from the environment into the database.
# Connection settings come from PGHOST, PGUSER, PGPASSWORD, and PGDATABASE.
set -eu

psql="psql -X -q -v ON_ERROR_STOP=1"

$psql -c "create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
)"

for file in /db/migrations/*.sql; do
  version=$(basename "$file" .sql)
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
