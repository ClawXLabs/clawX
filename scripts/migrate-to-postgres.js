const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const dataDir = path.join(process.cwd(), 'data');

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`${name}: ${error.message}`);
  }
}

function toDate(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

async function migrateEnrollment(client, wallet, row) {
  const key = wallet.toLowerCase();
  const normalized = {
    ...row,
    wallet: key,
    tradeLog: row.tradeLog || [],
    pendingOutcomes: row.pendingOutcomes || [],
    lifetimeTxCount: Number(row.lifetimeTxCount) || 0,
  };
  await client.query(
    `INSERT INTO enrollments (
       wallet, agent_id, agent_name, status, paused, trade_size_tusdc,
       agent_memory, pending_outcomes, lifetime_tx_count, payload,
       created_at, updated_at, last_trade_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,
       COALESCE($11,NOW()),COALESCE($12,NOW()),$13)
     ON CONFLICT (wallet) DO UPDATE SET
       agent_id=EXCLUDED.agent_id, agent_name=EXCLUDED.agent_name,
       status=EXCLUDED.status, paused=EXCLUDED.paused,
       trade_size_tusdc=EXCLUDED.trade_size_tusdc,
       agent_memory=EXCLUDED.agent_memory,
       pending_outcomes=EXCLUDED.pending_outcomes,
       lifetime_tx_count=EXCLUDED.lifetime_tx_count,
       payload=EXCLUDED.payload, updated_at=EXCLUDED.updated_at,
       last_trade_at=EXCLUDED.last_trade_at`,
    [
      key,
      normalized.agentId,
      normalized.agentName || null,
      normalized.status || 'active',
      Boolean(normalized.paused),
      normalized.tradeSizeTusdc ?? null,
      JSON.stringify(normalized.agentMemory ?? null),
      JSON.stringify(normalized.pendingOutcomes),
      normalized.lifetimeTxCount,
      JSON.stringify(normalized),
      toDate(normalized.startedAt),
      toDate(normalized.updatedAt),
      toDate(normalized.lastTradeAt),
    ]
  );

  for (const trade of normalized.tradeLog) {
    await client.query(
      `INSERT INTO trade_log (
         wallet, round_id, side, action, symbol, amount_tusdc, hash,
         outcome, thought, payload, created_at, settled_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,COALESCE($11,NOW()),$12)
       ON CONFLICT (wallet, round_id, side, action) DO UPDATE SET
         hash=EXCLUDED.hash, outcome=EXCLUDED.outcome,
         payload=EXCLUDED.payload, settled_at=EXCLUDED.settled_at`,
      [
        key,
        Number(trade.roundId),
        trade.side || (trade.isUp ? 'UP' : 'DOWN'),
        trade.action || 'BUY',
        trade.symbol || null,
        trade.amountTusdc ?? null,
        trade.hash || null,
        trade.outcome || null,
        trade.thought || null,
        JSON.stringify(trade),
        toDate(trade.at),
        toDate(trade.settledAt),
      ]
    );
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === 'false' || process.env.NODE_ENV !== 'production'
        ? false
        : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' },
  });
  const client = await pool.connect();

  try {
    const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');
    await client.query('BEGIN');
    await client.query(schema);

    const enrollments = readJson('agent-enrollments.json', {});
    const feed = readJson('agent-feed.json', []);
    const profiles = readJson('wallet-profiles.json', {});
    const faucetClaims = readJson('faucet-claims.json', {});

    for (const [wallet, row] of Object.entries(enrollments)) {
      await migrateEnrollment(client, wallet, row);
    }
    for (const message of feed) {
      await client.query(
        `INSERT INTO feed_messages (
           id, agent_id, agent_name, handle, color, text, kind,
           pilot_wallet, pilot_name, payload, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,COALESCE($11,NOW()))
         ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload`,
        [
          String(message.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          message.agentId || null,
          message.agentName || null,
          message.handle || null,
          message.color || null,
          message.text || '',
          message.kind || null,
          message.pilotWallet?.toLowerCase() || null,
          message.pilotName || null,
          JSON.stringify(message),
          toDate(message.at),
        ]
      );
    }
    for (const [wallet, profile] of Object.entries(profiles)) {
      await client.query(
        `INSERT INTO wallet_profiles (wallet, display_name, social_links, updated_at)
         VALUES ($1,$2,$3::jsonb,COALESCE($4,NOW()))
         ON CONFLICT (wallet) DO UPDATE SET
           display_name=EXCLUDED.display_name,
           social_links=EXCLUDED.social_links,
           updated_at=EXCLUDED.updated_at`,
        [
          wallet.toLowerCase(),
          profile.displayName || null,
          JSON.stringify(profile.socialLinks || {}),
          toDate(profile.updatedAt),
        ]
      );
    }
    for (const [wallet, value] of Object.entries(faucetClaims)) {
      const lastClaim = typeof value === 'object' ? value.lastClaim : value;
      const claimCount = typeof value === 'object' ? Number(value.claimCount) || 1 : 1;
      const date = toDate(lastClaim);
      if (!date) continue;
      await client.query(
        `INSERT INTO faucet_claims (wallet, last_claim, claim_count)
         VALUES ($1,$2,$3)
         ON CONFLICT (wallet) DO UPDATE SET
           last_claim=EXCLUDED.last_claim, claim_count=EXCLUDED.claim_count`,
        [wallet.toLowerCase(), date, claimCount]
      );
    }

    await client.query('COMMIT');
    console.log(
      `[db:migrate] Imported ${Object.keys(enrollments).length} enrollments, ` +
      `${feed.length} feed messages, ${Object.keys(profiles).length} profiles, and ` +
      `${Object.keys(faucetClaims).length} faucet claims`
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[db:migrate] Failed:', error.message || error);
  process.exit(1);
});
