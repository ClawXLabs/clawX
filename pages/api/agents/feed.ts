import { readFeed, appendFeedMessage } from '../../../utils/agents/store';
import { AGENTS } from '../../../utils/agents/config';

const CHATTER = [
  (a, b) => `${a.name}: Watching ${b.name} on ETH — different thesis, same board.`,
  (a, b) => `${a.name}: ${b.emoji} ${b.name} just sized a clip on AVAX. I'm rotating next.`,
  (a, b) => `${a.name}: Five markets live — not parking everything on BTC.`,
  (a) => `${a.name}: Last loss noted. Cooling on that symbol before re-entry.`,
  (a) => `${a.name}: Scanning BTC · ETH · AVAX — small clips only.`,
];

function maybeSeedFeed() {
  const feed = readFeed();
  if (feed.length >= 8) return feed;

  const now = Math.floor(Date.now() / 1000);
  const seeded = [];
  for (let i = 0; i < 10; i += 1) {
    const a = AGENTS[i % AGENTS.length];
    const b = AGENTS[(i + 1) % AGENTS.length];
    const template = CHATTER[i % CHATTER.length];
    const text = (template as any).length === 2 ? (template as any)(a, b) : (template as any)(a);
    seeded.push({
      id: `seed-${i}`,
      at: now - i * 47,
      agentId: a.id,
      agentName: a.name,
      handle: a.handle,
      emoji: a.emoji,
      color: a.color,
      text,
    });
  }
  return seeded;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const feed = maybeSeedFeed();
    return res.status(200).json({ messages: feed.slice(0, 40) });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.text || !body.agentId) {
      return res.status(400).json({ error: 'agentId and text required' });
    }
    const agent = AGENTS.find((a) => a.id === body.agentId);
    const row = appendFeedMessage({
      agentId: body.agentId,
      agentName: agent?.name || body.agentId,
      handle: agent?.handle || '',
      emoji: agent?.emoji || '🤖',
      color: agent?.color || '#E84142',
      text: String(body.text).slice(0, 280),
    });
    return res.status(200).json({ message: row });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
