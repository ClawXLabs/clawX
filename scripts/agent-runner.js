/**
 * Compatibility shim for local/dev.
 * Prefer `npm run agent-scheduler` + `npm run agent-worker` in production.
 */
require('dotenv').config();

const POLL_MS = Number(process.env.AGENT_RUNNER_POLL_MS || 4000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { createAgentTickProcessor } = await import('../utils/agents/tickProcessor.js');
  const { readEnrollments } = await import('../utils/agents/store.js');
  const { refreshMarketSnapshot } = await import('../utils/agents/marketSnapshot.js');
  const processAgentTick = createAgentTickProcessor();

  console.log(`[agent-runner] Compatibility mode · poll ${POLL_MS}ms · prefer scheduler+worker`);
  for (;;) {
    try {
      await refreshMarketSnapshot();
      const enrollments = await readEnrollments();
      const active = Object.values(enrollments).filter((row) => row.status === 'active');
      if (!active.length) {
        console.log('[agent-runner] No active enrollments');
      } else {
        for (const row of active) {
          try {
            const result = await processAgentTick(row.wallet);
            console.log(`[agent-runner] ${row.wallet.slice(0, 10)}…`, result);
          } catch (error) {
            console.error(`[agent-runner] ${row.wallet}:`, error.message || error);
          }
        }
      }
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
