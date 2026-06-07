import type { NextApiRequest, NextApiResponse } from 'next';
import { AGENTS, getAgentById } from '../../../utils/agents/config';
import {
  buildLeaderboardRows,
  countLeaderboardTxs,
  getAppAgentStats,
  readEnrollments,
  reconcileTradeLog,
  writeEnrollments,
} from '../../../utils/agents/store';

function persistReconciledTradeLogs() {
  const all = readEnrollments();
  let changed = false;
  for (const [key, row] of Object.entries(all)) {
    const enrollment = row as Record<string, unknown>;
    const fixed = reconcileTradeLog(enrollment);
    const nextCount = countLeaderboardTxs(fixed);
    const nextLifetime = Math.max(Number(fixed.lifetimeTxCount) || 0, nextCount);
    const logChanged = JSON.stringify(fixed.tradeLog) !== JSON.stringify(enrollment.tradeLog);
    const countChanged = nextLifetime !== (Number(enrollment.lifetimeTxCount) || 0);
    if (logChanged || countChanged) {
      all[key] = { ...fixed, lifetimeTxCount: nextLifetime };
      changed = true;
    }
  }
  if (changed) writeEnrollments(all);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    persistReconciledTradeLogs();
    const stats = getAppAgentStats();
    const rows = buildLeaderboardRows().map((row) => {
      const agent = getAgentById(row.agentId);
      return {
        ...row,
        agentName: agent?.name || row.agentName,
        agentId: agent?.id || row.agentId,
      };
    });

    return res.status(200).json({
      stats: {
        agentPersonas: AGENTS.length,
        activePilots: stats.activePilots,
        enrolledWallets: stats.enrolledWallets,
        totalTransactions: stats.totalTransactions,
      },
      rows,
    });
  } catch (error: any) {
    console.error('Leaderboard failed:', error);
    return res.status(500).json({ error: error.message || 'Leaderboard failed' });
  }
}
