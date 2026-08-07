#!/usr/bin/env bash
# Start/stop local agent processes and flip platform_config.agents_paused.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ECO="$ROOT/deploy/local/ecosystem.config.cjs"
cd "$ROOT"

cmd="${1:-}"
case "$cmd" in
  on)
    node scripts/set-agents-paused.js off
    pm2 start "$ECO" --only clawx-agent-scheduler,clawx-agent-worker
    pm2 save 2>/dev/null || true
    echo "[local-agents] agents ON"
    ;;
  off)
    pm2 stop clawx-agent-scheduler clawx-agent-worker 2>/dev/null || true
    pm2 delete clawx-agent-scheduler clawx-agent-worker 2>/dev/null || true
    node scripts/set-agents-paused.js on
    pm2 save 2>/dev/null || true
    echo "[local-agents] agents OFF (banner enabled)"
    ;;
  *)
    echo "Usage: $0 <on|off>"
    exit 1
    ;;
esac
