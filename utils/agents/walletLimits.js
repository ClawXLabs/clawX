import { query } from '../db/postgres.js';
import { getPlatformConfig } from '../platformConfig.js';

/** Practical on-chain budget when admin sets agent spend to None (unlimited). */
export const UNLIMITED_DELEGATE_TUSDC = 1_000_000;

function defaultLimits() {
  return {
    tx_unlimited: true,
    tx_limit: null,
    faucet_blocked: false,
    relayer_blocked: false,
    agent_spend_unlimited: true,
    agent_spend_limit_tusdc: null,
    agent_trade_size_tusdc: null,
  };
}

function limitsFromPlatform(platform) {
  return {
    tx_unlimited: platform.default_tx_unlimited !== false,
    tx_limit:
      platform.default_tx_unlimited !== false
        ? null
        : platform.default_tx_limit == null
          ? null
          : Number(platform.default_tx_limit),
    faucet_blocked: false,
    relayer_blocked: false,
    agent_spend_unlimited: platform.default_agent_spend_unlimited !== false,
    agent_spend_limit_tusdc:
      platform.default_agent_spend_unlimited !== false
        ? null
        : platform.default_agent_spend_limit_tusdc == null
          ? null
          : Number(platform.default_agent_spend_limit_tusdc),
    agent_trade_size_tusdc:
      platform.default_agent_trade_size_tusdc == null
        ? null
        : Number(platform.default_agent_trade_size_tusdc),
  };
}

/**
 * Platform policy for a wallet (admin-controlled).
 * Missing wallet_limits row → platform_config defaults (None unless admin set global caps).
 */
export async function getWalletLimits(wallet) {
  const key = String(wallet || '').toLowerCase();
  if (!key) return defaultLimits();
  try {
    const [result, platform] = await Promise.all([
      query(
        `SELECT tx_limit, tx_unlimited, faucet_blocked, relayer_blocked,
                agent_spend_limit_tusdc, agent_spend_unlimited, agent_trade_size_tusdc
         FROM wallet_limits WHERE LOWER(wallet) = $1`,
        [key]
      ),
      getPlatformConfig(),
    ]);
    const row = result.rows[0];
    if (!row) return limitsFromPlatform(platform);
    return {
      tx_limit: row.tx_limit == null ? null : Number(row.tx_limit),
      tx_unlimited: row.tx_unlimited !== false,
      faucet_blocked: Boolean(row.faucet_blocked),
      relayer_blocked: Boolean(row.relayer_blocked),
      agent_spend_limit_tusdc:
        row.agent_spend_limit_tusdc == null ? null : Number(row.agent_spend_limit_tusdc),
      agent_spend_unlimited: row.agent_spend_unlimited !== false,
      agent_trade_size_tusdc:
        row.agent_trade_size_tusdc == null ? null : Number(row.agent_trade_size_tusdc),
    };
  } catch (err) {
    // Table may not exist yet on older DBs — fail open for agent trading.
    console.warn('[walletLimits] read failed:', err?.message || err);
    return defaultLimits();
  }
}

/**
 * Resolve the agent delegate spending budget in TUSDC.
 * Admin "None" → large practical unlimited; otherwise use agent_spend_limit_tusdc.
 */
export function resolveDelegateMaxTusdc(limits) {
  if (!limits || limits.agent_spend_unlimited) {
    return UNLIMITED_DELEGATE_TUSDC;
  }
  const cap = Number(limits.agent_spend_limit_tusdc);
  if (!Number.isFinite(cap) || cap <= 0) return 0;
  return cap;
}

/**
 * Lifetime BUY count gate. Returns { ok, buys, limit, remaining, unlimited }.
 */
export async function checkTxLimit(wallet) {
  const limits = await getWalletLimits(wallet);
  const buys = await getLifetimeBuyCount(wallet);
  if (limits.tx_unlimited) {
    return {
      ok: true,
      unlimited: true,
      buys,
      limit: null,
      remaining: null,
      limits,
    };
  }
  const limit = Number(limits.tx_limit);
  if (!Number.isFinite(limit) || limit < 0) {
    return { ok: false, unlimited: false, buys, limit: 0, remaining: 0, limits };
  }
  const remaining = Math.max(0, limit - buys);
  return {
    ok: buys < limit,
    unlimited: false,
    buys,
    limit,
    remaining,
    limits,
  };
}

/** Lifetime agent BUY volume in TUSDC from trade_log. */
export async function getAgentBuyVolumeTusdc(wallet) {
  const result = await query(
    `SELECT COALESCE(SUM(amount_tusdc), 0)::float8 AS volume
     FROM trade_log
     WHERE LOWER(wallet) = $1 AND action = 'BUY'`,
    [String(wallet).toLowerCase()]
  );
  return Number(result.rows[0]?.volume || 0);
}

export async function getLifetimeBuyCount(wallet) {
  const result = await query(
    `SELECT COUNT(*)::int AS cnt
     FROM trade_log
     WHERE LOWER(wallet) = $1 AND action = 'BUY'`,
    [String(wallet).toLowerCase()]
  );
  return Number(result.rows[0]?.cnt || 0);
}
