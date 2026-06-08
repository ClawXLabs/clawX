const { ethers } = require('ethers');
require('dotenv').config();

const POLL_MS = Number(process.env.AGENT_RUNNER_POLL_MS || 4000);
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const RUNNER_SECRET = process.env.AGENT_RUNNER_SECRET || 'dev-agent-runner';

const CONTRACT_ABI = [
  'function getAssetCount() external view returns (uint256)',
  'function getAsset(uint256 assetId) external view returns (string memory symbol, address priceFeed, uint256 currentRoundId, bool enabled)',
  'function getRoundInfo(uint256 roundId) external view returns (uint256 assetId, string memory asset, uint256 roundNumber, uint256 startTime, uint256 endTime, uint256 startPrice, uint256 endPrice, bool resolved, bool upWins, uint256 upPool, uint256 downPool, uint256 upShares, uint256 downShares, uint256 collateralPool, uint256 currentPrice, address priceFeed)',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadModules() {
  const store = await import('../utils/agents/store.js');
  const brain = await import('../utils/agents/brain.js');
  const ai = await import('../utils/agents/aiReason.js');
  const stats = await import('../utils/agents/stats.js');
  return { store, brain, ai, stats };
}

async function loadAssets(contract) {
  const count = Number(await contract.getAssetCount());
  const rows = await Promise.all(
    Array.from({ length: count }, async (_, assetId) => {
      const asset = await contract.getAsset(assetId);
      if (!asset.enabled) return null;
      const roundId = Number(asset.currentRoundId);
      if (roundId === 0) return null;
      const round = await contract.getRoundInfo(roundId);
      const now = Math.floor(Date.now() / 1000);
      const endTime = Number(round.endTime);
      if (round.resolved || endTime <= now + 25) return null;
      return {
        assetId,
        symbol: String(asset.symbol).trim(),
        roundId,
        round: {
          assetId,
          startPrice: round.startPrice,
          currentPrice: round.currentPrice,
          upPool: round.upPool,
          downPool: round.downPool,
          endTime,
          upWins: round.upWins,
          resolved: round.resolved,
        },
      };
    })
  );
  return rows.filter(Boolean);
}

async function syncLessons(contract, enrollment, libs) {
  const pending = enrollment.pendingOutcomes || [];
  if (!pending.length) return enrollment;

  let memory = enrollment.agentMemory || libs.brain.createAgentMemory(enrollment.agentId);
  const stillPending = [];

  for (const item of pending) {
    try {
      const round = await contract.getRoundInfo(item.roundId);
      if (!round.resolved) {
        stillPending.push(item);
        continue;
      }
      const { getAgentById } = await import('../utils/agents/config.js');
      const agent = getAgentById(enrollment.agentId);
      const won = (item.isUp && round.upWins) || (!item.isUp && !round.upWins);
      const side = item.isUp ? 'UP' : 'DOWN';
      const { updateTradeLogOutcome } = libs.store;
      updateTradeLogOutcome(enrollment.wallet, item.roundId, side, won ? 'win' : 'loss', {
        settledAt: Math.floor(Date.now() / 1000),
        outcomeNote: won ? 'Round settled — position won' : 'Round settled — position lost',
      });
      if (agent) {
        memory = libs.ai.journalOutcome(memory, agent, item.symbol, item.isUp, round.upWins);
        const { outcomeJournalText, pickPeerAgent, peerOutcomeReaction } = await import('../utils/agents/chatter.js');
        const { appendFeedMessage, getDisplayName } = libs.store;
        const pilotName = getDisplayName(enrollment.wallet);
        appendFeedMessage({
          agentId: agent.id,
          agentName: agent.name,
          handle: agent.handle,
          emoji: agent.emoji,
          color: agent.color,
          text: outcomeJournalText(agent, item.symbol, item.isUp, won),
          pilotWallet: enrollment.wallet,
          pilotName: pilotName || undefined,
          kind: won ? 'win' : 'loss',
        });
      } else {
        memory = libs.brain.learnFromOutcome(memory, item.symbol, item.isUp, round.upWins);
      }
    } catch {
      stillPending.push(item);
    }
  }

  return { ...enrollment, agentMemory: memory, pendingOutcomes: stillPending };
}

async function executeTrade(wallet, roundId, isUp, symbol, thought) {
  const res = await fetch(`${APP_URL}/api/agents/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-runner-secret': RUNNER_SECRET,
    },
    body: JSON.stringify({ wallet, roundId, isUp, symbol, thought }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Execute failed (${res.status})`);
  }
  return data;
}

async function tick(contract, contractAddress, provider, libs) {
  const { setEnrollment, getEnrollment } = libs.store;
  const { decideNextTrade, recordTradePlanned, createAgentMemory } = libs.brain;
  const { readOpenPositions } = libs.stats;
  const { readEnrollments } = libs.store;

  const enrollments = readEnrollments();
  const active = Object.values(enrollments).filter((row) => row.status === 'active');
  if (active.length === 0) {
    console.log('[agent-runner] No active enrollments');
    return;
  }

  const assets = await loadAssets(contract);
  if (assets.length === 0) {
    console.log('[agent-runner] No open rounds');
    return;
  }

  for (let enrollment of active) {
    const wallet = enrollment.wallet;
    if (enrollment.paused) {
      try {
        enrollment = await syncLessons(contract, enrollment, libs);
        libs.store.setEnrollment(wallet, enrollment);
      } catch (error) {
        console.error(`[agent-runner] ${wallet} (paused):`, error.message || error);
      }
      continue;
    }
    try {
      enrollment = await syncLessons(contract, enrollment, libs);
      const { getAgentById, getTradesPerTick } = await import('../utils/agents/config.js');
      const agent = getAgentById(enrollment.agentId);
      const maxTrades = getTradesPerTick(agent);

      let row = { ...enrollment };
      let tradesDone = 0;

      for (let attempt = 0; attempt < maxTrades; attempt += 1) {
        const open = await readOpenPositions(provider, wallet, contractAddress);
        const memory = row.agentMemory || createAgentMemory(enrollment.agentId);
        const { memory: nextMemory, decision } = await decideNextTrade(
          { ...row, agentMemory: memory },
          assets,
          open
        );

        row = { ...row, agentMemory: nextMemory };
        if (!decision) break;

        console.log(
          `[agent-runner] ${wallet.slice(0, 8)}… ${enrollment.agentId} → ${decision.symbol} ${decision.isUp ? 'UP' : 'DOWN'}`
        );
        const result = await executeTrade(wallet, decision.roundId, decision.isUp, decision.symbol, decision.thought);
        row.agentMemory = recordTradePlanned(nextMemory, decision.symbol);
        row.pendingOutcomes = [
          ...(row.pendingOutcomes || []),
          {
            roundId: decision.roundId,
            symbol: decision.symbol,
            isUp: decision.isUp,
            at: Math.floor(Date.now() / 1000),
            hash: result.hash || '',
          },
        ].slice(-20);
        const fresh = getEnrollment(wallet);
        setEnrollment(wallet, {
          ...(fresh || row),
          agentMemory: row.agentMemory,
          pendingOutcomes: row.pendingOutcomes,
          lastTradeAt: Math.floor(Date.now() / 1000),
        });
        tradesDone += 1;
        console.log(`[agent-runner] Tx ${result.hash}`);
      }

      if (tradesDone === 0) {
        setEnrollment(wallet, row);
      }
    } catch (error) {
      console.error(`[agent-runner] ${wallet}:`, error.message || error);
    }
  }
}

async function main() {
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const rpcUrl = process.env.FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';
  if (!contractAddress) {
    throw new Error('NEXT_PUBLIC_CONTRACT_ADDRESS is required');
  }

  const libs = await loadModules();
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);

  console.log(`[agent-runner] Fast mode · ${APP_URL} · poll ${POLL_MS}ms · all markets`);
  for (;;) {
    try {
      await tick(contract, contractAddress, provider, libs);
    } catch (error) {
      console.error('[agent-runner] tick error:', error.message || error);
    }
    await sleep(POLL_MS);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
