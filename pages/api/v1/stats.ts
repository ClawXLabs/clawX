import type { NextApiRequest, NextApiResponse } from 'next';
import { query } from '../../../utils/db/postgres';

/**
 * Public Open API — aggregate platform stats (no PII).
 *
 * GET /api/v1/stats
 *
 * Optional auth: if OPEN_STATS_API_KEY is set, require
 *   Authorization: Bearer <key>  OR  X-Api-Key: <key>
 */
function authorize(req: NextApiRequest): boolean {
  const expected = (process.env.OPEN_STATS_API_KEY || '').trim();
  if (!expected) return true;
  const bearer = String(req.headers.authorization || '');
  const headerKey = String(req.headers['x-api-key'] || '');
  if (headerKey && headerKey === expected) return true;
  if (bearer.toLowerCase().startsWith('bearer ') && bearer.slice(7).trim() === expected) {
    return true;
  }
  return false;
}

function setCors(res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!authorize(req)) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }

  try {
    const [tradeStats, walletStats, agentStats, faucetStats, activity] = await Promise.all([
      query(`
        SELECT
          COUNT(*)::int AS total_transactions,
          COUNT(*) FILTER (WHERE action = 'BUY')::int AS buy_count,
          COUNT(*) FILTER (WHERE action = 'SELL')::int AS sell_count,
          COALESCE(SUM(amount_tusdc), 0)::text AS total_volume_tusdc,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS transactions_24h,
          COALESCE(SUM(amount_tusdc) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0)::text AS volume_24h_tusdc,
          COUNT(DISTINCT wallet)::int AS trading_wallets,
          MIN(created_at) AS first_trade_at,
          MAX(created_at) AS last_trade_at
        FROM trade_log
      `),
      query(`
        SELECT
          (SELECT COUNT(*)::int FROM enrollments) AS enrolled_wallets,
          (SELECT COUNT(*)::int FROM wallet_profiles) AS profile_wallets,
          (SELECT COUNT(*)::int FROM (
             SELECT LOWER(wallet) AS w FROM enrollments
             UNION
             SELECT LOWER(wallet) FROM wallet_profiles
             UNION
             SELECT LOWER(wallet) FROM trade_log
           ) u) AS total_wallets
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active' AND paused = false)::int AS active_agents,
          COUNT(*) FILTER (WHERE status = 'active' AND paused = true)::int AS paused_agents,
          COUNT(*) FILTER (WHERE status = 'retired')::int AS retired_agents,
          COUNT(*)::int AS total_enrollments
        FROM enrollments
      `),
      query(`
        SELECT
          COALESCE(SUM(claim_count), 0)::int AS faucet_claims,
          COUNT(*)::int AS faucet_wallets
        FROM faucet_claims
      `).catch(() => ({
        rows: [{ faucet_claims: 0, faucet_wallets: 0 }],
      })),
      query(`
        SELECT
          COALESCE(NULLIF(UPPER(symbol), ''), 'UNKNOWN') AS symbol,
          COUNT(*)::int AS trades,
          COALESCE(SUM(amount_tusdc), 0)::text AS volume_tusdc
        FROM trade_log
        GROUP BY 1
        ORDER BY trades DESC
        LIMIT 20
      `),
    ]);

    const t = tradeStats.rows[0] || ({} as any);
    const w = walletStats.rows[0] || ({} as any);
    const a = agentStats.rows[0] || ({} as any);
    const f = faucetStats.rows[0] || ({} as any);

    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      stats: {
        totalTransactions: t.total_transactions ?? 0,
        buyCount: t.buy_count ?? 0,
        sellCount: t.sell_count ?? 0,
        totalVolumeTusdc: Number(t.total_volume_tusdc || 0),
        transactions24h: t.transactions_24h ?? 0,
        volume24hTusdc: Number(t.volume_24h_tusdc || 0),
        tradingWallets: t.trading_wallets ?? 0,
        totalWallets: w.total_wallets ?? 0,
        enrolledWallets: w.enrolled_wallets ?? 0,
        profileWallets: w.profile_wallets ?? 0,
        activeAgents: a.active_agents ?? 0,
        pausedAgents: a.paused_agents ?? 0,
        retiredAgents: a.retired_agents ?? 0,
        totalEnrollments: a.total_enrollments ?? 0,
        faucetClaims: f.faucet_claims ?? 0,
        faucetWallets: f.faucet_wallets ?? 0,
        firstTradeAt: t.first_trade_at || null,
        lastTradeAt: t.last_trade_at || null,
      },
      bySymbol: activity.rows.map((row) => ({
        symbol: row.symbol,
        trades: row.trades,
        volumeTusdc: Number(row.volume_tusdc || 0),
      })),
    });
  } catch (err: any) {
    console.error('[api/v1/stats]', err?.message || err);
    return res.status(503).json({
      ok: false,
      error: 'Stats temporarily unavailable',
    });
  }
}
