#!/usr/bin/env bash
# ClawX Phase 5 deploy orchestrator
# Usage:
#   export AWS_REGION=ap-south-1
#   ./deploy/aws/ecs/deploy.sh          # full stack + images + env sync
#   ./deploy/aws/ecs/deploy.sh images   # build/push images only
#   ./deploy/aws/ecs/deploy.sh stack    # CloudFormation only
#   ./deploy/aws/ecs/deploy.sh sync-env # push .env into Secrets Manager + re-register tasks
#   ./deploy/aws/ecs/deploy.sh sync-admin  # narrow admin secret + redeploy admin service
#   ./deploy/aws/ecs/deploy.sh admin-image # build/push clawX-admin image only
#   ./deploy/aws/ecs/deploy.sh db-init  # run schema against RDS via one-off ECS task
#   ./deploy/aws/ecs/deploy.sh smoke    # hit ALB /api/health and /api/prices
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-south-1}}"
STACK="${STACK_NAME:-clawx-prod}"
PROJECT="${PROJECT_NAME:-clawx}"
ENV_NAME="${ENVIRONMENT_NAME:-prod}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
MODE="${1:-all}"
AWS_CLI_IMAGE="${AWS_CLI_IMAGE:-public.ecr.aws/aws-cli/aws-cli:latest}"

cd "$ROOT"

# Resolve a real AWS CLI binary once (avoid recursive function shadowing).
if [ -x "/c/Program Files/Amazon/AWSCLIV2/aws.exe" ]; then
  AWS_BIN="/c/Program Files/Amazon/AWSCLIV2/aws.exe"
elif command -v aws >/dev/null 2>&1; then
  AWS_BIN="$(command -v aws)"
else
  AWS_BIN=""
fi

aws() {
  if [ -n "$AWS_BIN" ]; then
    "$AWS_BIN" "$@"
    return
  fi
  docker run --rm \
    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN \
    -e AWS_DEFAULT_REGION="$REGION" -e AWS_REGION="$REGION" \
    -e AWS_PROFILE \
    -v "${HOME}/.aws:/root/.aws:ro" \
    -v "${ROOT}:/work" -w /work \
    "$AWS_CLI_IMAGE" "$@"
}

need_aws() {
  if ! aws sts get-caller-identity --region "$REGION" >/dev/null 2>&1; then
    echo "ERROR: AWS credentials not working for region $REGION" >&2
    echo "Configure credentials then re-run:" >&2
    echo "  aws configure" >&2
    echo "  # or export AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY" >&2
    echo "  # or aws sso login --profile <name>" >&2
    exit 1
  fi
  echo "==> AWS identity: $(aws sts get-caller-identity --query Arn --output text --region "$REGION")"
}

account_id() {
  aws sts get-caller-identity --query Account --output text --region "$REGION"
}

ecr_login() {
  local acct
  acct="$(account_id)"
  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "${acct}.dkr.ecr.${REGION}.amazonaws.com"
}

stack_output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text
}

deploy_stack() {
  echo "==> Deploying CloudFormation stack $STACK in $REGION"
  aws cloudformation deploy \
    --stack-name "$STACK" \
    --region "$REGION" \
    --template-file deploy/aws/ecs/cloudformation.yml \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides \
      ProjectName="$PROJECT" \
      EnvironmentName="$ENV_NAME" \
      ImageTag="$IMAGE_TAG" \
      WebDesiredCount=1 \
      AdminDesiredCount=1 \
      AdminHost=admin.clawxlab.xyz \
      WorkerDesiredCount=2 \
      WorkerMaxCount=8 \
      DbInstanceClass=db.t3.micro \
      RedisNodeType=cache.t3.micro \
    --no-fail-on-empty-changeset

  mkdir -p deploy/aws/ecs
  aws cloudformation describe-stacks \
    --stack-name "$STACK" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs' \
    --output json > deploy/aws/ecs/outputs.json
  echo "==> Outputs written to deploy/aws/ecs/outputs.json"
  echo "    ALB: $(stack_output AlbUrl)"

  attach_worker_scaling || echo "WARN: worker auto-scaling not attached (create service-linked role and retry)"
}

attach_worker_scaling() {
  echo "==> Attaching worker CPU auto-scaling (min 2 / max 8)"
  aws iam create-service-linked-role \
    --aws-service-name ecs.application-autoscaling.amazonaws.com >/dev/null 2>&1 || true

  local cluster resource
  cluster="$(stack_output ClusterName)"
  resource="service/${cluster}/agent-workers"

  aws application-autoscaling register-scalable-target \
    --service-namespace ecs \
    --scalable-dimension ecs:service:DesiredCount \
    --resource-id "$resource" \
    --min-capacity 2 \
    --max-capacity 8 \
    --region "$REGION"

  aws application-autoscaling put-scaling-policy \
    --service-namespace ecs \
    --scalable-dimension ecs:service:DesiredCount \
    --resource-id "$resource" \
    --policy-name "${PROJECT}-workers-cpu" \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration '{
      "TargetValue": 60.0,
      "PredefinedMetricSpecification": {"PredefinedMetricType": "ECSServiceAverageCPUUtilization"},
      "ScaleInCooldown": 300,
      "ScaleOutCooldown": 60
    }' \
    --region "$REGION" >/dev/null
  echo "==> Worker auto-scaling attached"
}

build_and_push() {
  need_aws
  command -v docker >/dev/null || { echo "docker required"; exit 1; }
  local acct
  acct="$(account_id)"
  local registry="${acct}.dkr.ecr.${REGION}.amazonaws.com"
  ecr_login

  # Ensure repos exist (created by CF; create if images-only)
  for repo in web price-fetcher keeper agent-scheduler agent-worker admin; do
    aws ecr describe-repositories --repository-names "${PROJECT}/${repo}" --region "$REGION" >/dev/null 2>&1 \
      || aws ecr create-repository --repository-name "${PROJECT}/${repo}" --region "$REGION" >/dev/null
  done

  # Load public build args from .env if present (no secret values echoed)
  local build_args=()
  if [ -f .env ]; then
    # shellcheck disable=SC1091
    set -a
    # Only export NEXT_PUBLIC_* for build
    while IFS='=' read -r key val; do
      case "$key" in
        NEXT_PUBLIC_*) export "$key=$val" ;;
      esac
    done < <(grep -E '^NEXT_PUBLIC_[A-Z0-9_]+=' .env || true)
    set +a
    build_args+=(
      --build-arg "NEXT_PUBLIC_CONTRACT_ADDRESS=${NEXT_PUBLIC_CONTRACT_ADDRESS:-}"
      --build-arg "NEXT_PUBLIC_TUSDC_ADDRESS=${NEXT_PUBLIC_TUSDC_ADDRESS:-}"
      --build-arg "NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS=${NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS:-}"
      --build-arg "NEXT_PUBLIC_FUJI_RPC_URL=${NEXT_PUBLIC_FUJI_RPC_URL:-}"
      --build-arg "NEXT_PUBLIC_TRADE_RELAY=${NEXT_PUBLIC_TRADE_RELAY:-true}"
      --build-arg "NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL:-}"
      --build-arg "NEXT_PUBLIC_CHAIN_ID=${NEXT_PUBLIC_CHAIN_ID:-43113}"
    )
  fi

  declare -A DOCKERFILES=(
    [web]=deploy/docker/Dockerfile.web
    [price-fetcher]=deploy/docker/Dockerfile.price-fetcher
    [keeper]=deploy/docker/Dockerfile.keeper
    [agent-scheduler]=deploy/docker/Dockerfile.agent-scheduler
    [agent-worker]=deploy/docker/Dockerfile.agent-worker
  )

  for name in web price-fetcher keeper agent-scheduler agent-worker; do
    local df="${DOCKERFILES[$name]}"
    local image="${registry}/${PROJECT}/${name}:${IMAGE_TAG}"
    echo "==> Building $image"
    if [ "$name" = "web" ]; then
      docker build -f "$df" "${build_args[@]}" -t "$image" .
    else
      docker build -f "$df" -t "$image" .
    fi
    echo "==> Pushing $image"
    docker push "$image"
  done
}

sync_env() {
  need_aws
  if [ ! -f .env ]; then
    echo "ERROR: .env missing — copy deploy/aws/.env.production.example and fill secrets" >&2
    exit 1
  fi
  node deploy/aws/ecs/sync-task-env.js --region "$REGION" --stack "$STACK" --project "$PROJECT" --env-name "$ENV_NAME"
}

sync_admin_env() {
  need_aws
  export AWS_BIN
  node deploy/aws/ecs/sync-admin-task-env.js --region "$REGION" --stack "$STACK" --project "$PROJECT"
  node deploy/aws/ecs/ensure-admin-https-rule.js --region "$REGION" --stack "$STACK" || true
}

build_and_push_admin() {
  need_aws
  command -v docker >/dev/null || { echo "docker required"; exit 1; }
  local acct registry admin_dir image tusdc
  acct="$(account_id)"
  registry="${acct}.dkr.ecr.${REGION}.amazonaws.com"
  admin_dir="$(cd "$ROOT/../clawX-admin" && pwd -W 2>/dev/null || cd "$ROOT/../clawX-admin" && pwd)"
  # Docker Desktop on Windows needs a native path for build context
  if command -v cygpath >/dev/null 2>&1; then
    admin_dir="$(cygpath -w "$ROOT/../clawX-admin")"
  elif [[ "$OSTYPE" == msys* || "$OSTYPE" == cygwin* ]]; then
    admin_dir="C:${ROOT#/c}/../clawX-admin"
    admin_dir="$(cd "$ROOT/../clawX-admin" && pwd -W 2>/dev/null || echo "C:/Users/amaym/dev/extPrj/clawX-admin")"
  fi
  if [ ! -f "$ROOT/../clawX-admin/Dockerfile" ] && [ ! -f "${admin_dir}/Dockerfile" ]; then
    echo "ERROR: admin Dockerfile missing at $ROOT/../clawX-admin/Dockerfile" >&2
    exit 1
  fi
  ecr_login
  aws ecr describe-repositories --repository-names "${PROJECT}/admin" --region "$REGION" >/dev/null 2>&1 \
    || aws ecr create-repository --repository-name "${PROJECT}/admin" --region "$REGION" >/dev/null

  tusdc=""
  if [ -f .env ]; then
    tusdc="$(grep -E '^NEXT_PUBLIC_TUSDC_ADDRESS=' .env | head -1 | cut -d= -f2- | tr -d '\r' || true)"
  fi
  image="${registry}/${PROJECT}/admin:${IMAGE_TAG}"
  echo "==> Building $image from $admin_dir"
  docker build \
    --build-arg "NEXT_PUBLIC_TUSDC_ADDRESS=${tusdc}" \
    -t "$image" \
    "$admin_dir"
  echo "==> Pushing $image"
  docker push "$image"
}

db_init() {
  need_aws
  node deploy/aws/ecs/run-db-init.js --region "$REGION" --stack "$STACK" --project "$PROJECT"
}

smoke() {
  need_aws
  local url
  url="$(stack_output AlbUrl)"
  echo "==> Smoke ${url}/api/health"
  curl -fsS "${url}/api/health" | head -c 500
  echo
  echo "==> Smoke ${url}/api/prices"
  curl -fsS "${url}/api/prices" | head -c 800
  echo
}

case "$MODE" in
  stack)
    need_aws
    deploy_stack
    ;;
  images)
    build_and_push
    ;;
  sync-env)
    sync_env
    ;;
  sync-admin)
    sync_admin_env
    ;;
  admin-image)
    build_and_push_admin
    ;;
  db-init)
    db_init
    ;;
  smoke)
    smoke
    ;;
  admin)
    need_aws
    deploy_stack
    build_and_push_admin
    sync_admin_env
    echo "==> Waiting 45s for admin service..."
    sleep 45
    echo "Admin host: $(stack_output AdminHost)"
    echo "ALB: $(stack_output AlbDnsName)"
    echo "Smoke (Host header): curl -sS -H \"Host: $(stack_output AdminHost)\" http://$(stack_output AlbDnsName)/api/health"
    echo "DNS: CNAME admin → $(stack_output AlbDnsName)"
    ;;
  all)
    need_aws
    deploy_stack
    build_and_push
    sync_env
    echo "==> Waiting 45s for services to settle..."
    sleep 45
    db_init || echo "WARN: db-init failed — check task logs; retry: $0 db-init"
    smoke || echo "WARN: smoke failed — ALB targets may still be registering"
    echo
    echo "Done. Open: $(stack_output AlbUrl)"
    echo "Next: update Secrets Manager app secret if still REPLACE_ME, then: $0 sync-env"
    echo "HTTPS: request ACM cert + add HTTPS listener (see deploy/aws/ecs/README.md)"
    ;;
  *)
    echo "Unknown mode: $MODE" >&2
    exit 1
    ;;
esac
