#!/usr/bin/env bash
# Write AWS credentials for deploy (does not echo secrets).
# Usage:
#   export AWS_ACCESS_KEY_ID=...
#   export AWS_SECRET_ACCESS_KEY=...
#   export AWS_DEFAULT_REGION=ap-south-1
#   ./deploy/aws/ecs/configure-aws.sh
set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-${AWS_REGION:-ap-south-1}}"
mkdir -p "${HOME}/.aws"

if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
  echo "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in the environment, then re-run." >&2
  echo "Create an IAM user with AdministratorAccess (or ECS/ECR/RDS/VPC/ALB/SecretsManager)." >&2
  exit 1
fi

umask 077
cat > "${HOME}/.aws/credentials" <<EOF
[default]
aws_access_key_id = ${AWS_ACCESS_KEY_ID}
aws_secret_access_key = ${AWS_SECRET_ACCESS_KEY}
EOF

cat > "${HOME}/.aws/config" <<EOF
[default]
region = ${REGION}
output = json
EOF

echo "Wrote ~/.aws/credentials and ~/.aws/config (region=${REGION})"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
docker run --rm \
  -e AWS_DEFAULT_REGION="$REGION" \
  -v "${HOME}/.aws:/root/.aws:ro" \
  public.ecr.aws/aws-cli/aws-cli:latest sts get-caller-identity
echo "OK — run: npm run deploy:aws"
