/** PM2 process manager — run from repo root: pm2 start deploy/aws/ecosystem.config.cjs */
const path = require('path');

const root = path.resolve(__dirname, '../..');

module.exports = {
  apps: [
    {
      name: 'clawx-web',
      cwd: root,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
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
      name: 'clawx-agent-runner',
      cwd: root,
      script: 'scripts/agent-runner.js',
      interpreter: 'node',
      max_memory_restart: '256M',
      autorestart: true,
    },
  ],
};
