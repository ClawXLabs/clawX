import type { NextApiRequest, NextApiResponse } from 'next';
import { getPlatformConfig } from '../../utils/platformConfig';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');

  const cfg = await getPlatformConfig();
  const announcement = String(cfg.announcement || '').trim();
  const hasPublishedAnnouncement = Boolean(cfg.announcement_published_at && announcement);

  return res.status(200).json({
    ok: true,
    agentsPaused: Boolean(cfg.agents_paused),
    tradingPaused: Boolean(cfg.trading_paused),
    claimsPaused: Boolean(cfg.claims_paused),
    faucetPaused: Boolean(cfg.faucet_paused),
    announcement: hasPublishedAnnouncement || cfg.agents_paused ? announcement : '',
    maintenanceMessage: String(cfg.maintenance_message || '').trim(),
    updatedAt: cfg.updated_at || null,
  });
}
