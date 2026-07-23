import { getPlatformConfig } from '../../utils/platformConfig.js';

/**
 * Public faucet settings for the Faucet UI (no secrets).
 * Values come from platform_config (admin panel), not hardcoded UI constants.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cfg = await getPlatformConfig();
  res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
  return res.status(200).json({
    amountTusdc: cfg.faucet_amount_tusdc,
    cooldownSec: cfg.faucet_cooldown_sec,
    paused: cfg.faucet_paused,
    source: cfg.source,
    updatedAt: cfg.updated_at,
  });
}
