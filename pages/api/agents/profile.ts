import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { getDisplayName, setDisplayName } from '../../../utils/agents/store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const wallet = req.query.wallet;
    if (!wallet || !ethers.isAddress(String(wallet))) {
      return res.status(400).json({ error: 'wallet query required' });
    }
    const user = ethers.getAddress(String(wallet));
    return res.status(200).json({
      wallet: user,
      displayName: getDisplayName(user),
    });
  }

  if (req.method === 'POST') {
    const { wallet, displayName } = req.body || {};
    if (!wallet || !ethers.isAddress(String(wallet))) {
      return res.status(400).json({ error: 'Valid wallet required' });
    }
    const name = String(displayName || '').trim();
    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Display name must be at least 2 characters' });
    }
    if (name.length > 32) {
      return res.status(400).json({ error: 'Display name max 32 characters' });
    }
    const user = ethers.getAddress(String(wallet));
    const saved = setDisplayName(user, name);
    return res.status(200).json({ ok: true, wallet: user, displayName: saved.displayName });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
