---
name: deploy-production
description: Deploy the RE-Booking frontend to Vercel and the PostgREST API plus Postgres to Fly. Use when the user asks to deploy, redeploy, ship, or update production, including schema migrations on Fly.
---

# Deploy production

Frontend is Vercel. API, migrations, and Postgres are one Fly machine. The FastAPI app in `backend/` is unused in production; do not deploy it.

## Targets

| Piece | Value |
| --- | --- |
| Fly app | `re-booking-api` in `iad` |
| Image | `fly.toml`, `deploy/fly/Dockerfile` |
| API | `https://re-booking-api.fly.dev` |
| Volume | `pgdata` (1 GB) at `/var/lib/postgresql/data` (Postgres uses the `pgdata` subdirectory) |
| Vercel project | `prompt-crystal-p31u3fq`, scope `nick-e190`, root `frontend/` |
| Site | `https://prompt-crystal-p31u3fq-nick-e190.vercel.app` |
| `VITE_API_URL` | `https://re-booking-api.fly.dev` (also in `frontend/.env.production.local`) |

`deploy/fly/entrypoint.sh` starts Postgres, runs `deploy/migrate.sh`, then PostgREST and Caddy. Vite bakes `VITE_API_URL` at build time. `CORS_ALLOWED_ORIGINS` on Fly must include the Vercel origin, with no trailing slash.

## Before starting

1. `fly auth whoami`
2. `npx vercel whoami` from `frontend/`

If either is logged out, start login and stop.

## What to ship

- Changes in `db/`, `deploy/fly/`, or `fly.toml`: Fly only. New files in `db/migrations/` apply on boot and are recorded in `public.schema_migrations`.
- Frontend-only changes: Vercel production only.
- A plain "deploy": Fly first, then Vercel.

## Commands

From the repo root:

```bash
fly deploy --remote-only --ha=false --yes --app re-booking-api
```

`--ha=false` is required because there is one volume.

From `frontend/`:

```bash
npx vercel deploy --prod --yes --project prompt-crystal-p31u3fq --scope nick-e190
```

## Do not

- Recreate `POSTGRES_PASSWORD`, `AUTHENTICATOR_PASSWORD`, or `PGRST_JWT_SECRET`. A new JWT secret logs every session out. Set those only when `fly apps list` shows the app does not exist yet.
- Reset `SEED_AGENT_PASSWORD` or `SEED_CLIENT_PASSWORD`. The entrypoint re-seeds on boot when they are set; a different password replaces the current one and ends that account's sessions.
- Destroy the app or the `pgdata` volume.
- Print secret values. Do not commit `.env` or `.env.production.local`.
- Set `VITE_API_URL` on Vercel Preview.

## First boot only

Use this path only when the app or volume is missing.

1. `fly apps create re-booking-api --org personal`
2. `fly volumes create pgdata --region iad --size 1 --app re-booking-api --yes`
3. Generate three secrets once: `openssl rand -base64 48 | tr -d '/+=\n'`
4. Set Fly secrets: the three generated values, `CORS_ALLOWED_ORIGINS=https://prompt-crystal-p31u3fq-nick-e190.vercel.app`, and the existing seed passwords from `.env`. Do not print them.
5. `fly deploy --remote-only --ha=false --yes --app re-booking-api`
6. `npx vercel env add VITE_API_URL` for production only, value `https://re-booking-api.fly.dev`
7. Deploy the frontend as above.

## After deploy

Skip the Vercel check if this was Fly-only. Skip health and RPC if this was frontend-only.

```bash
curl -sS -m 30 -D - -o /tmp/health.txt "https://re-booking-api.fly.dev/health"
cat /tmp/health.txt
```

Body should be `ok`. If it fails, wait about 90s, then `fly logs --app re-booking-api --no-tail`.

```bash
curl -sS -m 30 -X POST "https://re-booking-api.fly.dev/rpc/booking_page" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Origin: https://prompt-crystal-p31u3fq-nick-e190.vercel.app" \
  -d '{"slug":"jane"}'
```

Returns Jane’s booking page JSON, not a CORS or 4xx error.

```bash
html=$(curl -sS -m 20 "https://prompt-crystal-p31u3fq-nick-e190.vercel.app/")
js=$(printf '%s' "$html" | sed -n 's/.*src="\(\/assets\/[^"]*\.js\)".*/\1/p')
echo "JS=$js"
curl -sS -m 20 "https://prompt-crystal-p31u3fq-nick-e190.vercel.app$js" | grep -o 'https://re-booking-api.fly.dev' | head -n 1
```

Prints `https://re-booking-api.fly.dev`.
