import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { getFullProfile, setDisplayName, setSocialLink } from '../../../utils/agents/store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const wallet = req.query.wallet;
    if (!wallet || !ethers.isAddress(String(wallet))) {
      return res.status(400).json({ error: 'wallet query required' });
    }
    const user = ethers.getAddress(String(wallet));
    return res.status(200).json(getFullProfile(user));
  }

  if (req.method === 'POST') {
    const { wallet, displayName, socialLinks } = req.body || {};
    if (!wallet || !ethers.isAddress(String(wallet))) {
      return res.status(400).json({ error: 'Valid wallet required' });
    }
    const user = ethers.getAddress(String(wallet));

    if (displayName !== undefined) {
      const name = String(displayName || '').trim();
      if (name.length > 0 && name.length < 2) {
        return res.status(400).json({ error: 'Display name must be at least 2 characters' });
      }
      if (name.length > 32) {
        return res.status(400).json({ error: 'Display name max 32 characters' });
      }
      if (name.length >= 2) setDisplayName(user, name);
    }

    if (socialLinks && typeof socialLinks === 'object') {
      for (const [platform, data] of Object.entries(socialLinks)) {
        if (['twitter', 'telegram'].includes(platform) && data && typeof data === 'object') {
          setSocialLink(user, platform, data as Record<string, unknown>);
        }
      }
    }

    return res.status(200).json({ ok: true, ...getFullProfile(user) });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
