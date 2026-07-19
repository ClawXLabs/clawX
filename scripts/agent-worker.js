const { Worker } = require('bullmq');
const { QUEUE_NAME, createQueueConnection } = require('./lib/agent-queue');
require('dotenv').config();

async function main() {
  const connection = createQueueConnection();
  const publisher = createQueueConnection();
  const { createAgentTickProcessor } = await import('../utils/agents/tickProcessor.js');
  const processAgentTick = createAgentTickProcessor();
  const concurrency = Math.max(1, Number(process.env.AGENT_WORKER_CONCURRENCY || 5));

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const result = await processAgentTick(job.data.wallet);
      await publisher.publish(
        `agent:${job.data.wallet.toLowerCase()}:update`,
        JSON.stringify({
          type: 'agent_update',
          wallet: job.data.wallet.toLowerCase(),
          data: result,
          updatedAt: Math.floor(Date.now() / 1_000),
        })
      );
      return result;
    },
    { connection, concurrency }
  );

  worker.on('completed', (job, result) => {
    console.log(`[agent-worker] ${job.data.wallet.slice(0, 10)}…`, result);
  });
  worker.on('failed', (job, error) => {
    console.error(`[agent-worker] ${job?.data?.wallet || 'unknown'} failed:`, error.message);
  });
  worker.on('error', (error) => console.error('[agent-worker] Worker error:', error));

  const shutdown = async () => {
    await worker.close();
    await Promise.allSettled([connection.quit(), publisher.quit()]);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  console.log(`[agent-worker] queue=${QUEUE_NAME} concurrency=${concurrency}`);
}

main().catch((error) => {
  console.error('[agent-worker] Fatal:', error.message || error);
  process.exit(1);
});
