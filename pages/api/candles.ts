import type { NextApiRequest, NextApiResponse } from 'next';
import { query } from '../../utils/db/postgres';

const INTERVALS = new Set(['1m', '5m', '15m', '1h']);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  const interval = String(req.query.interval || '1m');
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 120));
  if (!/^[A-Z0-9]{2,12}$/.test(symbol) || !INTERVALS.has(interval)) {
    return res.status(400).json({ error: 'Invalid symbol or interval' });
  }
  try {
    const result = await query(
      `SELECT symbol, interval, open_time, open, high, low, close, volume
       FROM price_candles
       WHERE symbol = $1 AND interval = $2
       ORDER BY open_time DESC
       LIMIT $3`,
      [symbol, interval, limit]
    );
    return res.status(200).json({
      candles: result.rows.reverse().map((row) => ({
        symbol: row.symbol,
        interval: row.interval,
        openTime: new Date(row.open_time).getTime(),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume),
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Could not load candles' });
  }
}
