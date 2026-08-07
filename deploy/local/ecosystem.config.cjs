/** PM2 apps sized for an 8GB local / visitor box.
 * From repo root:
 *   pm2 start deploy/local/ecosystem.config.cjs --only clawx-web,clawx-price-fetcher
 *   pm2 start deploy/local/ecosystem.config.cjs --only clawx-agent-scheduler,clawx-agent-worker
 *   pm2 start deploy/local/ecosystem.config.cjs --only clawx-keeper
 */
const path = require('path');

const root = path.resolve(__dirname, '../..');

module.exports = {
  apps: [
    {
      name: 'clawx-web',
      cwd: root,
      script: 'server.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '512M',
      autorestart: true,
    },
    {
      name: 'clawx-price-fetcher',
      cwd: root,
      script: 'scripts/price-fetcher.js',
      interpreter: 'node',
      max_memory_restart: '256M',
      autorestart: true,
    },
    {
      name: 'clawx-keeper',
      cwd: root,
      script: 'scripts/keeper.js',
      interpreter: 'node',
      max_memory_restart: '256M',
      autorestart: true,
    },
    {
      name: 'clawx-agent-scheduler',
      cwd: root,
      script: 'scripts/agent-scheduler.js',
      interpreter: 'node',
      max_memory_restart: '256M',
      autorestart: true,
    },
    {
      name: 'clawx-agent-worker',
      cwd: root,
      script: 'scripts/agent-worker.js',
      interpreter: 'node',
      instances: 1,
      max_memory_restart: '512M',
      autorestart: true,
    },
  ],
};
