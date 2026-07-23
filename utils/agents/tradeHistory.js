/** Enrich trade log with settlement outcomes and pool totals. */

function tradeKey(t) {
  return `${t.roundId}-${(t.side || '').toUpperCase()}`;
}

function pendingKey(p) {
  const side = p.isUp ? 'UP' : 'DOWN';
  return `${p.roundId}-${side}`;
}

/** Map settled outcomes from agent memory journal + pending queue. */
export function buildEnrichedTradeLog(enrollment) {
  if (!enrollment) return { trades: [], totalPoolTusdc: 0, pendingCount: 0 };

  const pending = enrollment.pendingOutcomes || [];
  const pendingSet = new Set(pending.map(pendingKey));
  const journal = enrollment.agentMemory?.journal || [];

  const outcomeByRound = new Map();
  for (const entry of journal) {
    if (entry.type !== 'outcome' || !entry.roundId) continue;
    outcomeByRound.set(tradeKey({ roundId: entry.roundId, side: entry.side }), {
      outcome: entry.won ? 'win' : 'loss',
      settledAt: entry.at,
      text: entry.text,
    });
  }

  const rawLog = [...(enrollment.tradeLog || [])];
  const seen = new Set(rawLog.map(tradeKey));

  for (const p of pending) {
    const side = p.isUp ? 'UP' : 'DOWN';
    const key = `${p.roundId}-${side}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rawLog.unshift({
      at: p.at || Math.floor(Date.now() / 1000),
      action: 'BUY',
      side,
      symbol: p.symbol,
      amountTusdc: enrollment.tradeSizeTusdc,
      hash: p.hash || '',
      roundId: p.roundId,
    });
  }

  let totalPoolTusdc = 0;
  let totalWonTusdc = 0;
  let totalLostTusdc = 0;

  const trades = rawLog
    .filter((t) => t.action === 'BUY')
    .map((t) => {
      const key = tradeKey(t);
      const amount = Number(t.amountTusdc) || Number(enrollment.tradeSizeTusdc) || 0;
      totalPoolTusdc += amount;

      let outcome = t.outcome || null;
      let settledAt = t.settledAt || null;
      let outcomeNote = t.outcomeNote || null;

      if (!outcome && outcomeByRound.has(key)) {
        const row = outcomeByRound.get(key);
        outcome = row.outcome;
        settledAt = row.settledAt;
        outcomeNote = row.text;
      }
      if (!outcome && pendingSet.has(key)) {
        outcome = 'pending';
      }

      let pnlTusdc = null;
      if (outcome === 'win') {
        pnlTusdc = amount;
        totalWonTusdc += amount;
      } else if (outcome === 'loss') {
        pnlTusdc = -amount;
        totalLostTusdc += amount;
      }

      return {
        ...t,
        outcome,
        settledAt,
        outcomeNote,
        pnlTusdc,
        pendingSettlement: outcome === 'pending',
      };
    });

  return {
    trades,
    totalPoolTusdc: Math.round(totalPoolTusdc * 100) / 100,
    totalWonTusdc: Math.round(totalWonTusdc * 100) / 100,
    totalLostTusdc: Math.round(totalLostTusdc * 100) / 100,
    netPnlTusdc: Math.round((totalWonTusdc - totalLostTusdc) * 100) / 100,
    pendingCount: trades.filter((t) => t.outcome === 'pending').length,
  };
}

export function buildMatchHistory(enrollment) {
  const { trades } = buildEnrichedTradeLog(enrollment);
  return trades
    .filter((t) => t.outcome === 'win' || t.outcome === 'loss')
    .map((t) => ({
      roundId: t.roundId,
      symbol: t.symbol,
      side: t.side,
      amountTusdc: t.amountTusdc,
      outcome: t.outcome,
      pnlTusdc: t.pnlTusdc,
      hash: t.hash,
      at: t.at,
      settledAt: t.settledAt,
      outcomeNote: t.outcomeNote,
    }));
}

export function buildPendingSettlements(enrollment) {
  const pending = enrollment?.pendingOutcomes || [];
  const tradeLog = enrollment?.tradeLog || [];
  return pending.map((p) => {
    const fromLog = tradeLog.find(
      (t) => Number(t.roundId) === Number(p.roundId) && String(t.action || '').toUpperCase() === 'BUY'
    );
    return {
      roundId: p.roundId,
      assetId: p.assetId ?? fromLog?.assetId,
      symbol: p.symbol,
      side: p.isUp ? 'UP' : 'DOWN',
      amountTusdc: p.amountTusdc ?? fromLog?.amountTusdc ?? enrollment.tradeSizeTusdc,
      hash: p.hash || fromLog?.hash || '',
      placedAt: p.at,
      waitingSec: Math.max(0, Math.floor(Date.now() / 1000) - (p.at || 0)),
    };
  });
}

/** Attach buy hash / stake from trade log onto on-chain open positions. */
export function enrichOpenPositions(positions, enrollment) {
  const tradeLog = enrollment?.tradeLog || [];
  const pending = enrollment?.pendingOutcomes || [];
  return (positions || []).map((pos) => {
    const rid = Number(pos.roundId);
    const fromPending = pending.find((p) => Number(p.roundId) === rid);
    const fromLog = tradeLog.find(
      (t) => Number(t.roundId) === rid && String(t.action || '').toUpperCase() === 'BUY'
    );
    return {
      ...pos,
      hash: fromPending?.hash || fromLog?.hash || pos.hash || null,
      amountTusdc:
        fromPending?.amountTusdc ?? fromLog?.amountTusdc ?? enrollment?.tradeSizeTusdc ?? null,
    };
  });
}

export function buildDelegateStatus(enrollment) {
  if (!enrollment) {
    return {
      spentTusdc: 0,
      maxTusdc: 0,
      remainingTusdc: 0,
      capReached: false,
      delegateExpired: false,
      paused: false,
      canTrade: false,
    };
  }

  const decimals = 6;
  const spentRaw = BigInt(enrollment.delegateSpentRaw || '0');
  const maxRaw = BigInt(enrollment.delegateMaxRaw || '0');
  const tradeRaw = BigInt(enrollment.tradeSizeRaw || '0');
  const spentTusdc = Number(spentRaw) / 10 ** decimals;
  const maxTusdc = Number(maxRaw) / 10 ** decimals;
  const remainingRaw = maxRaw > spentRaw ? maxRaw - spentRaw : 0n;
  const remainingTusdc = Number(remainingRaw) / 10 ** decimals;
  const deadline = Number(enrollment.delegateDeadline) || 0;
  const now = Math.floor(Date.now() / 1000);
  const delegateExpired = deadline > 0 && now >= deadline;
  const capReached = tradeRaw <= 0n || spentRaw + tradeRaw > maxRaw || remainingRaw < tradeRaw;
  const paused = Boolean(enrollment.paused);

  return {
    spentTusdc: Math.round(spentTusdc * 100) / 100,
    maxTusdc: Math.round(maxTusdc * 100) / 100,
    remainingTusdc: Math.round(remainingTusdc * 100) / 100,
    capReached,
    delegateExpired,
    delegateDeadline: deadline,
    paused,
    canTrade: !paused && !capReached && !delegateExpired && enrollment.status === 'active',
    needsRedeploy: capReached || delegateExpired,
  };
}
