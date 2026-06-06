import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchFastPrices } from '../../utils/fastPrice';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const requestedSymbols = typeof req.query.symbols === 'string'
      ? req.query.symbols.split(',').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)
      : undefined;
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
    console.error('Fast price fetch failed:', error);
    return res.status(500).json({
      error: error.message || 'Fast price fetch failed',
    });
  }
}
