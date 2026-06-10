/**
 * XP, Streak and Activity stats engine.
 *
 * XP breakdown:
 *   2 XP  per trade placed
 *   5 XP  per settled win
 *   0 XP  per loss (no penalty)
 *   10 XP per active-day streak bonus (× streak length, up to 100)
 *   50 XP Twitter verified + following ClawX
 *   50 XP Telegram group member
 *   Milestone bonuses: 10 trades → 25, 50 → 100, 100 → 250, 500 → 1000 XP
 *   Win-rate milestones: ≥50% → 50, ≥60% → 100, ≥70% → 200 XP
 */

const XP_PER_TRADE      = 2;
const XP_PER_WIN        = 5;
const XP_STREAK_PER_DAY = 10;   // ×streak days, capped at 100
const XP_TWITTER        = 50;
const XP_TELEGRAM       = 50;

const TRADE_MILESTONES  = [
  { trades: 10,  xp: 25  },
  { trades: 50,  xp: 100 },
  { trades: 100, xp: 250 },
  { trades: 500, xp: 1000 },
];

const WINRATE_MILESTONES = [
  { rate: 70, xp: 200 },
  { rate: 60, xp: 100 },
  { rate: 50, xp: 50  },
];

/** 'YYYY-MM-DD' UTC string from a unix timestamp (seconds). */
function utcDay(ts) {
  const d = new Date(Number(ts) * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Today's UTC day string. */
function todayUtc() {
  return utcDay(Math.floor(Date.now() / 1000));
}

/** Day before a YYYY-MM-DD string. */
function prevDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Compute streak data from a tradeLog.
 * Returns { current, longest, lastActiveDate, activeDays }
 */
export function buildStreak(tradeLog) {
  if (!tradeLog || tradeLog.length === 0) {
    return { current: 0, longest: 0, lastActiveDate: null, activeDays: 0 };
  }

  const days = new Set(tradeLog.map((t) => utcDay(t.at)));
  const sorted = [...days].sort().reverse(); // newest first

  let current = 0;
  const today = todayUtc();
  const yesterday = prevDay(today);

  // Streak is alive if last active day is today or yesterday
  if (sorted[0] === today || sorted[0] === yesterday) {
    let cursor = sorted[0];
    for (const day of sorted) {
      if (day === cursor) {
        current += 1;
        cursor = prevDay(cursor);
      } else {
        break;
      }
    }
  }

  // Longest streak: iterate all days
  let longest = 0;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prevDay(sorted[i - 1])) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      if (run > longest) longest = run;
      run = 1;
    }
  }
  if (run > longest) longest = run;
  if (current > longest) longest = current;

  return {
    current,
    longest,
    lastActiveDate: sorted[0] || null,
    activeDays: days.size,
  };
}

/**
 * Compute avg daily transactions over lifetime.
 * @param {Array} tradeLog
 * @returns {number}
 */
export function avgDailyTxs(tradeLog) {
  if (!tradeLog || tradeLog.length === 0) return 0;
  const buys = tradeLog.filter((t) => t.action === 'BUY');
  if (!buys.length) return 0;
  const minTs = Math.min(...buys.map((t) => Number(t.at)));
  const maxTs = Math.max(...buys.map((t) => Number(t.at)));
  const days = Math.max(1, Math.round((maxTs - minTs) / 86400) + 1);
  return Math.round((buys.length / days) * 10) / 10;
}

/**
 * Build full XP breakdown from enrollment + social links.
 */
export function buildXp(enrollment, socialLinks = {}) {
  if (!enrollment) {
    return { total: 0, level: 1, nextLevelXp: 100, breakdown: {}, streak: { current: 0, longest: 0, activeDays: 0 } };
  }

  const tradeLog = enrollment.tradeLog || [];
  const buys = tradeLog.filter((t) => t.action === 'BUY');
  const txCount = buys.length;

  // Count wins from symbolStats (most reliable source)
  const stats = enrollment.agentMemory?.symbolStats || {};
  const wins = Object.values(stats).reduce((s, r) => s + (Number(r.wins) || 0), 0);

  // Streak
  const streak = buildStreak(buys);

  // Core XP
  const tradeXp   = txCount * XP_PER_TRADE;
  const winXp     = wins * XP_PER_WIN;
  const streakXp  = Math.min(streak.current * XP_STREAK_PER_DAY, 100);
  const twitterXp = (socialLinks.twitter?.verified) ? XP_TWITTER : 0;
  const telegramXp = (socialLinks.telegram?.inGroup) ? XP_TELEGRAM : 0;

  // Milestone bonuses
  let milestoneXp = 0;
  for (const m of TRADE_MILESTONES) {
    if (txCount >= m.trades) milestoneXp += m.xp;
  }
  const settled = wins + Object.values(stats).reduce((s, r) => s + (Number(r.losses) || 0), 0);
  const winRate = settled > 0 ? Math.round((wins / settled) * 100) : 0;
  for (const m of WINRATE_MILESTONES) {
    if (winRate >= m.rate) { milestoneXp += m.xp; break; }
  }

  const total = tradeXp + winXp + streakXp + twitterXp + telegramXp + milestoneXp;

  // Level = every 500 XP
  const level = Math.floor(total / 500) + 1;
  const nextLevelXp = level * 500;
  const progressXp = total % 500;

  return {
    total,
    level,
    nextLevelXp,
    progressXp,
    progressPct: Math.round((progressXp / 500) * 100),
    winRate,
    breakdown: {
      trades:    { xp: tradeXp,   label: `${txCount} trades × ${XP_PER_TRADE} XP` },
      wins:      { xp: winXp,     label: `${wins} wins × ${XP_PER_WIN} XP` },
      streak:    { xp: streakXp,  label: `${streak.current}-day streak bonus` },
      twitter:   { xp: twitterXp, label: twitterXp ? 'Following @clawxlabs' : 'Twitter not verified' },
      telegram:  { xp: telegramXp, label: telegramXp ? 'ClawXLabs🔺 member' : 'Not in Telegram group' },
      milestones: { xp: milestoneXp, label: 'Milestone bonuses' },
    },
    streak,
    avgDailyTxs: avgDailyTxs(buys),
  };
}

/**
 * Group tradeLog entries by agent persona.
 * Entries stamped with agentId are grouped precisely.
 * Unstamped entries fall back to the enrollment's current agentId.
 */
export function buildAgentBreakdown(enrollment, agentsConfig) {
  if (!enrollment) return { agents: [], combined: null };

  const tradeLog = enrollment.tradeLog || [];
  const fallbackId = enrollment.agentId;

  const byAgent = new Map();

  const ensure = (id, name, emoji, color) => {
    if (!byAgent.has(id)) {
      byAgent.set(id, {
        agentId: id,
        agentName: name || id,
        emoji: emoji || '🤖',
        color: color || '#888',
        trades: [],
        wins: 0,
        losses: 0,
        isActive: enrollment.agentId === id && enrollment.status === 'active',
      });
    }
    return byAgent.get(id);
  };

  // Load agent config for names/emoji
  const configMap = new Map((agentsConfig || []).map((a) => [a.id, a]));
  const cfg = (id) => configMap.get(id) || {};

  for (const entry of tradeLog) {
    if (entry.action !== 'BUY') continue;
    const id = entry.agentId || fallbackId;
    const c = cfg(id);
    const bucket = ensure(id, entry.agentName || c.name || id, c.emoji, c.color);
    bucket.trades.push(entry);
  }

  // Pull wins/losses from symbolStats (current agent only — historical agents lose this detail)
  const currentBucket = byAgent.get(fallbackId);
  if (currentBucket) {
    const stats = enrollment.agentMemory?.symbolStats || {};
    for (const row of Object.values(stats)) {
      currentBucket.wins   += Number(row.wins)   || 0;
      currentBucket.losses += Number(row.losses) || 0;
    }
  }

  const agentList = [...byAgent.values()].map((b) => {
    const txCount = b.trades.length;
    const settled = b.wins + b.losses;
    const winRate = settled > 0 ? Math.round((b.wins / settled) * 100) : null;
    const totalPoolSpend = b.trades.reduce((s, t) => s + (Number(t.amountTusdc) || 0), 0);

    // Per-symbol stats from this agent's trades (only for current agent where we have outcome data)
    const bySymbol = {};
    for (const t of b.trades) {
      if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { symbol: t.symbol, trades: 0, spend: 0 };
      bySymbol[t.symbol].trades += 1;
      bySymbol[t.symbol].spend += Number(t.amountTusdc) || 0;
    }

    return {
      agentId: b.agentId,
      agentName: b.agentName,
      emoji: b.emoji,
      color: b.color,
      status: b.isActive ? 'active' : 'retired',
      txCount,
      wins: b.wins,
      losses: b.losses,
      winRate,
      totalPoolSpend: Math.round(totalPoolSpend * 100) / 100,
      bySymbol: Object.values(bySymbol).sort((a, z) => z.trades - a.trades),
      tradeLog: b.trades.slice(0, 50),
    };
  });

  // Sort: active first, then by txCount
  agentList.sort((a, z) => {
    if (a.status === 'active' && z.status !== 'active') return -1;
    if (z.status === 'active' && a.status !== 'active') return 1;
    return z.txCount - a.txCount;
  });

  // Combined totals
  const combined = {
    txCount: agentList.reduce((s, a) => s + a.txCount, 0),
    wins: agentList.reduce((s, a) => s + a.wins, 0),
    losses: agentList.reduce((s, a) => s + a.losses, 0),
    totalPoolSpend: Math.round(agentList.reduce((s, a) => s + a.totalPoolSpend, 0) * 100) / 100,
    agentCount: agentList.length,
  };
  const cSettled = combined.wins + combined.losses;
  combined.winRate = cSettled > 0 ? Math.round((combined.wins / cSettled) * 100) : null;

  return { agents: agentList, combined };
}
