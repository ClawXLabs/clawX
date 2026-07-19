import { AGENTS } from '../../../utils/agents/config';
import { getEnrollment, getFullProfile } from '../../../utils/agents/store';
import { buildAgentBreakdown, buildXp } from '../../../utils/agents/xp';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wallet = req.query.wallet;
  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ error: 'Invalid wallet' });
  }

  const [enrollment, profile] = await Promise.all([
    getEnrollment(wallet),
    getFullProfile(wallet),
  ]);
  const socialLinks = profile?.socialLinks || {};

  const breakdown = buildAgentBreakdown(enrollment, AGENTS);
  const xp = buildXp(enrollment, socialLinks);

  return res.status(200).json({
    hasAgent: !!enrollment,
    ...breakdown,
    xp,
  });
}
