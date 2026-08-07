#!/usr/bin/env node
/**
 * Toggle platform_config.agents_paused (+ optional announcement).
 * Usage:
 *   node scripts/set-agents-paused.js on
 *   node scripts/set-agents-paused.js off
 *   node scripts/set-agents-paused.js on --message "Agent trading is temporarily shut down."
 */
require('dotenv').config();

const DEFAULT_OFF_MESSAGE =
  'Agent trading is temporarily shut down. Markets and history remain available.';

async function main() {
  const mode = String(process.argv[2] || '').toLowerCase();
  if (mode !== 'on' && mode !== 'off') {
    console.error('Usage: node scripts/set-agents-paused.js <on|off> [--message "..."]');
    process.exit(1);
  }
  const paused = mode === 'on';

  let message = '';
  const msgIdx = process.argv.indexOf('--message');
  if (msgIdx >= 0 && process.argv[msgIdx + 1]) {
    message = String(process.argv[msgIdx + 1]);
  } else if (paused) {
    message = DEFAULT_OFF_MESSAGE;
  }

  const { query } = await import('../utils/db/postgres.js');
  await query(
    `INSERT INTO platform_config (
       id, agents_paused, announcement, announcement_published_at, updated_at
     ) VALUES (
       'default', $1, $2, CASE WHEN $1::boolean THEN NOW() ELSE NULL END, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       agents_paused = EXCLUDED.agents_paused,
       announcement = EXCLUDED.announcement,
       announcement_published_at = CASE
         WHEN $1::boolean THEN NOW()
         ELSE NULL
       END,
       updated_at = NOW()`,
    [paused, message]
  );

  console.log(
    `[set-agents-paused] agents_paused=${paused}` +
      (message ? ` announcement=${JSON.stringify(message)}` : ' announcement cleared')
  );
}

main().catch((err) => {
  console.error('[set-agents-paused]', err?.message || err);
  process.exit(1);
});
