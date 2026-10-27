# RE-Booking

A booking page for a real estate agent. A visitor opens the agent's public link, picks a meeting type, a day, and a time, then leaves a name, email, phone, and which property they want to see. The agent logs in to set weekly hours and meeting types, and to cancel a booking.

The interface is specified in [DESIGN.md](DESIGN.md). Login is black and white, with one typeface and flat controls, in a 420px column. Booking, confirmation, client appointments, and the agent dashboard share a neutral white workspace set in Inter.

## Visitors

The public page lives at `/book/:slug`.

1. The top bar shows the agent's brand. Meeting types use a segmented control. The seed creates two: Consultation (30 min, video) and Showing (60 min, in person, 15 free minutes after). The selected type's duration and location are written once under the control.
2. A month calendar follows. Past days and days with no open times cannot be selected. Icon buttons move between months, up to 60 days ahead.
3. Open times are chips. A line above them names the timezone, for example "Times in America/New_York", and lets the visitor switch it.
4. The form asks for name, email, phone, and which property, chosen from the realtor's listings.
5. "Book" submits the visit.

If the agent has no weekly hours, the page shows "No open times yet."

A visitor with a client account can log in. Appointments booked during that session are listed at `/client`, where they can be cancelled. That page also lists realtor pages, so a client can book a demo without already knowing the slug. Booking without logging in still works; those appointments stay off the list and are cancelled from the confirmation page.

After a successful booking, `/book/:slug/confirmed` is titled "Booked". It shows the meeting, time, client, and property, then "Cancel appointment". The page address carries a private token, so the visitor can reload it or come back later to cancel.

If someone else takes the slot first, the page shows one sentence under the time chips, "That time was just taken.", and reloads the open times.

## Agents

`/login` asks for email and password, and a choice of Realtor or Client. A failed attempt shows "Email or password is wrong." under the button. A session lasts 12 hours and ends at "Log out" or when the tab closes. Realtor login opens the dashboard. Client login opens `/client`.

On a booking page, a logged-in client's name, email, and phone are filled from the account. The local seed accounts are under [Logins](#logins).

The dashboard has a top bar and a sidebar. The top bar shows the brand name on the left and an account menu on the right, with the agent's role, name, and email and a "Log out" item. The sidebar switches between three views. On a phone, the sidebar becomes a row of links under the top bar.

- **Schedule** (`/dashboard`). Appointments from today on, in a month calendar (the default view) or a list grouped by day. Filters show upcoming, all, or cancelled appointments. Each row shows the time, client, property, meeting type, and status, and opens a panel with the client's email and phone. A confirmed appointment can be cancelled from that panel.
- **Hours** (`/dashboard/hours`). One row per weekday, such as "9:00 AM–5:00 PM" or "Closed". Editing happens in the row. If every day is closed, the page says "The public page stays empty until hours are set."
- **Meetings** (`/dashboard/meetings`). Each type is a row with its name, duration, and whether it is active. "Add type" adds another row.

## How it works

- **Postgres 16** holds every rule. Open times come from one SQL function, `private.slot_candidates`, used by both the calendar and booking. An exclusion constraint on each booking's blocked range, buffers included, makes a double booking impossible even when two visitors submit the same time.
- **PostgREST** exposes only the functions in the `api` schema, at `POST /rpc/<name>`. Every call is a POST, because each request also writes a rate-limit counter. The functions are in [db/migrations/002_api.sql](db/migrations/002_api.sql).
- **The frontend** (`frontend/`) is a Vite, React, and TypeScript single-page app.

Agent login checks a bcrypt hash in Postgres and returns a signed JWT. PostgREST verifies it on each request and runs the call as the `agent` role. Client login does the same and runs as the `client` role. Setting a new password ends that person's existing sessions.

Rate limits are counted in Postgres, per client address and per subject. Every request also takes one hit from a global per-address bucket. `api.pre_request` rejects a call whose role does not match the page that owns the endpoint.

| Action | Limit |
| --- | --- |
| Every request | 300 per minute per address |
| Failed logins for one email, agent or client | 5 per 15 minutes, then correct passwords wait too |
| Agent and client logins from one address | 30 per 15 minutes |
| Client page reads | 120 per minute per address |
| Client appointment cancels | 60 per minute per client, and 60 per minute per address |
| Bookings for one email on one page | 8 per hour |
| Bookings from one address | 20 per hour |
| Receipt and cancel lookups | 60 per hour per address, 10 per hour per token |
| Booking page, calendar, and time reads | 120 per minute per address |
| Dashboard reads | 120 per minute per address |
| Dashboard changes | 60 per minute per agent, and 60 per minute per address |

Login accepts anonymous callers. The booking and confirmation pages do too. Client page endpoints accept a client session. Dashboard endpoints accept an agent session.

A limited request gets status 429 with a `Retry-After` header. The client address is the `X-Real-IP` header, which Caddy sets in production.

## Run locally

Requires Docker and Node 22.

```bash
cp .env.example .env
docker compose up -d
```

This starts Postgres, applies the migrations, seeds one agent and one client, and serves the API at [http://localhost:3000](http://localhost:3000). Then, from `frontend/`:

```bash
npm install
npm run dev
```

The app is at [http://localhost:5173](http://localhost:5173). The public booking page is [http://localhost:5173/book/jane](http://localhost:5173/book/jane).

### Logins

The seed creates two accounts. Passwords come from `.env`.

| Account | Email | Password | Page |
| --- | --- | --- | --- |
| Realtor, Jane Rivera | `jane@example.com` | `SEED_AGENT_PASSWORD` (`jane-dev-password`) | [http://localhost:5173/login](http://localhost:5173/login) |
| Client, Alex Chen | `client@example.com` | `SEED_CLIENT_PASSWORD` (`client-dev-password`) | [http://localhost:5173/login?as=client](http://localhost:5173/login?as=client) |

To start over with an empty database, run `docker compose down -v && docker compose up -d`.

## Checks

Frontend, from `frontend/`:

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

Backend, from `backend/`:

```bash
uv run ruff format --check .
uv run pytest
```

GitHub Actions runs format, typecheck, and tests on push and on pull requests, then builds the frontend. The workflow is [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Deploy

Both paths run Postgres, PostgREST, and Caddy on one Docker host. Caddy is the only container with public ports, and it gets TLS certificates automatically.

Copy the production settings and fill in every value. The file has a command for generating secrets.

```bash
cp .env.production.example .env.production
```

The commands below use this alias:

```bash
alias prod='docker compose --env-file .env.production -f compose.yaml -f compose.prod.yaml'
```

### Docker serves everything

Point DNS for `API_HOST` and `APP_HOST` at the server, keep `CADDYFILE=Caddyfile`, and set `CORS_ALLOWED_ORIGINS` to `https://<APP_HOST>`. Then:

```bash
prod up -d --build
```

The frontend image reads `API_URL` when the container starts, so one image works for any API address.

### Vercel serves the frontend

On the Docker host, set `CADDYFILE=Caddyfile.api` and set `CORS_ALLOWED_ORIGINS` to the Vercel production domain, then start only the API side:

```bash
prod up -d caddy
```

In Vercel, import the repository with these settings:

- Root directory: `frontend`
- Framework preset: Vite (also set in [frontend/vercel.json](frontend/vercel.json))
- Node.js version: 22
- Environment variable: `VITE_API_URL=https://<API_HOST>` for Production

`VITE_API_URL` is read at build time, so redeploy after changing it. Leave it unset for Preview deployments, or point it at a separate staging API, so previews never write to the production database. A preview's origin is also missing from `CORS_ALLOWED_ORIGINS`, so its API calls fail.

### Create an agent

The production overlay skips the dev seed. Create the first agent on the running stack:

```bash
COMPOSE="docker compose --env-file .env.production -f compose.yaml -f compose.prod.yaml" \
  deploy/create-agent.sh jane jane@example.com "Jane Rivera" "Jane Rivera Homes" America/New_York
```

The script prompts for the password. Running it again for the same slug sets a new password and ends that agent's sessions.

### Create a client

There is no public signup. Create a client the same way, against the running stack:

```bash
COMPOSE="docker compose --env-file .env.production -f compose.yaml -f compose.prod.yaml" \
  deploy/create-client.sh client@example.com "Alex Chen" "555-010-0100"
```

The script prompts for the password. Running it again for the same email sets a new password and ends that client's sessions. Name and phone stay as they were.

## Operations

- **Backups.** `prod exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql`. Bookings live only in the `pgdata` volume, and `down -v` deletes it.
- **Schema changes.** Add a numbered file such as `db/migrations/003_reminders.sql` and run `prod up -d`. The `migrate` service applies new files in order, records them in `public.schema_migrations`, and tells PostgREST to reload its schema cache.
- **Rotating secrets.** Change the value in `.env.production` and run `prod up -d`. `migrate` writes the new authenticator password and JWT secret into Postgres. A new JWT secret logs every agent out.
- **Rate limits during testing.** `docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "truncate private.rate_bucket"'` clears every counter.

## Layout

- `DESIGN.md`: screens and visual rules
- `db/migrations/`: schema, roles, and the `api` functions
- `db/seed/agent.sql`: one agent with hours and two meeting types
- `db/seed/client.sql`: one client account
- `deploy/`: migration runner, agent and client scripts, and Caddyfiles
- `compose.yaml`, `compose.prod.yaml`: local stack and production overlay
- `frontend/`: Vite, React, and TypeScript, plus its Dockerfile and `vercel.json`
- `backend/`: FastAPI `GET /health`, with its own checks. Booking goes through PostgREST.
- `.github/workflows/ci.yml`: format, typecheck, tests, then the frontend build
