import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchFastPrices } from '../../utils/fastPrice';

/* Fallback prices used when all CEX sources are unreachable (e.g. local dev, network issues) */
const FALLBACK_PRICES: Record<string, number> = {
  AVAX: 25.0,
  BNB: 600.0,
  BTC: 65000.0,
  ETH: 3500.0,
  NEAR: 7.0,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const requestedSymbols = typeof req.query.symbols === 'string'
    ? req.query.symbols.split(',').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)
    : undefined;

  try {
    const prices = await fetchFastPrices(requestedSymbols);

    return res.status(200).json({
      updatedAt: Math.floor(Date.now() / 1000),
      prices: Object.fromEntries(
        Object.entries(prices).map(([symbol, price]: [string, any]) => [
          symbol,
          {
            price: price.price,
            price8: price.price8.toString(),
            updatedAt: price.updatedAt,
            sources: price.sources,
          },
        ])
      ),
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
