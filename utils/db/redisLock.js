import { randomUUID } from 'crypto';
import { getRedis } from './redis.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireRedisLock(key, { ttlMs = 120_000, waitMs = 15_000 } = {}) {
  // UI-only dev mode has no Redis and runs a single process — no lock needed.
  if (process.env.CLAWX_UI_ONLY === '1') {
    return async () => {};
  }
  const redis = getRedis();
  const token = randomUUID();
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const acquired = await redis.set(key, token, 'PX', ttlMs, 'NX');
    if (acquired === 'OK') {
      return async () => {
        await redis.eval(
          `if redis.call("get", KEYS[1]) == ARGV[1]
           then return redis.call("del", KEYS[1])
           else return 0 end`,
          1,
          key,
          token
        );
      };
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for distributed lock ${key}`);
}
