import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { retireEnrollment, clearAllEnrollments, clearFeed } from '../../../utils/agents/store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wallet, clearAll, clearFeed: wipeFeed } = req.body || {};

  if (clearAll) {
    await clearAllEnrollments();
    if (wipeFeed) await clearFeed();
    return res.status(200).json({ ok: true, cleared: 'all', feedCleared: Boolean(wipeFeed) });
  }

  if (!wallet || !ethers.isAddress(String(wallet))) {
    return res.status(400).json({ error: 'Valid wallet address required' });
  }

  const user = ethers.getAddress(String(wallet));
  const retired = await retireEnrollment(user);
  if (wipeFeed) await clearFeed();

  return res.status(200).json({
    ok: true,
    wallet: user,
    retired,
    feedCleared: Boolean(wipeFeed),
    message: retired
      ? 'Agent retired. Your transaction history is kept — deploy a new agent from the same wallet.'
      : 'No enrollment found for this wallet.',
  });
}
