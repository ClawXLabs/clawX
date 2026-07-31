import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import {
  getWalletAccess,
  isWalletAllowed,
  registerWalletAccess,
} from '../../../../utils/agents/walletAccess';
import { ensureWalletProfile } from '../../../../utils/agents/store';
import { clientIp, rateLimit, setClawxCors } from '../../../../utils/api/clawxCors';

/**
 * Public Open API — register / check wallets for app access.
 *
 * POST /api/v1/wallets  { wallet, source?, referrer?, metadata? }
 *   → upsert allowlist + wallet_profiles (idempotent, bumps last_seen)
 * GET  /api/v1/wallets?wallet=0x… → { ok, allowed, registered, status?, ... }
 *
 * Also served at POST/GET /api/v1/wallets/connect
 */
function normalizeWallet(raw: unknown): string | null {
  if (!raw || !ethers.isAddress(String(raw))) return null;
  return ethers.getAddress(String(raw));
}

function sanitizeSource(raw: unknown): string {
  const s = String(raw || 'landing').trim().toLowerCase().slice(0, 64);
  return s || 'landing';
}

function sanitizeReferrer(raw: unknown): string {
  return String(raw || '').trim().slice(0, 500);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setClawxCors(req, res, 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const ip = clientIp(req);
  if (!rateLimit(`wallets:${ip}`, { limit: 60, windowMs: 60_000 })) {
    return res.status(429).json({ ok: false, error: 'Too many requests' });
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
        referrer: access?.referrer || null,
        firstSeenAt: access?.createdAt || null,
        lastSeenAt: access?.lastSeenAt || null,
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

      const source = sanitizeSource(req.body?.source);
      const referrer = sanitizeReferrer(req.body?.referrer);
      const metadata =
        req.body?.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)
          ? req.body.metadata
          : null;

      const wasRegistered = Boolean(existing);
      const row = await registerWalletAccess(checksum, {
        source,
        status: 'allowed',
        referrer,
        metadata,
      });
      const profile = await ensureWalletProfile(checksum, { source, referrer });

      return res.status(200).json({
        ok: true,
        wallet: checksum,
        allowed: true,
        registered: true,
        created: !wasRegistered,
        status: row.status,
        source: row.source,
        referrer: row.referrer || referrer || '',
        firstSeenAt: row.createdAt,
        lastSeenAt: row.lastSeenAt,
        profile: profile
          ? {
              wallet: profile.wallet,
              source: profile.source,
              referrer: profile.referrer,
              createdAt: profile.createdAt,
              lastSeenAt: profile.lastSeenAt,
            }
          : null,
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
