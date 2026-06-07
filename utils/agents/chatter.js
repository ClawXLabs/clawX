import { AGENTS } from './config.js';

/** Pick a different agent persona to reply in the feed. */
export function pickPeerAgent(agentId) {
  const others = AGENTS.filter((a) => a.id !== agentId);
  if (!others.length) return null;
  return others[Math.floor(Math.random() * others.length)];
}

export function planTradeThought(agent, enrollment, decision, memory) {
  const stats = memory?.symbolStats?.[decision.symbol];
  const side = decision.isUp ? 'UP' : 'DOWN';
  const size = enrollment.tradeSizeTusdc;

  const historyBit = stats?.lastResult
    ? stats.lastResult === 'loss'
      ? `Last ${decision.symbol} round didn't go my way, so I'm sizing carefully — `
      : `Last ${decision.symbol} round worked; staying disciplined — `
    : `Fresh read on ${decision.symbol} — `;

  const lines = {
    'ava-strike': `${historyBit}momentum on ${decision.symbol} looks ${decision.isUp ? 'bullish' : 'bearish'}. Taking ${side} for ${size} TUSDC this 5m window.`,
    'peak-mind': `${historyBit}${decision.symbol} is my pick after scanning all five markets. ${side} clip, ${size} TUSDC — one clean entry.`,
    'frost-logic': `${historyBit}pool on ${decision.symbol} looks crowded the wrong way. Fading into ${side} with ${size} TUSDC.`,
    'subnet-sage': `${historyBit}rotating into ${decision.symbol} ${side} (${size} TUSDC) — keeping exposure spread across the board.`,
  };

  return lines[agent.id] || `${agent.name}: ${historyBit}${decision.symbol} ${side}, ${size} TUSDC.`;
}

export function peerTradeReaction(peer, traderAgent, symbol, isUp, sizeTusdc) {
  const side = isUp ? 'UP' : 'DOWN';
  const reactions = [
    `${peer.name}: Noted ${traderAgent.name}'s ${side} on ${symbol} (${sizeTusdc} TUSDC). I'll watch how this 5m round settles.`,
    `${peer.name}: ${traderAgent.name} just clipped ${symbol} ${side}. Curious if price agrees by expiry.`,
    `${peer.name}: Seeing ${traderAgent.name} lean ${side} on ${symbol} — I'm still on my own read for this window.`,
    `${peer.name}: ${traderAgent.name} fired a ${sizeTusdc} TUSDC ${side} on ${symbol}. Good luck — results in a few minutes.`,
  ];
  return reactions[Math.floor(Math.random() * reactions.length)];
}

export function peerOutcomeReaction(peer, traderAgent, symbol, isUp, won) {
  const side = isUp ? 'UP' : 'DOWN';
  if (won) {
    return [
      `${peer.name}: ${traderAgent.name}'s ${side} on ${symbol} just paid — sharp read on that 5m close.`,
      `${peer.name}: Round settled — ${traderAgent.name} was right on ${symbol} ${side}. I'll factor that into my next scan.`,
    ][Math.floor(Math.random() * 2)];
  }
  return [
    `${peer.name}: Tough break for ${traderAgent.name} on ${symbol} ${side} — that's the game on these 5m markets.`,
    `${peer.name}: ${symbol} went the other way vs ${traderAgent.name}'s ${side}. Happens — on to the next window.`,
  ][Math.floor(Math.random() * 2)];
}

export function outcomeJournalText(agent, symbol, isUp, won) {
  const side = isUp ? 'UP' : 'DOWN';
  if (won) {
    return `${agent.name}: ${symbol} ${side} settled in our favour — logging the win and tightening filters for the next 5m round.`;
  }
  return `${agent.name}: ${symbol} ${side} didn't land — noting the miss and pausing on that symbol before re-entry.`;
}
