# Local / visitor stack (8GB-friendly)

Run ClawX on a small box for **dev** or **read-mostly visitor access**. Fuji contracts stay on Avalanche — this machine only hosts the app + DB.

## Modes

| Mode | Processes | RAM ballpark |
|------|-----------|--------------|
| **Visitor** (default) | Postgres, Redis, `clawx-web`, `clawx-price-fetcher` | ~2–3 GB + OS |
| **Settle rounds** | + `clawx-keeper` | +~256 MB |
| **Agents** | + scheduler + 1 worker | +~0.5–1 GB |
| **Admin** | separate `clawX-admin` when needed | +~300–800 MB |

## Boot (visitor mode)

```bash
# 1) Infra
npm run local:infra
npm run db:init   # first time only

# 2) Build once (do this when the stack is idle)
npm run build

# 3) Web + price charts
npm run local:web
npm run local:status
```

Point `.env` at local Postgres/Redis from `docker-compose.infrastructure.yml`, or at RDS only if you intentionally want live production data.

Admin (optional):

```bash
cd ../clawX-admin
npm run dev   # http://localhost:3100
```

## Agents on / off

```bash
# Start agents + clear pause flag
npm run local:agents:on

# Stop agent PM2 processes + set agents_paused=true + publish banner text
npm run local:agents:off
```

Or flip the flag without touching PM2 (useful on AWS too):

```bash
npm run agents:pause     # banner on, execute/enroll blocked
npm run agents:unpause   # banner off
```

The public banner comes from `GET /api/platform-status` and also reflects **Platform → Pause agents** in the admin desk.

## What visitors can do when agents are off

- Browse markets, history, leaderboard, profiles
- Read `/api/v1/stats` and other read APIs
- Connect wallets (session cookie)

Blocked while `agents_paused`:

- New agent enrollment
- Agent trade execution
- Scheduler enqueue (even if processes were left running)

## LAN access (e.g. `192.168.1.41`)

`server.js` already binds `HOST=0.0.0.0` by default, so other devices on your Wi‑Fi can reach the box.

On the machine at `192.168.1.41`, set in `.env` (or the shell before PM2):

```bash
HOST=0.0.0.0
PORT=3000
APP_URL=http://192.168.1.41:3000
NEXT_PUBLIC_APP_URL=http://192.168.1.41:3000
```

Then open **http://192.168.1.41:3000** from phones/laptops on the same network.

Allow inbound TCP **3000** (and **5432/6379** only if you need remote DB/Redis — usually keep those localhost-only). On Windows: Defender Firewall → inbound rule for Node / port 3000.

Agents that call the app must use the same `APP_URL` (scheduler/worker → `http://192.168.1.41:3000`).

## Notes

- Prefer Linux on the i3/8GB box; leave Windows for editing if needed.
- Do not run `next build` while the live stack is already memory-tight.
- Keeper is optional for pure browse mode; without it, open rounds will not auto-settle on this host.
- Production AWS remains the recommended 24/7 home; this layout is for slim/local operation.
