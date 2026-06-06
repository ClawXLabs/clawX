const { ethers } = require('ethers');
require('dotenv').config();

const POLL_MS = Number(process.env.AGENT_RUNNER_POLL_MS || 8000);
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
      if (round.resolved || endTime <= now + 40) return null;
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
  const log = enrollment.tradeLog || [];
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
      if (agent) {
        memory = libs.ai.journalOutcome(memory, agent, item.symbol, item.isUp, round.upWins);
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
  const { readEnrollments, setEnrollment } = libs.store;
  const { decideNextTrade, recordTradePlanned, createAgentMemory } = libs.brain;
  const { readOpenPositions } = libs.stats;

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
    try {
      enrollment = await syncLessons(contract, enrollment, libs);
      const open = await readOpenPositions(provider, wallet, contractAddress);
      const memory = enrollment.agentMemory || createAgentMemory(enrollment.agentId);
      const { memory: nextMemory, decision } = await decideNextTrade(
        { ...enrollment, agentMemory: memory },
        assets,
        open
      );

      let row = { ...enrollment, agentMemory: nextMemory };
      if (!decision) {
        setEnrollment(wallet, row);
        continue;
      }

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
        },
      ].slice(-20);
      setEnrollment(wallet, row);
      console.log(`[agent-runner] Tx ${result.hash}`);
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
