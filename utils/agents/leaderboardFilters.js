import { query } from '../db/postgres.js';
import { buildXp } from './xp.js';
import { getAgentById } from './config.js';
import {
  buildLeaderboardRows,
  countLeaderboardTxs,
  readEnrollments,
  readProfiles,
  reconcileTradeLog,
} from './store.js';

function walletKey(wallet) {
  return wallet?.toLowerCase() || '';
}

function slugify(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || `filter-${Date.now()}`;
}

export async function listLeaderboardFilters({ enabledOnly = false } = {}) {
  try {
    const result = await query(
      `SELECT f.*, c.title AS campaign_title, c.start_at AS campaign_start_at, c.end_at AS campaign_end_at
       FROM leaderboard_filters f
       LEFT JOIN campaigns c ON c.id = f.campaign_id
       ${enabledOnly ? 'WHERE f.enabled = true' : ''}
       ORDER BY f.sort_order ASC, f.created_at ASC`
    );
    return result.rows;
  } catch (err) {
    console.warn('[leaderboardFilters] list failed:', err?.message || err);
    return [];
  }
}

export async function getLeaderboardFilterBySlug(slug) {
  const filters = await listLeaderboardFilters({ enabledOnly: true });
  if (!filters.length) {
    return {
      slug: 'all-time',
      label: 'All Time',
      window_type: 'all_time',
      sort_metric: 'xp',
      sort_secondary: 'txCount',
      is_primary: true,
    };
  }
  if (slug) {
    const hit = filters.find((f) => f.slug === slug);
    if (hit) return hit;
  }
  return filters.find((f) => f.is_primary) || filters[0];
}

/** Resolve absolute [start, end] for a filter (ms epoch or null = open). */
export function resolveFilterWindow(filter, now = Date.now()) {
  const type = filter?.window_type || 'all_time';
  if (type === 'all_time') return { start: null, end: null, label: 'All time' };

  if (type === 'rolling_days') {
    const days = Math.max(1, Number(filter.rolling_days) || 7);
    return {
      start: now - days * 24 * 60 * 60 * 1000,
      end: now,
      label: `Last ${days} days`,
    };
  }

  let start = filter.start_at ? new Date(filter.start_at).getTime() : null;
  let end = filter.end_at ? new Date(filter.end_at).getTime() : null;

  if (type === 'campaign' || filter.campaign_id) {
    if (filter.campaign_start_at && start == null) start = new Date(filter.campaign_start_at).getTime();
    if (filter.campaign_end_at && end == null) end = new Date(filter.campaign_end_at).getTime();
  }

  if (Number.isNaN(start)) start = null;
  if (Number.isNaN(end)) end = null;

  return { start, end, label: filter.label || 'Custom range' };
}

function tradeTs(trade) {
  if (trade?.at) return Number(trade.at) * 1000;
  if (trade?.created_at) return new Date(trade.created_at).getTime();
  return 0;
}

function inWindow(tsMs, start, end) {
  if (!tsMs) return false;
  if (start != null && tsMs < start) return false;
  if (end != null && tsMs > end) return false;
  return true;
}

function sortRows(rows, primary, secondary) {
  const metric = (row, key) => {
    if (key === 'xp') return Number(row.xp) || 0;
    if (key === 'txCount') return Number(row.txCount) || 0;
    if (key === 'wins') return Number(row.wins) || 0;
    if (key === 'winRate') return Number(row.winRate) || 0;
    if (key === 'volume') return Number(row.volume) || 0;
    return Number(row.xp) || 0;
  };
  const aKey = primary || 'xp';
  const bKey = secondary || 'txCount';
  return [...rows].sort((a, b) => metric(b, aKey) - metric(a, aKey) || metric(b, bKey) - metric(a, bKey));
}

/**
 * Build leaderboard rows for a filter window.
 * all_time → existing XP engine; dated windows → trade_log / tradeLog filtered stats + period XP.
 */
export async function buildFilteredLeaderboard(filter) {
  const window = resolveFilterWindow(filter);
  const primary = filter.sort_metric || 'xp';
  const secondary = filter.sort_secondary || 'txCount';

  if (window.start == null && window.end == null) {
    const rawRows = await buildLeaderboardRows();
    const enriched = rawRows.map((row) => {
      const xpData = buildXp(row._enrollment, row._socialLinks);
      return {
        wallet: row.wallet,
        displayName: row.displayName,
        agentId: getAgentById(row.agentId)?.id || row.agentId,
        agentName: getAgentById(row.agentId)?.name || row.agentName,
        txCount: row.txCount,
        lastTxHash: row.lastTxHash,
        status: row.status,
        wins: row.wins,
        losses: row.losses,
        winRate: row.winRate,
        bySymbol: row.bySymbol,
        volume: (row.bySymbol || []).reduce((s, x) => s + (Number(x.spend) || 0), 0),
        xp: xpData.total,
        xpLevel: xpData.level,
        xpBreakdown: xpData.breakdown,
        streak: xpData.streak.current,
        longestStreak: xpData.streak.longest,
        avgDailyTxs: xpData.avgDailyTxs,
        _enrollment: row._enrollment,
      };
    });
    const sorted = sortRows(enriched, primary, secondary);
    return sorted.map((row, i) => ({ ...row, rank: i + 1 }));
  }

  // Windowed: pull uncapped buys from trade_log in range, fall back to enrollment tradeLog filter
  const params = [];
  const clauses = [`action = 'BUY'`];
  if (window.start != null) {
    params.push(new Date(window.start).toISOString());
    clauses.push(`created_at >= $${params.length}::timestamptz`);
  }
  if (window.end != null) {
    params.push(new Date(window.end).toISOString());
    clauses.push(`created_at <= $${params.length}::timestamptz`);
  }

  let logRows = [];
  try {
    const result = await query(
      `SELECT wallet, round_id, side, symbol, amount_tusdc, hash, outcome, created_at, settled_at
       FROM trade_log
       WHERE ${clauses.join(' AND ')}`,
      params
    );
    logRows = result.rows;
  } catch (err) {
    console.warn('[leaderboardFilters] trade_log window query failed:', err?.message || err);
  }

  const [enrollments, profiles] = await Promise.all([readEnrollments(), readProfiles()]);
  const byWallet = new Map();

  const pushTrade = (wallet, trade) => {
    const key = walletKey(wallet);
    if (!key) return;
    if (!byWallet.has(key)) {
      byWallet.set(key, { buys: [], wins: 0, losses: 0, volume: 0 });
    }
    const bucket = byWallet.get(key);
    bucket.buys.push(trade);
    const outcome = String(trade.outcome || '').toLowerCase();
    if (outcome === 'win' || outcome === 'won') bucket.wins += 1;
    if (outcome === 'loss' || outcome === 'lost') bucket.losses += 1;
    bucket.volume += Number(trade.amountTusdc ?? trade.amount_tusdc) || 0;
  };

  if (logRows.length) {
    for (const row of logRows) {
      pushTrade(row.wallet, {
        action: 'BUY',
        roundId: row.round_id,
        side: row.side,
        symbol: row.symbol,
        amountTusdc: row.amount_tusdc,
        hash: row.hash,
        outcome: row.outcome,
        at: Math.floor(new Date(row.created_at).getTime() / 1000),
        created_at: row.created_at,
      });
    }
  } else {
    for (const row of Object.values(enrollments)) {
      const trades = (row.tradeLog || []).filter(
        (t) => t.action === 'BUY' && inWindow(tradeTs(t), window.start, window.end)
      );
      for (const t of trades) pushTrade(row.wallet, t);
    }
  }

  const xpPerTrade = 2;
  const xpPerWin = 5;

  const enriched = [];
  for (const [key, bucket] of byWallet.entries()) {
    const enrollment = reconcileTradeLog(enrollments[key] || { wallet: key, tradeLog: bucket.buys });
    if (!enrollment && !bucket.buys.length) continue;
    const status = enrollment?.status || 'retired';
    if (status !== 'active' && !bucket.buys.length) continue;

    const settled = bucket.wins + bucket.losses;
    const txCount = bucket.buys.length || countLeaderboardTxs({ ...enrollment, tradeLog: bucket.buys });
    const periodXp = txCount * xpPerTrade + bucket.wins * xpPerWin;
    const fullXp = enrollment ? buildXp(enrollment, profiles[key]?.socialLinks || {}) : null;

    enriched.push({
      wallet: enrollment?.wallet || key,
      displayName: profiles[key]?.displayName || null,
      agentId: getAgentById(enrollment?.agentId)?.id || enrollment?.agentId || null,
      agentName: getAgentById(enrollment?.agentId)?.name || enrollment?.agentName || null,
      txCount,
      lastTxHash: [...bucket.buys].reverse().find((t) => t.hash)?.hash || '',
      status,
      wins: bucket.wins,
      losses: bucket.losses,
      winRate: settled > 0 ? Math.round((bucket.wins / settled) * 100) : null,
      bySymbol: [],
      volume: bucket.volume,
      xp: periodXp,
      xpLevel: fullXp?.level || 1,
      xpBreakdown: { periodTrades: txCount * xpPerTrade, periodWins: bucket.wins * xpPerWin },
      streak: fullXp?.streak?.current || 0,
      longestStreak: fullXp?.streak?.longest || 0,
      avgDailyTxs: fullXp?.avgDailyTxs || 0,
      windowed: true,
    });
  }

  const sorted = sortRows(enriched, primary === 'xp' ? 'xp' : primary, secondary);
  return sorted.map((row, i) => ({ ...row, rank: i + 1 }));
}

export { slugify };
