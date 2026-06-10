import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { buildBatchClaimAuthMessage } from '../../utils/tradeAuth';

const MARKET_ABI = [
  'function owner() view returns (address)',
  'function settlementOperator() view returns (address)',
  'function claimWinningsFor(address claimer,uint256 roundId) returns (uint256)',
  'function getUserPosition(uint256 roundId,address user) view returns (uint256 upShares,uint256 downShares,bool claimed)',
  'function getRoundInfo(uint256 roundId) view returns (string asset,uint256 roundNumber,uint256 startPrice,uint256 endPrice,uint256 upPool,uint256 downPool,uint256 collateralPool,bool resolved,bool upWins)',
];

function normalizeKey(value?: string) {
  if (!value) return '';
  const t = value.trim();
  const p = t.startsWith('0x') ? t : `0x${t}`;
  return /^0x[0-9a-fA-F]{64}$/.test(p) ? p : '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const rpcUrl = process.env.FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';
  const privateKey = normalizeKey(process.env.SETTLEMENT_PRIVATE_KEY || process.env.PRIVATE_KEY);

  if (!contractAddress) return res.status(500).json({ error: 'Contract not configured' });
  if (!privateKey) return res.status(503).json({ error: 'Relayer key missing' });

  const { trader, roundIds, deadline, nonce, signature } = req.body || {};

  if (!trader || !ethers.isAddress(String(trader))) {
    return res.status(400).json({ error: 'Invalid trader address' });
  }
  if (!Array.isArray(roundIds) || roundIds.length === 0) {
    return res.status(400).json({ error: 'roundIds must be a non-empty array' });
  }
  if (roundIds.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 rounds per batch' });
  }
  if (!signature || typeof signature !== 'string') {
    return res.status(400).json({ error: 'Missing signature' });
  }
  if (!nonce || typeof nonce !== 'string') {
    return res.status(400).json({ error: 'Missing nonce' });
  }
  const deadlineNum = Number(deadline);
  if (!Number.isFinite(deadlineNum) || deadlineNum < Math.floor(Date.now() / 1000)) {
    return res.status(400).json({ error: 'Expired or invalid deadline' });
  }

  const user = ethers.getAddress(String(trader));
  const ids = roundIds.map(Number).filter(Number.isFinite);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  const authMessage = buildBatchClaimAuthMessage({
    chainId,
    contractAddress,
    trader: user,
    roundIds: ids,
    nonce,
    deadline: deadlineNum,
  });

  let recovered: string;
  try {
    recovered = ethers.verifyMessage(authMessage, signature);
  } catch {
    return res.status(400).json({ error: 'Invalid signature' });
  }
  if (recovered.toLowerCase() !== user.toLowerCase()) {
    return res.status(400).json({ error: 'Signature does not match trader' });
  }

  const relayerWallet = new ethers.Wallet(privateKey, provider);
  const market = new ethers.Contract(contractAddress, MARKET_ABI, relayerWallet);

  let ownerAddr: string, operatorAddr: string;
  try {
    [ownerAddr, operatorAddr] = await Promise.all([market.owner(), market.settlementOperator()]);
  } catch {
    return res.status(500).json({ error: 'Could not read market contract' });
  }

  const relayer = relayerWallet.address.toLowerCase();
  if (relayer !== ownerAddr.toLowerCase() && relayer !== operatorAddr.toLowerCase()) {
    return res.status(503).json({ error: 'Relayer not authorized for this contract' });
  }

  // Execute claims sequentially to avoid nonce collisions
  const results: Array<{ roundId: number; ok: boolean; hash?: string; error?: string }> = [];

  for (const roundId of ids) {
    try {
      // Verify the round is claimable before firing (saves gas on already-claimed)
      const [position, round] = await Promise.all([
        market.getUserPosition(BigInt(roundId), user),
        market.getRoundInfo(BigInt(roundId)),
      ]);
      const upShares = position.upShares as bigint;
      const downShares = position.downShares as bigint;
      const claimed = position.claimed as boolean;
      const resolved = round.resolved as boolean;
      const upWins = round.upWins as boolean;
      const isWinner = resolved && ((upShares > 0n && upWins) || (downShares > 0n && !upWins));

      if (!isWinner || claimed) {
        results.push({ roundId, ok: false, error: claimed ? 'Already claimed' : 'Not a winner or not resolved' });
        continue;
      }

      await market.claimWinningsFor.staticCall(user, BigInt(roundId));
      const tx = await market.claimWinningsFor(user, BigInt(roundId));
      const receipt = await tx.wait();
      results.push({ roundId, ok: true, hash: tx.hash });
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      results.push({ roundId, ok: false, error: err.shortMessage || err.message || 'Claim failed' });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  return res.status(200).json({
    ok: succeeded > 0,
    results,
    succeeded,
    failed: results.length - succeeded,
  });
}
