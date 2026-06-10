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
import { buildXp } from '../../../utils/agents/xp';

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

/** Build per-agent-persona rankings aggregated across all wallets. */
function buildAgentPersonaRankings(rawRows: any[]) {
  const personaMap = new Map<string, {
    agentId: string;
    agentName: string;
    emoji: string;
    color: string;
    pilots: number;
    activePilots: number;
    txCount: number;
    wins: number;
    losses: number;
    bySymbol: Map<string, { symbol: string; wins: number; losses: number; trades: number; spend: number }>;
  }>();

  for (const row of rawRows) {
    const agentCfg = getAgentById(row.agentId);
    const id = agentCfg?.id || row.agentId || 'unknown';

    if (!personaMap.has(id)) {
      personaMap.set(id, {
        agentId: id,
        agentName: agentCfg?.name || row.agentName || id,
        emoji: agentCfg?.emoji || '🤖',
        color: agentCfg?.color || '#888',
        pilots: 0,
        activePilots: 0,
        txCount: 0,
        wins: 0,
        losses: 0,
        bySymbol: new Map(),
      });
    }

    const bucket = personaMap.get(id)!;
    bucket.pilots += 1;
    if (row.status === 'active') bucket.activePilots += 1;
    bucket.txCount += row.txCount || 0;
    bucket.wins    += row.wins    || 0;
    bucket.losses  += row.losses  || 0;

    for (const sym of (row.bySymbol || [])) {
      const existing = bucket.bySymbol.get(sym.symbol) || { symbol: sym.symbol, wins: 0, losses: 0, trades: 0, spend: 0 };
      existing.wins   += sym.wins   || 0;
      existing.losses += sym.losses || 0;
      existing.trades += sym.trades || 0;
      existing.spend  += sym.spend  || 0;
      bucket.bySymbol.set(sym.symbol, existing);
    }
  }

  return [...personaMap.values()]
    .map((b) => {
      const settled = b.wins + b.losses;
      const winRate = settled > 0 ? Math.round((b.wins / settled) * 100) : null;
      return {
        ...b,
        winRate,
        bySymbol: [...b.bySymbol.values()]
          .map((s) => ({
            ...s,
            winRate: (s.wins + s.losses) > 0
              ? Math.round((s.wins / (s.wins + s.losses)) * 100)
              : null,
          }))
          .sort((a, z) => z.trades - a.trades)
          .slice(0, 6),
      };
    })
    .sort((a, z) => z.txCount - a.txCount);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    persistReconciledTradeLogs();
    const appStats = getAppAgentStats();

    // Raw rows (already have wins/losses/bySymbol/_enrollment/_socialLinks)
    const rawRows = buildLeaderboardRows();

    // Enrich with XP + streak, then re-rank by XP
    const enriched = rawRows.map((row: any) => {
      const xpData = buildXp(row._enrollment, row._socialLinks);
      return {
        wallet:       row.wallet,
        displayName:  row.displayName,
        agentId:      getAgentById(row.agentId)?.id || row.agentId,
        agentName:    getAgentById(row.agentId)?.name || row.agentName,
        txCount:      row.txCount,
        lastTxHash:   row.lastTxHash,
        status:       row.status,
        wins:         row.wins,
        losses:       row.losses,
        winRate:      row.winRate,
        bySymbol:     row.bySymbol,
        // XP data
        xp:           xpData.total,
        xpLevel:      xpData.level,
        xpBreakdown:  xpData.breakdown,
        streak:       xpData.streak.current,
        longestStreak: xpData.streak.longest,
        avgDailyTxs:  xpData.avgDailyTxs,
      };
    });

    // Sort by XP descending, break ties by txCount
    enriched.sort((a: any, b: any) => b.xp - a.xp || b.txCount - a.txCount);
    const rows = enriched.map((row: any, i: number) => ({ ...row, rank: i + 1 }));

    const agentRankings = buildAgentPersonaRankings(rawRows);

    return res.status(200).json({
      stats: {
        agentPersonas:     AGENTS.length,
        activePilots:      appStats.activePilots,
        enrolledWallets:   appStats.enrolledWallets,
        totalTransactions: appStats.totalTransactions,
      },
      rows,
      agentRankings,
    });
  } catch (error: any) {
    console.error('Leaderboard failed:', error);
    return res.status(500).json({ error: error.message || 'Leaderboard failed' });
  }
}
