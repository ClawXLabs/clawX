/**
 * Platform config from Postgres (admin-editable).
 * Falls back to env / defaults when DB is unavailable.
 */
import { query } from './db/postgres.js';

const DEFAULTS = {
  faucet_amount_tusdc: 300,
  faucet_cooldown_sec: 24 * 60 * 60,
  faucet_paused: false,
  trading_paused: false,
  agents_paused: false,
  claims_paused: false,
  maintenance_message: '',
  announcement: '',
  default_tx_unlimited: true,
  default_tx_limit: null,
  default_agent_spend_unlimited: true,
  default_agent_spend_limit_tusdc: null,
  default_agent_trade_size_tusdc: null,
};

function envCooldownFallback() {
  const raw = process.env.FAUCET_COOLDOWN_SEC;
  if (raw === undefined || raw === '') return DEFAULTS.faucet_cooldown_sec;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULTS.faucet_cooldown_sec;
  return Math.floor(n);
}

export async function getPlatformConfig() {
  try {
    const result = await query(`SELECT * FROM platform_config WHERE id = 'default' LIMIT 1`);
    const row = result.rows[0];
    if (!row) {
      return {
        ...DEFAULTS,
        faucet_cooldown_sec: envCooldownFallback(),
        source: 'defaults',
      };
    }
    return {
      faucet_amount_tusdc: Number(row.faucet_amount_tusdc ?? DEFAULTS.faucet_amount_tusdc),
      faucet_cooldown_sec: Number(row.faucet_cooldown_sec ?? envCooldownFallback()),
      faucet_paused: Boolean(row.faucet_paused),
      trading_paused: Boolean(row.trading_paused),
      agents_paused: Boolean(row.agents_paused),
      claims_paused: Boolean(row.claims_paused),
      maintenance_message: String(row.maintenance_message || ''),
      announcement: String(row.announcement || ''),
      announcement_published_at: row.announcement_published_at || null,
      default_tx_unlimited: row.default_tx_unlimited !== false,
      default_tx_limit: row.default_tx_limit == null ? null : Number(row.default_tx_limit),
      default_agent_spend_unlimited: row.default_agent_spend_unlimited !== false,
      default_agent_spend_limit_tusdc:
        row.default_agent_spend_limit_tusdc == null
          ? null
          : Number(row.default_agent_spend_limit_tusdc),
      default_agent_trade_size_tusdc:
        row.default_agent_trade_size_tusdc == null
          ? null
          : Number(row.default_agent_trade_size_tusdc),
      updated_at: row.updated_at || null,
      source: 'db',
    };
  } catch (err) {
    console.error('[platformConfig]', err?.message || err);
    return {
      ...DEFAULTS,
      faucet_cooldown_sec: envCooldownFallback(),
      source: 'fallback',
    };
  }
}

export function faucetAmountRaw(amountTusdc) {
  const n = Number(amountTusdc);
  const safe = Number.isFinite(n) && n > 0 ? n : DEFAULTS.faucet_amount_tusdc;
  // TUSDC uses 6 decimals
  return BigInt(Math.round(safe * 1e6));
}
