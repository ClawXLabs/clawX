#!/usr/bin/env bash
# Migrate local Docker Postgres → AWS RDS (private).
# Redis is intentionally skipped (prices + BullMQ rebuild on their own).
#
# Prerequisites: local clawx-postgres container running, AWS CLI configured,
#                clawx-prod stack healthy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
export PATH="/c/Program Files/Amazon/AWSCLIV2:$PATH:${PATH:-}"
REGION="${AWS_REGION:-ap-south-1}"
CLUSTER="${CLUSTER:-clawx-prod}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text --region "$REGION")"
BUCKET="${MIGRATE_BUCKET:-clawx-migrate-${ACCOUNT}}"
DUMP_KEY="postgres/clawx-local-$(date +%Y%m%d-%H%M%S).sql"
DUMP_LOCAL="deploy/aws/ecs/.local-dump.sql"

PG_CID="$(docker ps --filter ancestor=postgres:16-alpine --format '{{.ID}}' | head -1)"
if [ -z "$PG_CID" ]; then
  echo "ERROR: local postgres:16-alpine container not running" >&2
  echo "  docker compose -f docker-compose.infrastructure.yml up -d" >&2
  exit 1
fi

echo "==> Dumping local Docker Postgres..."
docker exec "$PG_CID" pg_dump -U clawx -d clawx \
  --no-owner --no-acl --clean --if-exists \
  > "$DUMP_LOCAL"
BYTES="$(wc -c < "$DUMP_LOCAL" | tr -d ' ')"
echo "    size=${BYTES} bytes"

echo "==> Ensuring S3 bucket s3://$BUCKET ..."
if ! aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" 2>/dev/null; then
  aws s3api create-bucket \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
fi
aws s3 cp "$DUMP_LOCAL" "s3://${BUCKET}/${DUMP_KEY}" --region "$REGION"
PRESIGN="$(aws s3 presign "s3://${BUCKET}/${DUMP_KEY}" --expires-in 3600 --region "$REGION")"
echo "    uploaded s3://${BUCKET}/${DUMP_KEY}"

SECRET_JSON="$(aws secretsmanager get-secret-value --secret-id clawx/prod/app --query SecretString --output text --region "$REGION")"
DATABASE_URL="$(SECRET_JSON="$SECRET_JSON" python -c "import json,os; print(json.loads(os.environ['SECRET_JSON'])['DATABASE_URL'])")"
case "$DATABASE_URL" in
  *\?*) DATABASE_URL="${DATABASE_URL}&sslmode=require" ;;
  *)    DATABASE_URL="${DATABASE_URL}?sslmode=require" ;;
esac

aws ecs describe-services --cluster "$CLUSTER" --services web --region "$REGION" \
  --query 'services[0].networkConfiguration' --output json \
  > deploy/aws/ecs/.db-init-network.json

PRESIGN="$PRESIGN" DATABASE_URL="$DATABASE_URL" python -c '
import json, os
cmd = (
  "set -e; "
  "apt-get update -qq && apt-get install -y -qq curl ca-certificates >/dev/null; "
  "curl -fsSL \"$DUMP_URL\" -o /tmp/dump.sql; "
  "echo \"[migrate] restoring $(wc -c </tmp/dump.sql) bytes\"; "
  "psql \"$DATABASE_URL\" -v ON_ERROR_STOP=1 -f /tmp/dump.sql; "
  "echo \"[migrate] ok\""
)
print(json.dumps({
  "containerOverrides": [{
    "name": "migrate",
    "environment": [
      {"name": "DUMP_URL", "value": os.environ["PRESIGN"]},
      {"name": "DATABASE_URL", "value": os.environ["DATABASE_URL"]},
      {"name": "PGCONNECT_TIMEOUT", "value": "30"},
    ],
    "command": ["bash", "-lc", cmd],
  }]
}))
' > deploy/aws/ecs/.db-init-overrides.json

cat > deploy/aws/ecs/.migrate-taskdef.json <<EOF
{
  "family": "clawx-db-migrate",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::${ACCOUNT}:role/clawx-prod-ecs-exec",
  "containerDefinitions": [
    {
      "name": "migrate",
      "image": "public.ecr.aws/docker/library/postgres:16",
      "essential": true,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/clawx/web",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "migrate"
        }
      }
    }
  ]
}
EOF

TD_ARN="$(aws ecs register-task-definition \
  --cli-input-json "file://deploy/aws/ecs/.migrate-taskdef.json" \
  --region "$REGION" \
  --query 'taskDefinition.taskDefinitionArn' --output text)"
echo "==> Task def $TD_ARN"

echo "==> Running restore on Fargate (can reach private RDS)..."
TASK_ARN="$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --launch-type FARGATE \
  --task-definition "$TD_ARN" \
  --network-configuration "file://deploy/aws/ecs/.db-init-network.json" \
  --overrides "file://deploy/aws/ecs/.db-init-overrides.json" \
  --region "$REGION" \
  --query 'tasks[0].taskArn' --output text)"
echo "    task=$TASK_ARN"

if [ -z "$TASK_ARN" ] || [ "$TASK_ARN" = "None" ]; then
  echo "ERROR: run-task failed to start" >&2
  aws ecs run-task \
    --cluster "$CLUSTER" --launch-type FARGATE --task-definition "$TD_ARN" \
    --network-configuration "file://deploy/aws/ecs/.db-init-network.json" \
    --overrides "file://deploy/aws/ecs/.db-init-overrides.json" \
    --region "$REGION" --output json | head -c 2000
  exit 1
fi

aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN" --region "$REGION"
EXIT="$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" --region "$REGION" \
  --query 'tasks[0].containers[0].exitCode' --output text)"
REASON="$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" --region "$REGION" \
  --query 'tasks[0].containers[0].reason' --output text)"
echo "==> Exit code: $EXIT reason: $REASON"
aws logs tail /ecs/clawx/web --since 20m --format short 2>/dev/null | grep -iE 'migrate|ERROR|error' | tail -30 || true

rm -f "$DUMP_LOCAL" \
  deploy/aws/ecs/.db-init-overrides.json \
  deploy/aws/ecs/.db-init-network.json \
  deploy/aws/ecs/.migrate-taskdef.json

if [ "$EXIT" != "0" ]; then
  echo "ERROR: restore failed — check CloudWatch log group /ecs/clawx/web (migrate/*)" >&2
  exit 1
fi
echo "OK — local Postgres data is on RDS."
echo "    Redis was not migrated (price-fetcher + workers refill it)."
