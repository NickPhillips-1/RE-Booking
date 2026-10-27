# Frontend

The booking page, confirmation receipt, login, and agent dashboard. Vite, React, TypeScript, React Router, and Luxon. See the [root README](../README.md) for the full stack.

```bash
npm install
npm run dev
```

The app calls the API at `VITE_API_URL`, defaulting to `http://localhost:3000`. Copy `.env.example` to `.env.local` to change it.

## Routes

- `/book/:slug`: public booking page
- `/book/:slug/confirmed#token=…`: receipt with a cancel link
- `/login`: realtor or guest login
- `/signup`: create a guest account
- `/guest`: a logged-in guest's appointments
- `/dashboard`, `/dashboard/hours`, `/dashboard/meetings`: schedule, weekly hours, and meeting types, inside the dashboard header and sidebar

## Code

- `src/api.ts`: one typed function per database RPC, plus `useLoad` for fetching
- `src/auth.ts`: the session token, realtor or guest, kept in `sessionStorage`
- `src/time.ts`: timezone and calendar helpers
- `src/pages/`: one component per route
- `src/pages/dashboard/`: `DashboardLayout.tsx` (header and sidebar) and one file per dashboard view
- `src/ui/`: field, choice chips, and the dashboard shell

## API address

- Vite dev server and Vercel: `VITE_API_URL` is compiled into the build.
- Docker image: nginx answers `/config.js` with the container's `API_URL`, read at start. That value wins over the build-time one.
