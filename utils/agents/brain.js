import { getAgentById } from './config.js';

const WATCH_GAP_SEC = 2;

export function createAgentMemory(agentId) {
  return {
    createdAt: Math.floor(Date.now() / 1000),
    lastThoughtAt: 0,
    rotateIndex: 0,
    symbolStats: {},
    lastTradeAtBySymbol: {},
    recentThoughts: [],
    pendingLessons: [],
    journal: [],
    aiMode: 'simulated',
  };
}

function ensureSymbolStats(memory, symbol) {
  if (!memory.symbolStats[symbol]) {
    memory.symbolStats[symbol] = { wins: 0, losses: 0, lastSide: null, lastResult: null, cooldownUntil: 0 };
  }
  return memory.symbolStats[symbol];
}

function driftPct(round) {
  const start = Number(round.startPrice || 0);
  const price = Number(round.currentPrice || 0);
  if (!start) return 0;
  return ((price - start) / start) * 100;
}

function poolSkew(round) {
  const up = Number(round.upPool || 0);
  const down = Number(round.downPool || 0);
  const total = up + down || 1;
  return { up, down, upPct: up / total };
}

function pushThought(memory, text) {
  memory.recentThoughts = [{ at: Math.floor(Date.now() / 1000), text }, ...(memory.recentThoughts || [])].slice(
    0,
    12
  );
  memory.lastThoughtAt = Math.floor(Date.now() / 1000);
}

function openSymbols(openPositions) {
  return new Set((openPositions || []).map((p) => p.symbol));
}

function canTradeSymbol(memory, symbol, now) {
  const stats = ensureSymbolStats(memory, symbol);
  if (stats.cooldownUntil > now) return false;
  const last = memory.lastTradeAtBySymbol?.[symbol] || 0;
  return now - last >= WATCH_GAP_SEC;
}

/** Market is considered low-activity when total pool is under this threshold (TUSDC). */
const LOW_ACTIVITY_TUSDC = 100;
const TUSDC_DECIMALS = 6;

function isLowActivity(round) {
  const up = Number(round.upPool || 0);
  const down = Number(round.downPool || 0);
  // Pool values are raw BigInt units (6 decimals for TUSDC)
  const totalTusdc = (up + down) / 10 ** TUSDC_DECIMALS;
  return totalTusdc < LOW_ACTIVITY_TUSDC;
}

function scoreAsset(asset) {
  const drift = Math.abs(driftPct(asset.round));
  const skew = poolSkew(asset.round);
  const imbalance = Math.abs(skew.upPct - 0.5);
  const timeLeft = Number(asset.round.endTime || 0) - Math.floor(Date.now() / 1000);
  if (timeLeft < 35) return -1;
  // Low-activity markets are entry opportunities — give them a base score
  if (isLowActivity(asset.round)) return 10 + drift * 2;
  return drift * 2 + imbalance * 15;
}

/** Rule core — used by AI layer as execution guardrails */
export function decideWithRules(enrollment, assets, openPositions) {
  const agent = getAgentById(enrollment.agentId);
  if (!agent || !assets?.length) return null;

  const memory = enrollment.agentMemory || createAgentMemory(agent.id);
  const now = Math.floor(Date.now() / 1000);
  const open = openSymbols(openPositions);
  const maxOpen = agent.maxOpenMarkets ?? 2;

  if (open.size >= maxOpen) {
    pushThought(memory, `${agent.name}: Holding ${open.size} live clips — watching other markets.`);
    return { memory, decision: null };
  }

  const candidates = assets
    .filter((a) => !open.has(a.symbol) && canTradeSymbol(memory, a.symbol, now))
    .map((a) => ({ ...a, score: scoreAsset(a) }))
    .filter((a) => a.score >= 0)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) {
    pushThought(memory, `${agent.name}: Scanning all markets — no setup yet.`);
    return { memory, decision: null };
  }

  let pick = null;
  let isUp = true;
  let thought = '';

  switch (agent.id) {
    case 'ava-strike': {
      pick = candidates[0];
      const stats = ensureSymbolStats(memory, pick.symbol);
      const drift = driftPct(pick.round);
      const fresh = isLowActivity(pick.round);
      const minDrift = stats.lastResult === 'loss' ? 0.35 : 0.12;
      if (!fresh && Math.abs(drift) < minDrift) {
        thought = `${agent.name}: ${pick.symbol} too flat after last miss — waiting for momentum.`;
        pick = null;
        break;
      }
      if (fresh) {
        // Fresh market — strike first, bias based on any available drift or alternate sides
        isUp = drift !== 0 ? drift > 0 : (memory.rotateIndex || 0) % 2 === 0;
        memory.rotateIndex = (memory.rotateIndex || 0) + 1;
        thought = `${agent.name}: Fresh round on ${pick.symbol} — striking first with ${enrollment.tradeSizeTusdc} TUSDC ${isUp ? 'UP' : 'DOWN'}.`;
      } else {
        isUp = drift >= 0;
        thought = `${agent.name}: ${pick.symbol} momentum ${drift.toFixed(2)}% — striking ${isUp ? 'UP' : 'DOWN'} with ${enrollment.tradeSizeTusdc} TUSDC.`;
      }
      break;
    }
    case 'peak-mind': {
      const ranked = candidates
        .map((a) => {
          const fresh = isLowActivity(a.round);
          const absDrift = Math.abs(driftPct(a.round));
          // Fresh markets get a base confidence so they aren't always filtered out
          const conf = fresh
            ? 0.15 + absDrift * 0.5
            : absDrift * (1 - Math.abs(poolSkew(a.round).upPct - 0.5));
          return { ...a, conf, fresh };
        })
        .sort((a, b) => b.conf - a.conf);
      const floor = Object.values(memory.symbolStats || {}).some((s) => s.lastResult === 'loss') ? 0.12 : 0.06;
      const pool = ranked.filter((a) => a.conf >= floor);
      if (!pool.length) {
        thought = `${agent.name}: Scanning BTC · ETH · AVAX · BNB · NEAR — no clip clears my bar yet.`;
        break;
      }
      const idx = (memory.rotateIndex || 0) % pool.length;
      pick = pool[idx];
      memory.rotateIndex = idx + 1;
      const drift = driftPct(pick.round);
      const skew = poolSkew(pick.round);
      if (pick.fresh) {
        // Fresh market — alternate sides since there's no crowd signal
        isUp = idx % 2 === 0;
        thought = `${agent.name}: Fresh round ${idx + 1}/${pool.length} — seeding ${pick.symbol} ${isUp ? 'UP' : 'DOWN'} (${enrollment.tradeSizeTusdc} TUSDC). First mover advantage.`;
      } else if (Math.abs(drift) >= 0.06) {
        isUp = drift > 0;
        thought = `${agent.name}: Clip ${idx + 1}/${pool.length} — ${pick.symbol} ${isUp ? 'UP' : 'DOWN'} (${enrollment.tradeSizeTusdc} TUSDC) while I keep scanning every market.`;
      } else if (skew.upPct >= 0.55) {
        isUp = false;
        thought = `${agent.name}: Clip ${idx + 1}/${pool.length} — ${pick.symbol} DOWN (${enrollment.tradeSizeTusdc} TUSDC) — crowd is too heavy UP.`;
      } else if (skew.upPct <= 0.45) {
        isUp = true;
        thought = `${agent.name}: Clip ${idx + 1}/${pool.length} — ${pick.symbol} UP (${enrollment.tradeSizeTusdc} TUSDC) — crowd is leaning DOWN.`;
      } else {
        isUp = (memory.rotateIndex + idx) % 2 === 0;
        thought = `${agent.name}: Clip ${idx + 1}/${pool.length} — ${pick.symbol} ${isUp ? 'UP' : 'DOWN'} (${enrollment.tradeSizeTusdc} TUSDC) while I keep scanning every market.`;
      }
      break;
    }
    case 'frost-logic': {
      const crowded = [...candidates].sort((a, b) => {
        // Prefer markets with actual crowd data; fresh markets sort last
        const fa = isLowActivity(a.round) ? 0 : 1;
        const fb = isLowActivity(b.round) ? 0 : 1;
        if (fa !== fb) return fb - fa;
        const ia = Math.abs(poolSkew(a.round).upPct - 0.5);
        const ib = Math.abs(poolSkew(b.round).upPct - 0.5);
        return ib - ia;
      })[0];
      pick = crowded;
      const fresh = isLowActivity(pick.round);
      const skew = poolSkew(pick.round);
      const stats = ensureSymbolStats(memory, pick.symbol);
      if (fresh) {
        // Fresh market — no crowd to fade yet; use drift or alternate
        const drift = driftPct(pick.round);
        isUp = drift !== 0 ? drift < 0 : (memory.rotateIndex || 0) % 2 === 0;
        memory.rotateIndex = (memory.rotateIndex || 0) + 1;
        thought = `${agent.name}: Empty pool on ${pick.symbol} — contrarian entry ${isUp ? 'UP' : 'DOWN'} with ${enrollment.tradeSizeTusdc} TUSDC before the crowd arrives.`;
      } else if (stats.lastResult === 'loss') {
        isUp = !(skew.upPct < 0.5);
        thought = `${agent.name}: Last fade on ${pick.symbol} failed — flipping to ${isUp ? 'UP' : 'DOWN'}.`;
      } else {
        isUp = skew.upPct < 0.5;
        thought = `${agent.name}: Crowd heavy ${skew.upPct > 0.5 ? 'UP' : 'DOWN'} on ${pick.symbol} — fading.`;
      }
      break;
    }
    case 'subnet-sage': {
      const ordered = [...candidates].sort((a, b) => a.symbol.localeCompare(b.symbol));
      const idx = memory.rotateIndex % ordered.length;
      pick = ordered[idx];
      memory.rotateIndex = idx + 1;
      const drift = driftPct(pick.round);
      const fresh = isLowActivity(pick.round);
      const stats = ensureSymbolStats(memory, pick.symbol);
      if (stats.lastResult === 'loss') {
        isUp = drift <= 0;
        thought = `${agent.name}: Lost last round on ${pick.symbol} — flipping bias, ${enrollment.tradeSizeTusdc} TUSDC ${isUp ? 'UP' : 'DOWN'}.`;
      } else if (fresh) {
        // Fresh market — always enter; alternate sides across rotation
        isUp = idx % 2 === 0;
        thought = `${agent.name}: Fresh round on ${pick.symbol} — seeding lane ${idx + 1}/${ordered.length} with ${enrollment.tradeSizeTusdc} TUSDC ${isUp ? 'UP' : 'DOWN'}.`;
      } else {
        isUp = drift >= 0;
        thought = `${agent.name}: Rotating clip ${idx + 1}/${ordered.length} on ${pick.symbol} — ${enrollment.tradeSizeTusdc} TUSDC ${isUp ? 'UP' : 'DOWN'}.`;
      }
      break;
    }
    default:
      pick = candidates[0];
      isUp = driftPct(pick.round) >= 0;
      thought = `${agent.name}: Entering ${pick.symbol}.`;
  }

  if (!pick) {
    pushThought(memory, thought);
    return { memory, decision: null };
  }

  pushThought(memory, thought);
  return {
    memory,
    decision: {
      roundId: pick.roundId,
      symbol: pick.symbol,
      isUp,
      thought,
    },
  };
}

/** After chain settlement — runner calls when a logged round resolves */
export function learnFromOutcome(memory, symbol, isUp, upWins) {
  const stats = ensureSymbolStats(memory, symbol);
  const won = (isUp && upWins) || (!isUp && !upWins);
  if (won) {
    stats.wins += 1;
    stats.lastResult = 'win';
    stats.cooldownUntil = 0;
  } else {
    stats.losses += 1;
    stats.lastResult = 'loss';
    stats.cooldownUntil = Math.floor(Date.now() / 1000) + 45;
  }
  stats.lastSide = isUp ? 'UP' : 'DOWN';
  return memory;
}

export function recordTradePlanned(memory, symbol) {
  const now = Math.floor(Date.now() / 1000);
  if (!memory.lastTradeAtBySymbol) memory.lastTradeAtBySymbol = {};
  memory.lastTradeAtBySymbol[symbol] = now;
  return memory;
}

export function agentChatterFromThought(agent, peer, thought) {
  if (thought) return thought;
  return `${agent.name}: Still watching the board.`;
}

/** AI-style reasoning (LLM if keyed, else simulated first-person analysis) */
export async function decideNextTrade(enrollment, assets, openPositions, llmOptions = {}) {
  const { decideWithAI } = await import('./aiReason.js');
  return decideWithAI(enrollment, assets, openPositions, llmOptions);
}
