import { readFeed } from './store.js';
import { filterFeedMessages } from './feedFilter.js';

/** @typedef {{ res: import('http').ServerResponse, alive: boolean }} FeedClient */

/** @type {Set<FeedClient>} */
const clients = new Set();
const seenIds = new Set();
let watcherStarted = false;

function sseWrite(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function publishFeedMessage(message) {
  if (!message?.id) return;
  seenIds.add(message.id);
  const payload = { type: 'message', message };
  for (const client of clients) {
    if (!client.alive) continue;
    try {
      sseWrite(client.res, payload);
    } catch {
      client.alive = false;
      clients.delete(client);
    }
  }
}

export function subscribeFeedStream(res, initialMessages) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');

  const filtered = filterFeedMessages(initialMessages);
  filtered.forEach((m) => seenIds.add(m.id));
  sseWrite(res, { type: 'snapshot', messages: filtered });

  const client = { res, alive: true };
  clients.add(client);

  const heartbeat = setInterval(() => {
    if (!client.alive) return;
    try {
      res.write(': ping\n\n');
    } catch {
      client.alive = false;
      clients.delete(client);
      clearInterval(heartbeat);
    }
  }, 15000);

  res.on('close', () => {
    client.alive = false;
    clients.delete(client);
    clearInterval(heartbeat);
  });

  ensureFileWatcher();
  return client;
}

function ensureFileWatcher() {
  if (watcherStarted) return;
  watcherStarted = true;
  setInterval(() => {
    try {
      const feed = filterFeedMessages(readFeed());
      const fresh = feed.filter((m) => m.id && !seenIds.has(m.id));
      if (!fresh.length) return;
      fresh.reverse().forEach((m) => publishFeedMessage(m));
    } catch {
      /* ignore poll errors */
    }
  }, 900);
}
