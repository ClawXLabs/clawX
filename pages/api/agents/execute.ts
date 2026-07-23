import { ethers } from 'ethers';
import { getAgentById } from '../../../utils/agents/config';
import { verifyAgentDelegate } from '../../../utils/agents/delegate';
import { appendFeedMessage, appendTradeLog, getEnrollment, getDisplayName, setEnrollment } from '../../../utils/agents/store';
import { agentChatterText } from '../../../utils/agents/strategy';
import { recordTradePlanned } from '../../../utils/agents/brain';
import { isRunnerAuthorized } from '../../../utils/agents/runnerAuth';
import { acquireRedisLock } from '../../../utils/db/redisLock';
import {
  getAgentBuyVolumeTusdc,
  getWalletLimits,
  checkTxLimit,
} from '../../../utils/agents/walletLimits';

const MARKET_ABI = [
  'function owner() view returns (address)',
  'function settlementOperator() view returns (address)',
  'function buyPositionFor(address buyer,uint256 roundId,bool isUp,uint256 amountIn) returns (uint256)',
  'function collateralToken() view returns (address)',
];

const ERC20_ABI = ['function allowance(address owner,address spender) view returns (uint256)'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isRunnerAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized runner' });
  }

  const body = req.body || {};
  const wallet = body.wallet;
  const roundId = body.roundId;
  const isUp = Boolean(body.isUp);
  const symbol = body.symbol || '';
  const thought = body.thought || '';

  if (!wallet || !ethers.isAddress(wallet)) {
    return res.status(400).json({ error: 'Invalid wallet' });
  }
  if (!Number.isFinite(Number(roundId))) {
    return res.status(400).json({ error: 'Invalid roundId' });
  }

  const user = ethers.getAddress(wallet);
  const enrollment = await getEnrollment(user);
  if (!enrollment || enrollment.status !== 'active') {
    return res.status(404).json({ error: 'No active enrollment' });
  }
  if (enrollment.paused) {
    return res.status(400).json({ error: 'Agent is paused' });
  }

  const limits = await getWalletLimits(user);
  if (limits.relayer_blocked) {
    return res.status(403).json({ error: 'Relayer / agent trading is blocked for this wallet' });
  }
  const txGate = await checkTxLimit(user);
  if (!txGate.ok) {
    return res.status(403).json({
      error: 'Trade limit reached for this account',
      txLimit: txGate.limit,
      txUsed: txGate.buys,
    });
  }
  if (!limits.agent_spend_unlimited) {
    const spendCap = Number(limits.agent_spend_limit_tusdc);
    if (!Number.isFinite(spendCap) || spendCap <= 0) {
      return res.status(403).json({ error: 'Agent spending is disabled for this wallet' });
    }
    const volume = await getAgentBuyVolumeTusdc(user);
    const nextTrade = Number(enrollment.tradeSizeTusdc || 0);
    if (volume + nextTrade > spendCap + 1e-9) {
      return res.status(403).json({
        error: `Agent spend limit reached (${spendCap} TUSDC)`,
        spentTusdc: volume,
        agentSpendLimitTusdc: spendCap,
      });
    }
  }

  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const rpcUrl = process.env.FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';
  const privateKey = (process.env.SETTLEMENT_PRIVATE_KEY || process.env.PRIVATE_KEY || '').trim();
  const normalizedKey = privateKey.startsWith('0x') ? privateKey : privateKey ? `0x${privateKey}` : '';

  if (!contractAddress) {
    return res.status(500).json({ error: 'Market contract not configured' });
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalizedKey)) {
    return res.status(503).json({ error: 'SETTLEMENT_PRIVATE_KEY required for agent trades' });
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  const delegateCheck = verifyAgentDelegate({
    chainId,
    contractAddress,
    trader: user,
    deadline: Number(enrollment.delegateDeadline),
    maxAmountRaw: enrollment.delegateMaxRaw,
    signature: enrollment.delegateSignature,
  });
  if (!delegateCheck.ok) {
    return res.status(400).json({ error: delegateCheck.error });
  }

  const amountIn = BigInt(enrollment.tradeSizeRaw || '0');
  const spent = BigInt(enrollment.delegateSpentRaw || '0');
  const max = BigInt(enrollment.delegateMaxRaw || '0');
  if (amountIn <= 0n || spent + amountIn > max) {
    return res.status(400).json({ error: 'Delegation spend cap reached' });
  }

  const relayer = new ethers.Wallet(normalizedKey, provider);
  const market = new ethers.Contract(contractAddress, MARKET_ABI, relayer);
  const collateralAddr = await market.collateralToken();
  const token = new ethers.Contract(collateralAddr, ERC20_ABI, provider);

  const allowance = await token.allowance(user, contractAddress);
  if (allowance < amountIn) {
    return res.status(400).json({
      error: 'Insufficient TUSDC allowance. Approve the market contract or re-enroll with permit.',
    });
  }

  let releaseNonceLock: (() => Promise<unknown>) | null = null;
  try {
    releaseNonceLock = await acquireRedisLock(`lock:relayer-nonce:${relayer.address.toLowerCase()}`);
    await market.buyPositionFor.staticCall(user, BigInt(roundId), isUp, amountIn);
    const tx = await market.buyPositionFor(user, BigInt(roundId), isUp, amountIn);
    const receipt = await tx.wait();
    await releaseNonceLock();
    releaseNonceLock = null;

    const agent = getAgentById(enrollment.agentId);
    await appendTradeLog(user, {
      at: Math.floor(Date.now() / 1000),
      action: 'BUY',
      side: isUp ? 'UP' : 'DOWN',
      symbol,
      amountTusdc: enrollment.tradeSizeTusdc,
      hash: tx.hash,
      roundId: Number(roundId),
      agentId: enrollment.agentId,
      agentName: agent?.name || enrollment.agentId,
    });

    const memory = recordTradePlanned(enrollment.agentMemory || {}, symbol);
    const afterLog = await getEnrollment(user);
    await setEnrollment(user, {
      ...(afterLog || enrollment),
      agentMemory: memory,
      delegateSpentRaw: (spent + amountIn).toString(),
      lastTradeAt: Math.floor(Date.now() / 1000),
    });

    if (agent) {
      const feedText = thought || agentChatterText(agent, null, symbol, isUp, thought);
      const pilotName = await getDisplayName(user);
      await appendFeedMessage({
        agentId: agent.id,
        agentName: agent.name,
        handle: agent.handle,
        emoji: agent.emoji,
        color: agent.color,
        text: feedText,
        pilotWallet: user,
        pilotName: pilotName || undefined,
        kind: 'trade',
      });
    }

    return res.status(200).json({
      ok: true,
      hash: tx.hash,
      blockNumber: receipt.blockNumber,
    });
  } catch (error) {
    console.error('Agent execute failed:', error);
    return res.status(500).json({ error: error?.shortMessage || error?.message || 'Trade failed' });
  } finally {
    if (releaseNonceLock) await releaseNonceLock().catch(() => {});
  }
}
