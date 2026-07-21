const { ethers } = require('ethers');

const ASSET_CONFIG = {
  AVAX: { binance: 'AVAXUSDT', coinbase: 'AVAX-USD', gate: 'AVAX_USDT' },
  BNB: { binance: 'BNBUSDT', coinbase: null, gate: 'BNB_USDT' },
  BTC: { binance: 'BTCUSDT', coinbase: 'BTC-USD', gate: 'BTC_USDT' },
  ETH: { binance: 'ETHUSDT', coinbase: 'ETH-USD', gate: 'ETH_USDT' },
  NEAR: { binance: 'NEARUSDT', coinbase: 'NEAR-USD', gate: 'NEAR_USDT' },
};

const REQUEST_TIMEOUT_MS = 2500;
/** Gate.io often 403s by region — fail fast so ticks aren't blocked. */
const GATE_TIMEOUT_MS = 900;
/** Short TTL so settlement + chart can reuse a fresh median without re-hitting CEX APIs. */
const PRICE_CACHE_MS = 30000;
const priceCache = new Map();

function cacheKey(symbol) {
  return symbol;
}

function toPrice8(price) {
  const [whole, fraction = ''] = String(price).split('.');
  const normalized = `${whole}.${fraction.padEnd(8, '0').slice(0, 8)}`;
  return ethers.parseUnits(normalized, 8);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

async function fetchJson(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { 
        accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function trySource(name, fn) {
  try {
    const price = Number(await fn());
    if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid price');
    return { name, price };
  } catch (error) {
    return { name, error: error.message || String(error) };
  }
}

function buildPricePayload(symbol, results) {
  const successful = results.filter((result) => result.price);
  if (successful.length === 0) {
    throw new Error(`No price sources available for ${symbol}`);
  }
  const price = median(successful.map((result) => result.price));
  return {
    symbol,
    price,
    price8: toPrice8(price),
    sources: results,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

async function fetchFastPrice(symbol, options = {}) {
  const timeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  const key = cacheKey(symbol);
  const cached = priceCache.get(key);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const config = ASSET_CONFIG[symbol];
  if (!config) throw new Error(`Unsupported asset ${symbol}`);

  const sources = [
    trySource('binance', async () => {
      const data = await fetchJson(
        `https://api.binance.com/api/v3/ticker/price?symbol=${config.binance}`,
        timeoutMs
      );
      return data.price;
    }),
    trySource('gate', async () => {
      const data = await fetchJson(
        `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${config.gate}`,
        GATE_TIMEOUT_MS
      );
      return Array.isArray(data) ? data[0]?.last : data.last;
    }),
  ];

  if (config.coinbase) {
    sources.push(
      trySource('coinbase', async () => {
        const data = await fetchJson(
          `https://api.exchange.coinbase.com/products/${config.coinbase}/ticker`,
          timeoutMs
        );
        return data.price;
      })
    );
  }

  let payload;
  if (options.settleQuick) {
    payload = await new Promise((resolve, reject) => {
      const results = new Array(sources.length);
      let settled = 0;
      let finished = false;
      const finish = () => {
        if (finished) return;
        try {
          finished = true;
          resolve(buildPricePayload(symbol, results.filter(Boolean)));
        } catch (error) {
          reject(error);
        }
      };
      sources.forEach((source, index) => {
        source.then((row) => {
          results[index] = row;
          settled += 1;
          const ok = results.filter((r) => r && r.price);
          if (ok.length >= 1) finish();
          else if (settled === sources.length) finish();
        });
      });
      setTimeout(() => {
        if (!finished) finish();
      }, timeoutMs);
    });
  } else {
    const results = await Promise.all(sources);
    payload = buildPricePayload(symbol, results);
  }

  const cacheMs = options.cacheMs ?? PRICE_CACHE_MS;
  if (cacheMs > 0) {
    priceCache.set(key, { data: payload, expiresAt: Date.now() + cacheMs });
  }
  return payload;
}

async function fetchFastPrices(symbols = Object.keys(ASSET_CONFIG), options = {}) {
  const prices = await Promise.all(symbols.map((symbol) => fetchFastPrice(symbol, options)));
  return prices.reduce((acc, price) => {
    acc[price.symbol] = price;
    return acc;
  }, {});
}

module.exports = {
  ASSET_CONFIG,
  fetchFastPrice,
  fetchFastPrices,
  toPrice8,
};
