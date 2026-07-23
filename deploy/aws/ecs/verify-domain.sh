#!/usr/bin/env bash
# Verify public DNS / redirects for ClawX.
# Usage: ./deploy/aws/ecs/verify-domain.sh
set -euo pipefail

APP_HOST="${APP_HOST:-app.clawxlab.xyz}"
APEX_HOST="${APEX_HOST:-clawxlab.xyz}"
WWW_HOST="${WWW_HOST:-www.clawxlab.xyz}"
ALB_HINT="${ALB_HINT:-elb.amazonaws.com}"

ok=0
fail=0

check() {
  local name="$1"
  shift
  if "$@"; then
    echo "OK  $name"
    ok=$((ok + 1))
  else
    echo "FAIL $name"
    fail=$((fail + 1))
  fi
}

echo "==> $APP_HOST must resolve to AWS ALB and serve /api/health"
APP_LOOKUP="$(nslookup "$APP_HOST" 8.8.8.8 2>&1 || true)"
check "app DNS → ALB" grep -qi "$ALB_HINT" <<<"$APP_LOOKUP"
HEALTH="$(curl -fsS --max-time 15 "https://${APP_HOST}/api/health" || true)"
check "app /api/health ok" grep -q '"ok":true' <<<"$HEALTH"

echo ""
echo "==> Apex / www should redirect to https://${APP_HOST}/ (configure in Vercel Domains — see DOMAIN.md)"
APEX_LOC="$(curl -sSI --max-time 15 "https://${APEX_HOST}/" 2>&1 | tr -d '\r' | grep -i '^Location:' | head -1 || true)"
WWW_LOC="$(curl -sSI --max-time 15 "https://${WWW_HOST}/" 2>&1 | tr -d '\r' | grep -i '^Location:' | head -1 || true)"
echo "    apex Location: ${APEX_LOC:-"(none — still serving Vercel content)"}"
echo "    www  Location: ${WWW_LOC:-"(none)"}"

if grep -qi "$APP_HOST" <<<"$APEX_LOC"; then
  echo "OK  apex redirects to app"
  ok=$((ok + 1))
else
  echo "FAIL apex does not redirect to ${APP_HOST} yet — open Vercel → Domains and set redirect (DOMAIN.md)"
  fail=$((fail + 1))
fi

if grep -qi "$APP_HOST" <<<"$WWW_LOC"; then
  echo "OK  www redirects to app"
  ok=$((ok + 1))
else
  echo "FAIL www does not redirect to ${APP_HOST} yet — open Vercel → Domains and set redirect (DOMAIN.md)"
  fail=$((fail + 1))
fi

echo ""
echo "Summary: $ok ok, $fail fail"
if [ "$fail" -gt 0 ]; then
  echo "Share https://${APP_HOST} with users until apex/www redirects are fixed."
  exit 1
fi
exit 0
