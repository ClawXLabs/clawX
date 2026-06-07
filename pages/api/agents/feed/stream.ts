import type { NextApiRequest, NextApiResponse } from 'next';
import { readFeed } from '../../../../utils/agents/store';
import { filterFeedMessages } from '../../../../utils/agents/feedFilter';
import { subscribeFeedStream } from '../../../../utils/agents/feedBroadcast';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const feed = filterFeedMessages(readFeed());
  subscribeFeedStream(res, feed);
}

export const config = {
  api: {
    responseLimit: false,
  },
};
