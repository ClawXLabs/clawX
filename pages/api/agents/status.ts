import { ethers } from 'ethers';
import { getAgentById } from '../../../utils/agents/config';
import { applyPendingControlIfReady, getEnrollment, reconcileTradeLog } from '../../../utils/agents/store';
import { buildTrackRecord } from '../../../utils/agents/trackRecord';
import {
  buildDelegateStatus,
  buildEnrichedTradeLog,
  buildMatchHistory,
  buildPendingSettlements,
  enrichOpenPositions,
} from '../../../utils/agents/tradeHistory';
import { readOpenPositions, readWalletAum } from '../../../utils/agents/stats';
import { checkTxLimit } from '../../../utils/agents/walletLimits';
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
  const txGate = await checkTxLimit(user);
  const walletLimits = {
    txUnlimited: txGate.unlimited,
    txLimit: txGate.limit,
    txUsed: txGate.buys,
    txRemaining: txGate.remaining,
    agentSpendUnlimited: txGate.limits.agent_spend_unlimited,
    agentSpendLimitTusdc: txGate.limits.agent_spend_limit_tusdc,
    agentTradeSizeTusdc: txGate.limits.agent_trade_size_tusdc,
  };

  let enrollment = await getEnrollment(user);
  if (!enrollment || enrollment.status !== 'active') {
    const trades = (enrollment?.tradeLog || []).filter((t) => t.action === 'BUY');
    return res.status(200).json({
      enrolled: false,
      retired: enrollment?.status === 'retired',
      historicalTxCount: trades.length,
      walletLimits,
    });
  }

  enrollment = reconcileTradeLog(enrollment);
  const agent = getAgentById(enrollment.agentId);
  const enriched = buildEnrichedTradeLog(enrollment);
  const delegate = buildDelegateStatus(enrollment);
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

  let pendingControl = enrollment.pendingControl || null;
  if (pendingControl?.timing === 'next_market' && !pendingControl.ready) {
    const unresolvedOpenCount = (positions || []).filter((p) => !p.resolved).length;
    const applied = await applyPendingControlIfReady(user, {
      unresolvedOpenCount,
      openPositionCount: unresolvedOpenCount,
    });
    if (applied.enrollment) {
      enrollment = applied.enrollment;
      pendingControl = enrollment.pendingControl || null;
    } else if (applied.applied === 'kill') {
      return res.status(200).json({
        enrolled: false,
        retired: true,
        historicalTxCount: (enrollment.tradeLog || []).filter((t) => t.action === 'BUY').length,
        walletLimits,
        pendingControl: null,
      });
    }
  }

  return res.status(200).json({
    enrolled: true,
    enrollment: {
      ...enrollment,
      agentMemory: enrollment.agentMemory,
    },
    agent,
    aum: Math.round(aum * 100) / 100,
    returnPct: Math.round(returnPct * 10) / 10,
    decimals,
    openPositions: enrichOpenPositions(positions, enrollment),
    tradeLog: enrollment.tradeLog || [],
    enrichedTradeLog: enriched.trades,
    matchHistory: buildMatchHistory(enrollment),
    pendingSettlements: buildPendingSettlements(enrollment),
    poolSummary: {
      totalPoolTusdc: enriched.totalPoolTusdc,
      totalWonTusdc: enriched.totalWonTusdc,
      totalLostTusdc: enriched.totalLostTusdc,
      netPnlTusdc: enriched.netPnlTusdc,
      pendingCount: enriched.pendingCount,
    },
    delegate,
    walletLimits,
    pendingControl,
    trackRecord: buildTrackRecord(enrollment),
    updatedAt: Math.floor(Date.now() / 1000),
  });
}
