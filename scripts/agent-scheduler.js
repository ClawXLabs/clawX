const { Queue } = require('bullmq');
const { QUEUE_NAME, createQueueConnection } = require('./lib/agent-queue');
require('dotenv').config();

const TICK_MS = Math.max(5_000, Number(process.env.AGENT_SCHEDULER_INTERVAL_MS || 10_000));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const connection = createQueueConnection();
  const queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 2_000 },
    },
  });
  const { readEnrollments } = await import('../utils/agents/store.js');
  const { refreshMarketSnapshot } = await import('../utils/agents/marketSnapshot.js');

  let stopping = false;
  const shutdown = async () => {
    stopping = true;
    await queue.close();
    await connection.quit();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`[agent-scheduler] queue=${QUEUE_NAME} interval=${TICK_MS}ms`);
  while (!stopping) {
    const started = Date.now();
    try {
      await refreshMarketSnapshot({ ttlSec: Math.ceil(TICK_MS / 1000) + 2 });
      const enrollments = await readEnrollments();
      const active = Object.values(enrollments).filter((row) => row.status === 'active');
      const bucket = Math.floor(Date.now() / TICK_MS);
      await Promise.all(
        active.map((row) =>
          queue.add(
            'tick',
            { wallet: row.wallet },
            { jobId: `${row.wallet.toLowerCase()}-${bucket}` }
          )
        )
      );
      if (active.length) console.log(`[agent-scheduler] Enqueued ${active.length} wallet(s)`);
    } catch (error) {
      console.error('[agent-scheduler] Tick failed:', error.message || error);
    }
    await sleep(Math.max(0, TICK_MS - (Date.now() - started)));
  }
}

main().catch((error) => {
  console.error('[agent-scheduler] Fatal:', error.message || error);
  process.exit(1);
});
