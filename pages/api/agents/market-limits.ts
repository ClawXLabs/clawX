import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { getEnrollment, setEnrollment } from '../../../utils/agents/store';

const KNOWN = new Set(['BTC', 'ETH', 'AVAX', 'BNB', 'NEAR']);

/**
 * Set per-market max exposure (TUSDC) for the active agent.
 * body: { wallet, marketCapsTusdc: { BTC?: number|null, ... } }
 * - omit / null / negative → no per-market cap (use global trade size)
 * - 0 → do not trade that market
 * - >0 → max open TUSDC allowed on that symbol
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wallet, marketCapsTusdc } = req.body || {};
  if (!wallet || !ethers.isAddress(String(wallet))) {
    return res.status(400).json({ error: 'Valid wallet required' });
  }
  if (!marketCapsTusdc || typeof marketCapsTusdc !== 'object') {
    return res.status(400).json({ error: 'marketCapsTusdc object required' });
  }

  const user = ethers.getAddress(String(wallet));
  const enrollment = await getEnrollment(user);
  if (!enrollment || enrollment.status !== 'active') {
    return res.status(404).json({ error: 'No active enrollment' });
  }

  const next: Record<string, number> = { ...(enrollment.marketCapsTusdc || {}) };
  for (const [rawKey, rawVal] of Object.entries(marketCapsTusdc as Record<string, unknown>)) {
    const key = String(rawKey).trim().toUpperCase();
    if (!KNOWN.has(key) && !/^[A-Z0-9]{2,12}$/.test(key)) continue;
    if (rawVal === null || rawVal === undefined || rawVal === '') {
      delete next[key];
      continue;
    }
    const n = Number(rawVal);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ error: `Invalid cap for ${key}` });
    }
    next[key] = Math.round(n * 100) / 100;
  }

  const row = await setEnrollment(user, {
    ...enrollment,
    marketCapsTusdc: next,
  });

  return res.status(200).json({
    ok: true,
    marketCapsTusdc: row?.marketCapsTusdc || next,
    message: 'Per-market limits updated.',
  });
}
