import { ethers } from 'ethers';
import {
  checkTxLimit,
  getWalletLimits,
  resolveDelegateMaxTusdc,
} from '../../../utils/agents/walletLimits';

/**
 * Public read of admin wallet policy for enroll / UI (no secrets).
 * GET ?wallet=0x…
 */
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
  const limits = await getWalletLimits(user);
  const tx = await checkTxLimit(user);
  const delegateMaxTusdc = resolveDelegateMaxTusdc(limits);

  return res.status(200).json({
    wallet: user,
    txUnlimited: tx.unlimited,
    txLimit: tx.limit,
    txUsed: tx.buys,
    txRemaining: tx.remaining,
    agentSpendUnlimited: limits.agent_spend_unlimited,
    agentSpendLimitTusdc: limits.agent_spend_limit_tusdc,
    agentTradeSizeTusdc: limits.agent_trade_size_tusdc,
    delegateMaxTusdc,
    relayerBlocked: limits.relayer_blocked,
    faucetBlocked: limits.faucet_blocked,
  });
}
