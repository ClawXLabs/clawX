import { getRedis } from '../db/redis.js';

export async function readCachedPrices(symbols) {
  if (!process.env.REDIS_URL || !symbols?.length) return {};
  try {
    const redis = getRedis();
    if (redis.status !== 'ready') await redis.connect().catch(() => {});
    const values = await redis.mget(...symbols.map((symbol) => `price:${symbol}`));
    const out = {};
    values.forEach((raw, index) => {
      if (!raw) return;
      try {
        const tick = JSON.parse(raw);
        if (!tick?.price8 || !Number.isFinite(Number(tick.updatedAt))) return;
        if (Date.now() / 1000 - Number(tick.updatedAt) > 10) return;
        out[symbols[index]] = tick;
      } catch {
        // Ignore malformed cache entries.
      }
    });
    return out;
  } catch {
    return {};
  }
}
