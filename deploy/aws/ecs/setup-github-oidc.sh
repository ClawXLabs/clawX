#!/usr/bin/env bash
# One-time: GitHub Actions OIDC provider + clawx-github-deploy IAM role.
# Usage (from repo root, with AWS creds loaded):
#   set -a && source deploy/aws/.env.aws && set +a
#   ./deploy/aws/ecs/setup-github-oidc.sh
set -euo pipefail

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text | tr -d '\r')"
REGION="${AWS_REGION:-ap-south-1}"
REPO="${GITHUB_REPO:-ClawXLabs/clawX}"
ROLE_NAME="${GITHUB_DEPLOY_ROLE_NAME:-clawx-github-deploy}"
OIDC_URL="https://token.actions.githubusercontent.com"
OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

echo "==> Account ${ACCOUNT_ID} region ${REGION} repo ${REPO}"

if ! aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" >/dev/null 2>&1; then
  echo "==> Creating GitHub OIDC provider"
  # Thumbprint required by IAM API; GitHub rotates certs but AWS also validates the JWT.
  aws iam create-open-id-connect-provider \
    --url "$OIDC_URL" \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
    >/dev/null
else
  echo "==> OIDC provider already exists"
fi

# Repo-local JSON files — Windows AWS CLI cannot read Git Bash /tmp mktemp paths.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRUST="${SCRIPT_DIR}/.oidc-trust.json"
POLICY="${SCRIPT_DIR}/.oidc-policy.json"
cat >"$TRUST" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "${OIDC_ARN}" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${REPO}:*"
        }
      }
    }
  ]
}
EOF

cat >"$POLICY" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrAuth",
      "Effect": "Allow",
      "Action": ["ecr:GetAuthorizationToken"],
      "Resource": "*"
    },
    {
      "Sid": "EcrPush",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:DescribeRepositories",
        "ecr:ListImages",
        "ecr:DescribeImages"
      ],
      "Resource": "arn:aws:ecr:${REGION}:${ACCOUNT_ID}:repository/clawx/*"
    },
    {
      "Sid": "EcsRedeploy",
      "Effect": "Allow",
      "Action": [
        "ecs:UpdateService",
        "ecs:DescribeServices",
        "ecs:DescribeClusters",
        "ecs:DescribeTaskDefinition",
        "ecs:ListServices"
      ],
      "Resource": "*"
    }
  ]
}
EOF

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "==> Updating trust + inline policy on existing role ${ROLE_NAME}"
  aws iam update-assume-role-policy --role-name "$ROLE_NAME" --policy-document "file://${TRUST}"
else
  echo "==> Creating role ${ROLE_NAME}"
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "file://${TRUST}" \
    --description "GitHub Actions OIDC deploy for ${REPO}" \
    >/dev/null
fi

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name clawx-github-deploy-inline \
  --policy-document "file://${POLICY}"

rm -f "$TRUST" "$POLICY"

echo ""
echo "Role ARN (set as GitHub secret AWS_DEPLOY_ROLE_ARN):"
echo "$ROLE_ARN"
echo ""
echo "Next:"
echo "  gh secret set AWS_DEPLOY_ROLE_ARN --repo ${REPO} --body \"${ROLE_ARN}\""
