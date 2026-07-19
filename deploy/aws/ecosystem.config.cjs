/** PM2 process manager — run from repo root: pm2 start deploy/aws/ecosystem.config.cjs */
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
      name: 'clawx-keeper',
      cwd: root,
      script: 'scripts/keeper.js',
      interpreter: 'node',
      max_memory_restart: '256M',
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
      name: 'clawx-agent-scheduler',
      cwd: root,
      script: 'scripts/agent-scheduler.js',
      interpreter: 'node',
      max_memory_restart: '256M',
      autorestart: true,
    },
    {
      name: 'clawx-agent-workers',
      cwd: root,
      script: 'scripts/agent-worker.js',
      interpreter: 'node',
      instances: 2,
      max_memory_restart: '512M',
      autorestart: true,
    },
  ],
};
