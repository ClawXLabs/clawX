const Redis = require('ioredis');

const QUEUE_NAME = process.env.AGENT_QUEUE_NAME || 'agent-tick';

function createQueueConnection() {
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required');
  return new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  });
}

module.exports = { QUEUE_NAME, createQueueConnection };
