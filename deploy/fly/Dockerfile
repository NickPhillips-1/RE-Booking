FROM postgres:16.15-alpine

RUN apk add --no-cache caddy ca-certificates tar xz \
  && wget -O /tmp/postgrest.tar.xz \
    https://github.com/PostgREST/postgrest/releases/download/v14.18/postgrest-v14.18-linux-static-x86-64.tar.xz \
  && tar -xJf /tmp/postgrest.tar.xz -C /usr/local/bin \
  && rm /tmp/postgrest.tar.xz \
  && chmod +x /usr/local/bin/postgrest

COPY db /db
COPY deploy/migrate.sh /deploy/migrate.sh
COPY db/seed /db/seed
COPY deploy/fly/Caddyfile /etc/caddy/Caddyfile
COPY deploy/fly/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh /deploy/migrate.sh

ENV PGDATA=/var/lib/postgresql/data/pgdata \
    POSTGRES_USER=booking \
    POSTGRES_DB=booking

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
