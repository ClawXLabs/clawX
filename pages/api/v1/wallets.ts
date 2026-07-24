import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import {
  getWalletAccess,
  isWalletAllowed,
  registerWalletAccess,
} from '../../../utils/agents/walletAccess';
import { ensureWalletProfile } from '../../../utils/agents/store';

/**
 * Public Open API — register / check wallets for app access.
 *
 * POST /api/v1/wallets  { wallet }  → upsert allowlist + wallet_profiles row
 * GET  /api/v1/wallets?wallet=0x… → { ok, allowed, registered, status? }
 */
function setCors(res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');
}

function normalizeWallet(raw: unknown): string | null {
  if (!raw || !ethers.isAddress(String(raw))) return null;
  return ethers.getAddress(String(raw));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    if (req.method === 'GET') {
      const checksum = normalizeWallet(req.query.wallet);
      if (!checksum) {
        return res.status(400).json({ ok: false, error: 'Valid wallet query required' });
      }

      const access = await getWalletAccess(checksum);
      const allowed = await isWalletAllowed(checksum);
      return res.status(200).json({
        ok: true,
        wallet: checksum,
        allowed,
        registered: Boolean(access),
        status: access?.status || null,
        source: access?.source || null,
      });
    }

    if (req.method === 'POST') {
      const checksum = normalizeWallet(req.body?.wallet);
      if (!checksum) {
        return res.status(400).json({ ok: false, error: 'Valid wallet required' });
      }

      const existing = await getWalletAccess(checksum);
      if (existing?.status === 'revoked') {
        return res.status(403).json({
          ok: false,
          error: 'This wallet access has been revoked',
          wallet: checksum,
          status: 'revoked',
        });
      }

      const wasRegistered = Boolean(existing);
      const row = await registerWalletAccess(checksum, {
        source: 'landing',
        status: 'allowed',
      });
      // Same registry the main app uses for known wallets
      await ensureWalletProfile(checksum);

      return res.status(200).json({
        ok: true,
        wallet: checksum,
        allowed: true,
        registered: true,
        created: !wasRegistered,
        status: row.status,
        source: row.source,
      });
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('[api/v1/wallets]', message);
    return res.status(500).json({ ok: false, error: message });
  }
}
