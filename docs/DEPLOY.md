# Deploying Criminal Rush to Vercel (with online join-by-code)

The app is a Vite single-page app plus a handful of serverless functions in
`/api`. The game is online-only: players create or join a room by code. Rooms
are stored in **Upstash Redis** (Vercel's KV Marketplace integration), so a
store is required for the app to work.

> You run these commands — this environment can't authenticate to Vercel.

## What's in the repo already

- `vercel.json` — build command (`npm run build`), output dir (`dist`), and an
  SPA rewrite that leaves `/api/*` alone.
- `api/create.ts`, `api/join.ts`, `api/leave.ts`, `api/start.ts`,
  `api/state.ts`, `api/action.ts` — the room endpoints. (`leave` releases a
  seat in a not-yet-started room and deletes the room once it's empty.)
- `api/_store.ts` — Redis access, with an in-memory fallback when the Redis env
  vars are absent (so `vercel dev` works before you connect a store).

## 1. Install the CLI and link the project

```bash
npm i -g vercel
cd criminal_rush_game
vercel link          # pick or create a project
```

## 2. Add a Redis store (for online rooms)

In the Vercel dashboard: **Storage → Create Database → Upstash Redis** (Redis),
then **Connect** it to this project. That injects these env vars automatically:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

The code also accepts `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` if
you provision Upstash directly instead.

Pull them locally if you want to test with real Redis:

```bash
vercel env pull .env.local
```

## 3. Run locally (optional)

```bash
vercel dev          # serves the SPA + /api together on localhost
```

- Without Redis env vars, rooms live in the function's memory (fine for a quick
  single-machine test; not durable).
- With them pulled into `.env.local`, rooms persist in Upstash.

Plain `npm run dev` (Vite only) serves the UI but **not** `/api`, so the game
won't function there — use `vercel dev` (or a deploy) so the room endpoints run.

## 4. Deploy

```bash
vercel            # preview deploy
vercel --prod     # production
```

Open the URL, choose **Play online**, create a room, and share the 4-letter
code. Each player opens the same URL on their own device and joins with the
code; everyone polls `/api/state` (~1.5s) for updates.

## Smoke-test the API

Once a server is up **with a shared store** (a deployment with Upstash/KV, or
`vercel dev` after `vercel env pull .env.local`), run the end-to-end check:

```bash
node scripts/online-smoke.mjs                 # defaults to http://localhost:3000
node scripts/online-smoke.mjs https://your-app.vercel.app
```

It walks create → join → leave → start → redaction → a turn action, and checks
turn authority and per-player hand redaction. Exit code 0 = pass.

> It will fail against the in-memory fallback (no Redis): that store isn't
> shared across the separate `/api` functions, so `create` and `join` wouldn't
> see the same room. Connect a store first.

## How privacy works

The server holds the authoritative game state and sends each player only their
**own** redacted view: other players' hands and the draw pile are reduced to
counts, and the Spy's peek is shown only to the Spy. Roles, teams, money,
inventory, markets, the evidence grid, and status are all public (by design).

## Known limitation

Online **combat** (the Power-card phase, where the defender and teammates act
out of turn) is only partially wired: the server now accepts combat-phase
actions from any player in the room, but the combat UI/flow was still being
built in parallel. Turn-based play (draw, play, buy, sell, expose, expand,
end turn) works fully online. Verify a full combat online before relying on it.

## Troubleshooting

- **"No room with that code."** — the room expired (24h TTL) or the code was
  mistyped. Create a new one.
- **Online actions do nothing** — confirm the Redis integration is connected
  and env vars are present in the deployment (Settings → Environment Variables).
- **Everyone sees "Waiting for host"** — only the room creator (seat 1) can
  start, and only with 4+ players joined.
