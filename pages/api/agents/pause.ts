import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { getEnrollment, setAgentPaused } from '../../../utils/agents/store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wallet, paused } = req.body || {};
  if (!wallet || !ethers.isAddress(String(wallet))) {
    return res.status(400).json({ error: 'Valid wallet address required' });
  }

  const user = ethers.getAddress(String(wallet));
  const enrollment = await getEnrollment(user);
  if (!enrollment || enrollment.status !== 'active') {
    return res.status(404).json({ error: 'No active enrollment' });
  }

  const row = await setAgentPaused(user, Boolean(paused));
  return res.status(200).json({
    ok: true,
    wallet: user,
    paused: Boolean(row?.paused),
    message: row?.paused
      ? 'Agent paused — no new trades until resumed.'
      : 'Agent resumed — trading will continue on next runner tick.',
  });
}
