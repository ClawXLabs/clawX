const { Pool } = require('pg');
const Redis = require('ioredis');
const { ASSET_CONFIG, fetchFastPrices } = require('../utils/fastPrice');
require('dotenv').config();

const POLL_MS = Math.max(1_000, Number(process.env.PRICE_FETCH_INTERVAL_MS || 3_000));
const INTERVALS = [
  ['1m', 60],
  ['5m', 300],
  ['15m', 900],
  ['1h', 3_600],
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bucketTime(epochSec, intervalSec) {
  return new Date(Math.floor(epochSec / intervalSec) * intervalSec * 1_000);
}

function serializablePrices(prices) {
  return Object.fromEntries(
    Object.entries(prices).map(([symbol, tick]) => [
      symbol,
      {
        symbol,
        price: tick.price,
        price8: tick.price8.toString(),
        sources: tick.sources,
        updatedAt: tick.updatedAt,
      },
    ])
  );
}

async function upsertCandles(pool, prices) {
  const values = [];
  const params = [];
  let index = 1;
  for (const [symbol, tick] of Object.entries(prices)) {
    for (const [interval, seconds] of INTERVALS) {
      values.push(`($${index++},$${index++},$${index++},$${index++},$${index++},$${index++},$${index++})`);
      params.push(
        symbol,
        interval,
        bucketTime(tick.updatedAt, seconds),
        tick.price,
        tick.price,
        tick.price,
        tick.price
      );
    }
  }
  if (!values.length) return;
  await pool.query(
    `INSERT INTO price_candles (symbol, interval, open_time, open, high, low, close)
     VALUES ${values.join(',')}
     ON CONFLICT (symbol, interval, open_time) DO UPDATE SET
       high = GREATEST(price_candles.high, EXCLUDED.high),
       low = LEAST(price_candles.low, EXCLUDED.low),
       close = EXCLUDED.close`,
    params
  );
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false,
  });
  const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  });
  const symbols = Object.keys(ASSET_CONFIG);

  const shutdown = async () => {
    await Promise.allSettled([redis.quit(), pool.end()]);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`[price-fetcher] ${symbols.join(', ')} every ${POLL_MS}ms`);
  for (;;) {
    const started = Date.now();
    try {
      const prices = await fetchFastPrices(symbols, {
        forceRefresh: true,
        cacheMs: Math.max(500, POLL_MS - 250),
      });
      const payload = {
        type: 'prices',
        data: serializablePrices(prices),
        updatedAt: Math.floor(Date.now() / 1_000),
      };
      await Promise.all([
        upsertCandles(pool, prices),
        ...Object.entries(payload.data).map(([symbol, tick]) =>
          redis.set(`price:${symbol}`, JSON.stringify(tick), 'EX', 10)
        ),
        redis.publish('prices:live', JSON.stringify(payload)),
      ]);
    } catch (error) {
      console.error('[price-fetcher] Tick failed:', error.message || error);
    }
    await sleep(Math.max(0, POLL_MS - (Date.now() - started)));
  }
}

main().catch((error) => {
  console.error('[price-fetcher] Fatal:', error.message || error);
  process.exit(1);
});
