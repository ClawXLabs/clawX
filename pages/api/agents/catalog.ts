import { buildAgentCatalog } from '../../../utils/agents/stats';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const agents = await buildAgentCatalog();
    return res.status(200).json({
      updatedAt: Math.floor(Date.now() / 1000),
      agents,
    });
  } catch (error) {
    console.error('Agent catalog failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to load agents' });
  }
}
