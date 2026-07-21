#!/usr/bin/env bash
# Set GitHub Actions secret + Variables for ECS deploy (run once after: gh auth login).
# Usage from repo root:
#   ./deploy/aws/ecs/setup-github-vars.sh
set -euo pipefail

REPO="${GITHUB_REPO:-crucie/clawX}"
ROLE_ARN="${AWS_DEPLOY_ROLE_ARN:-arn:aws:iam::123209654070:role/clawx-github-deploy}"

export PATH="/c/Program Files/GitHub CLI:${PATH:-}"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI not found. Install: winget install GitHub.cli" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: not logged in. Run: gh auth login" >&2
  exit 1
fi

echo "==> Secret AWS_DEPLOY_ROLE_ARN"
gh secret set AWS_DEPLOY_ROLE_ARN --repo "$REPO" --body "$ROLE_ARN"

echo "==> Repository Variables (NEXT_PUBLIC_* for web Docker build)"
gh variable set NEXT_PUBLIC_CONTRACT_ADDRESS --repo "$REPO" --body "0x378FBf873fF77a44ae9aac0B5427804A9Ec1Bf1d"
gh variable set NEXT_PUBLIC_TUSDC_ADDRESS --repo "$REPO" --body "0xd27D2AB610714E262E64c7BFA789769A98A5DeB1"
gh variable set NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS --repo "$REPO" --body "0xd27D2AB610714E262E64c7BFA789769A98A5DeB1"
gh variable set NEXT_PUBLIC_FUJI_RPC_URL --repo "$REPO" --body "https://api.avax-test.network/ext/bc/C/rpc"
gh variable set NEXT_PUBLIC_TRADE_RELAY --repo "$REPO" --body "true"
gh variable set NEXT_PUBLIC_WS_URL --repo "$REPO" --body "wss://app.clawxlab.xyz/ws"
gh variable set NEXT_PUBLIC_CHAIN_ID --repo "$REPO" --body "43113"

echo ""
echo "Done. Verify:"
echo "  gh secret list --repo $REPO"
echo "  gh variable list --repo $REPO"
echo "Trigger deploy: Actions → Deploy ClawX to ECS → Run workflow"
