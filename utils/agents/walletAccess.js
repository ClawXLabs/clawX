import { query } from '../db/postgres.js';

let ensured = false;

async function ensureTable() {
  if (ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS wallet_access (
      wallet TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'allowed',
      source TEXT NOT NULL DEFAULT 'landing',
      note TEXT NOT NULL DEFAULT '',
      referrer TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT
    )
  `);
  await query(`ALTER TABLE wallet_access ADD COLUMN IF NOT EXISTS referrer TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE wallet_access ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await query(`ALTER TABLE wallet_access ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_wallet_access_status ON wallet_access(status)
  `);
  ensured = true;
}

function walletKey(wallet) {
  return String(wallet || '').trim().toLowerCase();
}

function mapAccessRow(row) {
  if (!row) return null;
  return {
    wallet: row.wallet,
    status: row.status,
    source: row.source,
    note: row.note || '',
    referrer: row.referrer || '',
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at || row.updated_at,
  };
}

/**
 * Register (or re-affirm) a wallet for app access.
 * Landing "Add Wallet" uses source=landing and status=allowed.
 * Idempotent on LOWER(wallet); bumps last_seen_at on every call.
 */
export async function registerWalletAccess(wallet, {
  source = 'landing',
  status = 'allowed',
  note = '',
  referrer = '',
  metadata = null,
  updatedBy = null,
} = {}) {
  await ensureTable();
  const key = walletKey(wallet);
  if (!key) throw new Error('wallet required');

  const metaJson = JSON.stringify(
    metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  );

  const result = await query(
    `INSERT INTO wallet_access (
       wallet, status, source, note, referrer, metadata, updated_by, updated_at, last_seen_at
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW(), NOW())
     ON CONFLICT (wallet) DO UPDATE SET
       status = EXCLUDED.status,
       source = CASE
         WHEN wallet_access.source = 'admin' THEN wallet_access.source
         ELSE EXCLUDED.source
       END,
       note = CASE
         WHEN EXCLUDED.note <> '' THEN EXCLUDED.note
         ELSE wallet_access.note
       END,
       referrer = CASE
         WHEN EXCLUDED.referrer <> '' THEN EXCLUDED.referrer
         ELSE wallet_access.referrer
       END,
       metadata = CASE
         WHEN EXCLUDED.metadata <> '{}'::jsonb THEN EXCLUDED.metadata
         ELSE wallet_access.metadata
       END,
       updated_by = COALESCE(EXCLUDED.updated_by, wallet_access.updated_by),
       updated_at = NOW(),
       last_seen_at = NOW()
     RETURNING wallet, status, source, note, referrer, metadata,
               created_at, updated_at, last_seen_at`,
    [key, status, source, String(note || ''), String(referrer || '').slice(0, 500), metaJson, updatedBy]
  );

  return mapAccessRow(result.rows[0]);
}

export async function getWalletAccess(wallet) {
  await ensureTable();
  const key = walletKey(wallet);
  if (!key) return null;
  const result = await query(
    `SELECT wallet, status, source, note, referrer, metadata,
            created_at, updated_at, last_seen_at
     FROM wallet_access WHERE wallet = $1`,
    [key]
  );
  return mapAccessRow(result.rows[0]);
}

/**
 * Whether this wallet may use the app.
 * - Explicit revoked → deny
 * - Explicit allowed → allow
 * - APP_ACCESS_GATE !== 'true' → allow (collect wallets without locking existing users)
 * - Otherwise grandfather enrollments / profiles; deny unknown wallets
 */
export async function isWalletAllowed(wallet) {
  const key = walletKey(wallet);
  if (!key) return false;

  try {
    await ensureTable();
    const access = await getWalletAccess(key);
    if (access?.status === 'revoked') return false;
    if (access?.status === 'allowed') return true;

    const gateOn = String(process.env.APP_ACCESS_GATE || '').trim().toLowerCase() === 'true';
    if (!gateOn) return true;

    const grandfather = await query(
      `SELECT 1 AS ok WHERE EXISTS (
         SELECT 1 FROM enrollments WHERE LOWER(wallet) = $1
       ) OR EXISTS (
         SELECT 1 FROM wallet_profiles WHERE LOWER(wallet) = $1
       )`,
      [key]
    );
    return Boolean(grandfather.rows[0]);
  } catch (err) {
    console.warn('[walletAccess] check failed:', err?.message || err);
    // Fail open if DB/table issues so the app is not bricked.
    return true;
  }
}
