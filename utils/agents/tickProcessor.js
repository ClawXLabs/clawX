import { ethers } from 'ethers';
import { decideNextTrade, recordTradePlanned, createAgentMemory } from './brain.js';
import { journalOutcome } from './aiReason.js';
import { getAgentById, getTradesPerTick } from './config.js';
import { outcomeJournalText } from './chatter.js';
import { readOpenPositions } from './stats.js';
import {
  appendFeedMessage,
  applyPendingControlIfReady,
  getDisplayName,
  getEnrollment,
  setEnrollment,
  updateTradeLogOutcome,
} from './store.js';
import { getUserSettings } from './settings.js';
import { getMarketSnapshot } from './marketSnapshot.js';
import { acquireRedisLock } from '../db/redisLock.js';

const CONTRACT_ABI = [
  'function getRoundInfo(uint256 roundId) external view returns (uint256 assetId, string memory asset, uint256 roundNumber, uint256 startTime, uint256 endTime, uint256 startPrice, uint256 endPrice, bool resolved, bool upWins, uint256 upPool, uint256 downPool, uint256 upShares, uint256 downShares, uint256 collateralPool, uint256 currentPrice, address priceFeed)',
];

async function syncLessons(contract, enrollment) {
  if (!enrollment.pendingOutcomes?.length) return enrollment;
  const agent = getAgentById(enrollment.agentId);
  let memory = enrollment.agentMemory || createAgentMemory(enrollment.agentId);
  const stillPending = [];
  for (const item of enrollment.pendingOutcomes) {
    try {
      const round = await contract.getRoundInfo(item.roundId);
      if (!round.resolved) {
        stillPending.push(item);
        continue;
      }
      const won = (item.isUp && round.upWins) || (!item.isUp && !round.upWins);
      const side = item.isUp ? 'UP' : 'DOWN';
      await updateTradeLogOutcome(enrollment.wallet, item.roundId, side, won ? 'win' : 'loss', {
        settledAt: Math.floor(Date.now() / 1_000),
        outcomeNote: won ? 'Round settled — position won' : 'Round settled — position lost',
      });
      if (agent) {
        memory = journalOutcome(memory, agent, item.symbol, item.isUp, round.upWins);
        await appendFeedMessage({
          agentId: agent.id,
          agentName: agent.name,
          handle: agent.handle,
          emoji: agent.emoji,
          color: agent.color,
          text: outcomeJournalText(agent, item.symbol, item.isUp, won),
          pilotWallet: enrollment.wallet,
          pilotName: (await getDisplayName(enrollment.wallet)) || undefined,
          kind: won ? 'win' : 'loss',
        });
      }
    } catch {
      stillPending.push(item);
    }
  }
  return { ...enrollment, agentMemory: memory, pendingOutcomes: stillPending };
}

async function executeTrade(appUrl, runnerSecret, wallet, decision) {
  const response = await fetch(`${appUrl}/api/agents/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-agent-runner-secret': runnerSecret },
    body: JSON.stringify({
      wallet,
      roundId: decision.roundId,
      isUp: decision.isUp,
      symbol: decision.symbol,
      thought: decision.thought,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Execute failed (${response.status})`);
  return body;
}

export function createAgentTickProcessor(options = {}) {
  const contractAddress = options.contractAddress || process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!contractAddress) throw new Error('NEXT_PUBLIC_CONTRACT_ADDRESS is required');
  const rpcUrl = options.rpcUrl || process.env.FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';
  const appUrl = (options.appUrl || process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const runnerSecret = options.runnerSecret || process.env.AGENT_RUNNER_SECRET || 'dev-agent-runner';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);

  return async function processAgentTick(wallet) {
    const key = String(wallet || '').toLowerCase();
    let releaseLock = null;
    if (process.env.REDIS_URL) {
      try {
        releaseLock = await acquireRedisLock(`agent:lock:${key}`, { ttlMs: 120_000, waitMs: 1_000 });
      } catch {
        return { skipped: 'locked' };
      }
    }

    try {
      let enrollment = await getEnrollment(wallet);
      if (!enrollment || enrollment.status !== 'active') return { skipped: 'inactive' };
      enrollment = await syncLessons(contract, enrollment);

      // Deferred kill/switch: stop new trades; apply when open markets clear
      if (enrollment.pendingControl?.timing === 'next_market') {
        const open = await readOpenPositions(provider, wallet, contractAddress);
        const applied = await applyPendingControlIfReady(wallet, {
          openPositionCount: open.length,
        });
        if (applied.applied === 'kill') {
          return { skipped: 'killed', lessonsSynced: true };
        }
        if (applied.applied === 'switch_ready') {
          return { skipped: 'switch_ready', lessonsSynced: true };
        }
        enrollment = applied.enrollment || enrollment;
        await setEnrollment(wallet, enrollment);
        return { skipped: 'pending_control', lessonsSynced: true, open: open.length };
      }

      if (enrollment.paused) {
        await setEnrollment(wallet, enrollment);
        return { skipped: 'paused', lessonsSynced: true };
      }

      const assets = await getMarketSnapshot({ contractAddress, rpcUrl });
      if (!assets.length) {
        await setEnrollment(wallet, enrollment);
        return { skipped: 'no-open-rounds' };
      }
      const agent = getAgentById(enrollment.agentId);
      if (!agent) return { skipped: 'unknown-agent' };
      const userSettings = await getUserSettings(wallet, { includeKey: true });
      const llmOptions = userSettings?.apiKey
        ? {
            apiKey: userSettings.apiKey,
            model: userSettings.model,
            baseUrl: userSettings.baseUrl,
            cooldownSec: userSettings.cooldownSec,
          }
        : {};

      let row = { ...enrollment };
      let tradesDone = 0;
      for (let attempt = 0; attempt < getTradesPerTick(agent); attempt += 1) {
        const open = await readOpenPositions(provider, wallet, contractAddress);
        const memory = row.agentMemory || createAgentMemory(enrollment.agentId);
        const { memory: nextMemory, decision } = await decideNextTrade(
          { ...row, agentMemory: memory },
          assets,
          open,
          llmOptions
        );
        row = { ...row, agentMemory: nextMemory };
        if (!decision) break;
        const result = await executeTrade(appUrl, runnerSecret, wallet, decision);
        row.agentMemory = recordTradePlanned(nextMemory, decision.symbol);
        row.pendingOutcomes = [
          ...(row.pendingOutcomes || []),
          {
            roundId: decision.roundId,
            symbol: decision.symbol,
            isUp: decision.isUp,
            at: Math.floor(Date.now() / 1_000),
            hash: result.hash || '',
          },
        ].slice(-20);
        const fresh = await getEnrollment(wallet);
        row = await setEnrollment(wallet, {
          ...(fresh || row),
          agentMemory: row.agentMemory,
          pendingOutcomes: row.pendingOutcomes,
          lastTradeAt: Math.floor(Date.now() / 1_000),
        });
        tradesDone += 1;
      }
      if (!tradesDone) await setEnrollment(wallet, row);
      return { tradesDone };
    } finally {
      if (releaseLock) await releaseLock().catch(() => {});
    }
  };
}
