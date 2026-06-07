#!/usr/bin/env bash
# ClawX AWS EC2 one-time setup (Ubuntu 22.04+)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/clawx}"

echo "==> Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx

echo "==> Installing PM2..."
sudo npm install -g pm2

echo "==> Creating app directory..."
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER:$USER" "$APP_DIR"

echo "==> Ensuring data directory..."
mkdir -p "$APP_DIR/data"
touch "$APP_DIR/data/.gitkeep"

echo "==> Done. Next steps:"
echo "  1. Copy .env:  cp deploy/aws/.env.production.example $APP_DIR/.env"
echo "  2. Edit secrets: nano $APP_DIR/.env"
echo "  3. Build:        cd $APP_DIR && npm ci && npm run build"
echo "  4. Start:        pm2 start deploy/aws/ecosystem.config.cjs && pm2 save"
