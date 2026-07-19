import Redis from 'ioredis';

const globalForRedis = globalThis;

function createRedisClient() {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is required for Redis');
  }

  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  });

  client.on('error', (error) => {
    console.error('[redis] Client error:', error.message);
  });

  return client;
}

export function getRedis() {
  if (!globalForRedis.__clawxRedis) {
    globalForRedis.__clawxRedis = createRedisClient();
  }
  return globalForRedis.__clawxRedis;
}

export function createRedisSubscriber() {
  return getRedis().duplicate();
}

export async function closeRedis() {
  if (globalForRedis.__clawxRedis) {
    await globalForRedis.__clawxRedis.quit();
    delete globalForRedis.__clawxRedis;
  }
}
