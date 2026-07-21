# HTTPS listener helper — run after ACM certificate is ISSUED
# Usage:
#   export CERT_ARN=arn:aws:acm:ap-south-1:ACCOUNT:certificate/...
#   export AWS_REGION=ap-south-1
#   ./deploy/aws/ecs/add-https.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
REGION="${AWS_REGION:-ap-south-1}"
STACK="${STACK_NAME:-clawx-prod}"
CERT_ARN="${CERT_ARN:?Set CERT_ARN to your ACM certificate ARN}"

cd "$ROOT"

aws() {
  if command -v aws >/dev/null 2>&1; then command aws "$@"; return; fi
  docker run --rm \
    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN \
    -e AWS_DEFAULT_REGION="$REGION" -e AWS_REGION="$REGION" \
    -v "${HOME}/.aws:/root/.aws:ro" \
    -v "${ROOT}:/work" -w /work \
    public.ecr.aws/aws-cli/aws-cli:latest "$@"
}

TG=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='TargetGroupArn'].OutputValue" --output text)
LISTENER=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='HttpListenerArn'].OutputValue" --output text)
ALB_ARN=$(aws elbv2 describe-listeners --listener-arns "$LISTENER" --region "$REGION" \
  --query 'Listeners[0].LoadBalancerArn' --output text)

echo "==> Creating HTTPS :443 listener on $ALB_ARN"
aws elbv2 create-listener \
  --load-balancer-arn "$ALB_ARN" \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn="$CERT_ARN" \
  --default-actions Type=forward,TargetGroupArn="$TG" \
  --region "$REGION"

echo "==> Redirecting HTTP :80 → HTTPS"
aws elbv2 modify-listener \
  --listener-arn "$LISTENER" \
  --default-actions "Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}" \
  --region "$REGION"

echo "Done. Point Route 53 alias A/AAAA to the ALB DNS, then update APP_URL / NEXT_PUBLIC_WS_URL and run sync-env."
