import { ethers } from 'ethers';
import { getAgentById, DEFAULT_TRADE_SIZE_TUSDC } from '../../../utils/agents/config';
import { verifyAgentDelegate } from '../../../utils/agents/delegate';
import { createAgentMemory } from '../../../utils/agents/brain';
import { getEnrollment, setEnrollment, appendFeedMessage, getDisplayName, retireEnrollment } from '../../../utils/agents/store';
import { readWalletAum } from '../../../utils/agents/stats';
import {
  checkTxLimit,
  getWalletLimits,
  resolveDelegateMaxTusdc,
} from '../../../utils/agents/walletLimits';
import { FUJI_RPC_PUBLIC } from '../../../utils/contract';

const ERC20_PERMIT_ABI = [
  'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s) external',
];

function normalizePrivateKey(value) {
  if (!value) return '';
  const trimmed = value.trim();
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  return /^0x[0-9a-fA-F]{64}$/.test(prefixed) ? prefixed : '';
}

async function applyPermitIfNeeded(permit, trader, contractAddress, provider) {
  if (!permit || typeof permit !== 'object') return;
  const privateKey = normalizePrivateKey(process.env.SETTLEMENT_PRIVATE_KEY || process.env.PRIVATE_KEY);
  if (!privateKey) {
    throw new Error('SETTLEMENT_PRIVATE_KEY required to apply TUSDC permit for agents');
  }
  const wallet = new ethers.Wallet(privateKey, provider);
  const market = new ethers.Contract(contractAddress, ['function collateralToken() view returns (address)'], provider);
  const collateralAddr = await market.collateralToken();
  const token = new ethers.Contract(collateralAddr, ERC20_PERMIT_ABI, wallet);

  const pDeadline = Number(permit.deadline);
  const v = Number(permit.v);
  const r = permit.r;
  const s = permit.s;
  const value = BigInt(permit.value || '0');
  const owner = ethers.getAddress(permit.owner || trader);
  const spender = ethers.getAddress(permit.spender || contractAddress);
  if (value <= 0n) {
    throw new Error('Invalid permit value');
  }
  await token.permit.staticCall(owner, spender, value, pDeadline, v, r, s);
  const permitTx = await token.permit(owner, spender, value, pDeadline, v, r, s);
  await permitTx.wait();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {

  const { wallet, agentId, tradeSizeTusdc, delegateSignature, delegateDeadline, delegateMaxRaw, permit } =
    req.body || {};
  if (!wallet || !ethers.isAddress(wallet)) {
    return res.status(400).json({ error: 'Valid wallet address required' });
  }

  const agent = getAgentById(agentId);
  if (!agent) {
    return res.status(400).json({ error: 'Unknown agent' });
  }

  const user = ethers.getAddress(wallet);
  let existing = await getEnrollment(user);

  // Heal stuck next-market switches: pendingControl survived an older retire/re-enroll path.
  if (existing?.status === 'active' && existing.pendingControl?.action === 'switch') {
    await retireEnrollment(user);
    existing = await getEnrollment(user);
  }

  const preservedTradeLog = existing?.tradeLog || [];
  if (existing?.status === 'active') {
    if (String(existing.agentId) === String(agentId)) {
      return res.status(200).json({ ok: true, enrollment: existing, alreadyActive: true });
    }
    return res.status(409).json({
      error: 'Another agent is already active. Cancel or complete the pending switch first.',
      alreadyActive: true,
      agentId: existing.agentId,
    });
  }

  const limits = await getWalletLimits(user);
  if (limits.relayer_blocked) {
    return res.status(403).json({ error: 'Agent enrollment is blocked for this wallet' });
  }

  const txGate = await checkTxLimit(user);
  if (!txGate.ok) {
    return res.status(403).json({
      error: `Trade limit reached for this account (${txGate.buys}/${txGate.limit}). Ask an admin to raise or clear the limit.`,
      txLimit: txGate.limit,
      txUsed: txGate.buys,
    });
  }

  // Admin may force a per-trade size; otherwise use the user's choice / default.
  let size = Number(tradeSizeTusdc) || DEFAULT_TRADE_SIZE_TUSDC;
  if (limits.agent_trade_size_tusdc != null && Number.isFinite(limits.agent_trade_size_tusdc) && limits.agent_trade_size_tusdc > 0) {
    size = limits.agent_trade_size_tusdc;
  }
  const tradeSizeRaw = ethers.parseUnits(String(size), 6).toString();

  if (!delegateSignature || !delegateDeadline || !delegateMaxRaw) {
    return res.status(400).json({
      error: 'Agent delegation signature required. Restart from the New agent page.',
    });
  }

  // Admin-controlled agent spend (None = unlimited). Caps signed delegate max at enroll.
  const allowedMax = resolveDelegateMaxTusdc(limits);
  if (allowedMax <= 0) {
    return res.status(403).json({ error: 'Agent spending is disabled for this wallet' });
  }
  const requestedMax = Number(ethers.formatUnits(BigInt(String(delegateMaxRaw)), 6));
  if (!limits.agent_spend_unlimited && requestedMax > allowedMax + 1e-9) {
    return res.status(403).json({
      error: `Agent spend limit is ${allowedMax} TUSDC. Re-enroll with that delegate cap.`,
      agentSpendLimitTusdc: allowedMax,
    });
  }

  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (contractAddress) {
    const rpc = process.env.FUJI_RPC_URL || FUJI_RPC_PUBLIC;
    const provider = new ethers.JsonRpcProvider(rpc);
    const network = await provider.getNetwork();
    const delegateCheck = verifyAgentDelegate({
      chainId: Number(network.chainId),
      contractAddress,
      trader: user,
      deadline: Number(delegateDeadline),
      maxAmountRaw: String(delegateMaxRaw),
      signature: delegateSignature,
    });
    if (!delegateCheck.ok) {
      return res.status(400).json({ error: delegateCheck.error });
    }
  }

  let initialAumRaw = '0';
  try {
    const rpc = process.env.FUJI_RPC_URL || FUJI_RPC_PUBLIC;
    if (contractAddress) {
      const provider = new ethers.JsonRpcProvider(rpc);
      try {
        await applyPermitIfNeeded(permit, user, contractAddress, provider);
      } catch (permitError) {
        return res.status(400).json({
          error: permitError.message || 'Could not set TUSDC allowance via permit',
        });
      }
      const row = await readWalletAum(provider, user, contractAddress);
      initialAumRaw = row.aumRaw.toString();
    }
  } catch {
    /* optional */
  }

  const enrollment = await setEnrollment(user, {
    agentId: agent.id,
    agentName: agent.name,
    tradeSizeTusdc: size,
    tradeSizeRaw,
    status: 'active',
    startedAt: Math.floor(Date.now() / 1000),
    initialAumRaw,
    tradeLog: preservedTradeLog,
    pendingOutcomes: [],
    pendingControl: null,
    paused: false,
    pausedAt: null,
    agentMemory: createAgentMemory(agent.id),
    delegateSignature,
    delegateDeadline: Number(delegateDeadline),
    delegateMaxRaw: String(delegateMaxRaw),
    delegateSpentRaw: '0',
  });

  await appendFeedMessage({
    agentId: agent.id,
    agentName: agent.name,
    handle: agent.handle,
    emoji: agent.emoji,
    color: agent.color,
    text: `${agent.name}: New pilot joined — automating ${size} TUSDC clips on Fuji.`,
    pilotWallet: user,
    pilotName: (await getDisplayName(user)) || undefined,
    kind: 'enroll',
  });

  return res.status(200).json({ ok: true, enrollment });

  } catch (err: any) {
    console.error('[enroll] Unhandled error:', err);
    return res.status(500).json({
      error: err.message || 'Agent enrollment failed',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
}
