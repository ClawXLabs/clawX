/** Build win/loss track record from agent memory + enrollment. */
export function buildTrackRecord(enrollment) {
  if (!enrollment) {
    return {
      wins: 0,
      losses: 0,
      settled: 0,
      winRate: null,
      totalTrades: 0,
      pendingOutcomes: 0,
      bySymbol: [],
      summary: 'No settled rounds yet',
    };
  }

  const stats = enrollment.agentMemory?.symbolStats || {};
  let wins = 0;
  let losses = 0;
  const bySymbol = [];

  for (const [symbol, row] of Object.entries(stats)) {
    const w = Number(row.wins) || 0;
    const l = Number(row.losses) || 0;
    wins += w;
    losses += l;
    if (w + l > 0) {
      bySymbol.push({
        symbol,
        wins: w,
        losses: l,
        lastResult: row.lastResult || null,
        lastSide: row.lastSide || null,
      });
    }
  }

  bySymbol.sort((a, b) => b.wins + b.losses - (a.wins + a.losses));

  const settled = wins + losses;
  const winRate = settled > 0 ? Math.round((wins / settled) * 100) : null;
  const totalTrades = (enrollment.tradeLog || []).filter((t) => t.action === 'BUY').length;
  const pendingOutcomes = (enrollment.pendingOutcomes || []).length;

  let summary = 'No settled rounds yet';
  if (settled > 0) {
    summary = `${wins}W / ${losses}L across ${bySymbol.length} market${bySymbol.length === 1 ? '' : 's'}`;
    if (winRate !== null) summary += ` · ${winRate}% win rate`;
  } else if (totalTrades > 0) {
    summary = `${totalTrades} trade${totalTrades === 1 ? '' : 's'} placed — awaiting settlement`;
  }

  return {
    wins,
    losses,
    settled,
    winRate,
    totalTrades,
    pendingOutcomes,
    bySymbol,
    summary,
  };
}
