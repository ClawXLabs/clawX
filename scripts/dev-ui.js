/**
 * Frontend-only dev server: `npm run dev:ui`
 *
 * Runs plain `next dev` with CLAWX_UI_ONLY=1 — no WebSocket gateway, no
 * Redis, no Postgres, no keeper/agent services required.
 *
 * What still works: all pages, chain data (Fuji RPC), live prices via
 * /api/prices HTTP polling (direct CEX fetch), manual trades/claims.
 * What degrades: agent feed, candle history (synthetic fallback), and
 * anything Postgres-backed (profiles, trade ledger persistence).
 */
const { spawn } = require('child_process');
const path = require('path');

const port = process.env.PORT || '3000';
const nextBin = path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');

const child = spawn(process.execPath, [nextBin, 'dev', '-p', port], {
  stdio: 'inherit',
  env: { ...process.env, CLAWX_UI_ONLY: '1', NEXT_PUBLIC_UI_ONLY: '1' },
});

child.on('exit', (code) => process.exit(code ?? 0));
