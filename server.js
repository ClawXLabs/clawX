const http = require('http');
const next = require('next');
const Redis = require('ioredis');
const { WebSocketServer, WebSocket } = require('ws');
require('dotenv').config();

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || '0.0.0.0';
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function main() {
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required for the WebSocket gateway');
  await app.prepare();

  const server = http.createServer((req, res) => handle(req, res));
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const redisOptions = {
    maxRetriesPerRequest: 3,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  };
  const cache = new Redis(process.env.REDIS_URL, redisOptions);
  const subscriber = new Redis(process.env.REDIS_URL, redisOptions);

  function broadcast(payload) {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  await subscriber.subscribe('prices:live', 'feed:messages');
  await subscriber.psubscribe('agent:*:update');
  subscriber.on('message', (_channel, message) => broadcast(message));
  subscriber.on('pmessage', (_pattern, _channel, message) => broadcast(message));

  // Next dev mode uses its own WebSocket (/_next/webpack-hmr) for hot reload —
  // pass any non-/ws upgrade through to Next instead of destroying it.
  const nextUpgrade = typeof app.getUpgradeHandler === 'function' ? app.getUpgradeHandler() : null;

  server.on('upgrade', (request, socket, head) => {
    let pathname;
    try {
      pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
      return;
    }
    if (nextUpgrade) {
      nextUpgrade(request, socket, head);
      return;
    }
    socket.destroy();
  });

  wss.on('connection', async (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    try {
      const keys = await cache.keys('price:*');
      if (keys.length) {
        const values = await cache.mget(keys);
        const data = {};
        keys.forEach((key, index) => {
          if (values[index]) data[key.slice('price:'.length)] = JSON.parse(values[index]);
        });
        ws.send(JSON.stringify({ type: 'prices', data, snapshot: true, updatedAt: Math.floor(Date.now() / 1_000) }));
      }
    } catch (error) {
      console.error('[ws] Initial snapshot failed:', error.message);
    }
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000);

  const shutdown = async () => {
    clearInterval(heartbeat);
    for (const client of wss.clients) client.close(1001, 'Server shutting down');
    await Promise.allSettled([subscriber.quit(), cache.quit()]);
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(port, hostname, () => {
    console.log(`[web] http://${hostname}:${port} · WebSocket /ws`);
  });
}

main().catch((error) => {
  console.error('[web] Fatal:', error);
  process.exit(1);
});
