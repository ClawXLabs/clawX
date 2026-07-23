import type { NextApiRequest, NextApiResponse } from 'next';
import { AGENTS } from '../../../utils/agents/config';
import {
  buildFilteredLeaderboard,
  getLeaderboardFilterBySlug,
  listLeaderboardFilters,
  resolveFilterWindow,
} from '../../../utils/agents/leaderboardFilters';
import {
  buildLeaderboardRows,
  countLeaderboardTxs,
  getAppAgentStats,
  readEnrollments,
  reconcileTradeLog,
  setEnrollment,
} from '../../../utils/agents/store';
import { getAgentById } from '../../../utils/agents/config';

async function persistReconciledTradeLogs() {
  const all = await readEnrollments();
  const updates = [];
  for (const [key, row] of Object.entries(all)) {
    const enrollment = row as Record<string, unknown>;
    const fixed = reconcileTradeLog(enrollment);
    const nextCount = countLeaderboardTxs(fixed);
    const nextLifetime = Math.max(Number(fixed.lifetimeTxCount) || 0, nextCount);
    const logChanged = JSON.stringify(fixed.tradeLog) !== JSON.stringify(enrollment.tradeLog);
    const countChanged = nextLifetime !== (Number(enrollment.lifetimeTxCount) || 0);
    if (logChanged || countChanged) {
      updates.push(setEnrollment(key, { ...fixed, lifetimeTxCount: nextLifetime }));
    }
  }
  await Promise.all(updates);
}

function buildAgentPersonaRankings(rawRows: any[]) {
  const personaMap = new Map<string, any>();

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
    bucket.wins += row.wins || 0;
    bucket.losses += row.losses || 0;

    for (const sym of row.bySymbol || []) {
      const existing = bucket.bySymbol.get(sym.symbol) || {
        symbol: sym.symbol,
        wins: 0,
        losses: 0,
        trades: 0,
        spend: 0,
      };
      existing.wins += sym.wins || 0;
      existing.losses += sym.losses || 0;
      existing.trades += sym.trades || 0;
      existing.spend += sym.spend || 0;
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
          .map((s: any) => ({
            ...s,
            winRate:
              s.wins + s.losses > 0 ? Math.round((s.wins / (s.wins + s.losses)) * 100) : null,
          }))
          .sort((a: any, z: any) => z.trades - a.trades)
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
    await persistReconciledTradeLogs();
    const appStats = await getAppAgentStats();

    const filterSlug = String(req.query.filter || req.query.f || '').trim();
    const activeFilter = await getLeaderboardFilterBySlug(filterSlug || undefined);
    const filters = await listLeaderboardFilters({ enabledOnly: true });
    const window = resolveFilterWindow(activeFilter);

    const rows = await buildFilteredLeaderboard(activeFilter);

    // Agent persona board still uses all-time raw enrollments for now
    const rawRows = await buildLeaderboardRows();
    const agentRankings = buildAgentPersonaRankings(rawRows);

    return res.status(200).json({
      stats: {
        agentPersonas: AGENTS.length,
        activePilots: appStats.activePilots,
        enrolledWallets: appStats.enrolledWallets,
        totalTransactions: appStats.totalTransactions,
      },
      filter: {
        slug: activeFilter.slug,
        label: activeFilter.label,
        description: activeFilter.description || '',
        sortMetric: activeFilter.sort_metric,
        sortSecondary: activeFilter.sort_secondary,
        windowType: activeFilter.window_type,
        windowLabel: window.label,
        startAt: window.start ? new Date(window.start).toISOString() : null,
        endAt: window.end ? new Date(window.end).toISOString() : null,
        isPrimary: Boolean(activeFilter.is_primary),
        campaignId: activeFilter.campaign_id || null,
        campaignTitle: activeFilter.campaign_title || null,
      },
      filters: filters.map((f) => ({
        slug: f.slug,
        label: f.label,
        description: f.description || '',
        isPrimary: Boolean(f.is_primary),
        windowType: f.window_type,
        sortMetric: f.sort_metric,
      })),
      rows,
      agentRankings,
    });
  } catch (error: any) {
    console.error('Leaderboard failed:', error);
    return res.status(500).json({ error: error.message || 'Leaderboard failed' });
  }
}
