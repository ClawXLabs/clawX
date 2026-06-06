import { ethers } from 'ethers';
import { getAgentById } from '../../../utils/agents/config';
import { getEnrollment } from '../../../utils/agents/store';
import { readOpenPositions, readWalletAum } from '../../../utils/agents/stats';
import { CONTRACT_ADDRESS, FUJI_RPC_PUBLIC } from '../../../utils/contract';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wallet = req.query.wallet;
  if (!wallet || !ethers.isAddress(String(wallet))) {
    return res.status(400).json({ error: 'wallet query required' });
  }

  const user = ethers.getAddress(String(wallet));
  const enrollment = getEnrollment(user);
  if (!enrollment) {
    return res.status(200).json({ enrolled: false });
  }

  const agent = getAgentById(enrollment.agentId);
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || CONTRACT_ADDRESS;
  const rpc = process.env.FUJI_RPC_URL || FUJI_RPC_PUBLIC;

  let aum = 0;
  let returnPct = 0;
  let positions = [];
  let decimals = 6;

  if (contractAddress) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc);
      const [aumRow, open] = await Promise.all([
        readWalletAum(provider, user, contractAddress),
        readOpenPositions(provider, user, contractAddress),
      ]);
      aum = aumRow.aum;
      decimals = aumRow.decimals;
      positions = open;
      const initial = BigInt(enrollment.initialAumRaw || '0');
      if (initial > 0n) {
        returnPct = Number(((aumRow.aumRaw - initial) * 10000n) / initial) / 100;
      }
    } catch (error) {
      console.error('Agent status read failed:', error);
    }
  }

  return res.status(200).json({
    enrolled: true,
    enrollment,
    agent,
    aum: Math.round(aum * 100) / 100,
    returnPct: Math.round(returnPct * 10) / 10,
    decimals,
    openPositions: positions,
    tradeLog: enrollment.tradeLog || [],
    updatedAt: Math.floor(Date.now() / 1000),
  });
}
