import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Lightweight liveness for ALB / ECS health checks.
 * Does not touch Postgres or Redis so a cold DB cannot flap the target group.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    ok: true,
    service: 'clawx-web',
    ts: Date.now(),
  });
}
