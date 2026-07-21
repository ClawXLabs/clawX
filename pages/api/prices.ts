import type { NextApiRequest, NextApiResponse } from 'next';
import { ASSET_CONFIG, fetchFastPrices } from '../../utils/fastPrice';
import { readCachedPrices } from '../../utils/prices/redisPrices';

/* Fallback prices used when all CEX sources are unreachable (e.g. local dev, network issues).
   Keep these close to recent spot so a degraded mode doesn't look "broken" vs live markets. */
const FALLBACK_PRICES: Record<string, number> = {
  AVAX: 6.5,
  BNB: 570,
  BTC: 65000,
  ETH: 1900,
  NEAR: 2.0,
};

function serializePrices(prices: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(prices).map(([symbol, price]) => [
      symbol,
      {
        price: price.price,
        price8: price.price8?.toString?.() ?? String(price.price8),
        updatedAt: price.updatedAt,
        sources: price.sources,
      },
    ])
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const requestedSymbols = typeof req.query.symbols === 'string'
    ? req.query.symbols.split(',').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)
    : Object.keys(ASSET_CONFIG);

  try {
    const cached = await readCachedPrices(requestedSymbols);
    const missing = requestedSymbols.filter((symbol) => !cached[symbol]);
    let prices = { ...cached };
    if (missing.length) {
      Object.assign(prices, await fetchFastPrices(missing));
    }

    return res.status(200).json({
      updatedAt: Math.floor(Date.now() / 1000),
      source: missing.length ? (Object.keys(cached).length ? 'mixed' : 'live') : 'redis',
      prices: serializePrices(prices),
    });
  } catch (error: any) {
    console.error('Fast price fetch failed, using fallback prices:', error.message);

    const symbols = requestedSymbols || Object.keys(FALLBACK_PRICES);
    const fallbackEntries = symbols
      .filter((s) => s in FALLBACK_PRICES)
      .map((symbol) => [
        symbol,
        {
          price: FALLBACK_PRICES[symbol],
          price8: String(Math.round(FALLBACK_PRICES[symbol] * 1e8)),
          updatedAt: Math.floor(Date.now() / 1000),
          sources: [{ name: 'fallback', price: FALLBACK_PRICES[symbol] }],
        },
      ]);

    return res.status(200).json({
      updatedAt: Math.floor(Date.now() / 1000),
      fallback: true,
      prices: Object.fromEntries(fallbackEntries),
    });
  }
}
