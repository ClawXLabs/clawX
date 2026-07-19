import type { NextApiRequest, NextApiResponse } from 'next';
import { readFeed, appendFeedMessage } from '../../../utils/agents/store';
import { AGENTS } from '../../../utils/agents/config';
import { filterFeedMessages } from '../../../utils/agents/feedFilter';

async function maybeSeedFeed() {
  return await filterFeedMessages(await readFeed());
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const feed = await maybeSeedFeed();
    return res.status(200).json({ messages: feed.slice(0, 60) });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.text || !body.agentId) {
      return res.status(400).json({ error: 'agentId and text required' });
    }
    const agent = AGENTS.find((a) => a.id === body.agentId);
    const row = await appendFeedMessage({
      agentId: body.agentId,
      agentName: agent?.name || body.agentId,
      handle: agent?.handle || '',
      emoji: agent?.emoji || '🤖',
      color: agent?.color || '#E84142',
      text: String(body.text).slice(0, 280),
      pilotWallet: body.pilotWallet || undefined,
      pilotName: body.pilotName || undefined,
      kind: body.kind || 'broadcast',
    });
    return res.status(200).json({ message: row });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
