# ClawX ECS / Phase 5

Deploy the full production stack from [deployment_guide.md](../../../deployment_guide.md) Phase 5.

## What this creates

- VPC (public/private, NAT)
- RDS PostgreSQL 16
- ElastiCache Redis
- ECR repos for 5 images
- ECS Fargate services: `web`, `price-fetcher`, `keeper`, `agent-scheduler`, `agent-workers`
- ALB with stickiness + health check on `/api/health`
- Secrets Manager secrets (DB master + app)

## Prerequisites

1. AWS CLI v2 installed and authenticated (`aws sts get-caller-identity`)
2. Docker Desktop running
3. Project `.env` filled (see [../.env.production.example](../.env.production.example))
4. Default region: `ap-south-1` (override with `AWS_REGION`)

## One-shot deploy

```bash
chmod +x deploy/aws/ecs/deploy.sh
export AWS_REGION=ap-south-1
./deploy/aws/ecs/deploy.sh
```

Steps: CloudFormation → build/push images → sync `.env` into Secrets Manager + task defs → `db:init` one-off task → smoke `/api/health` + `/api/prices`.

## Partial commands

```bash
./deploy/aws/ecs/deploy.sh stack      # infra only
./deploy/aws/ecs/deploy.sh images     # Docker → ECR
./deploy/aws/ecs/deploy.sh sync-env   # secrets + force ECS redeploy
./deploy/aws/ecs/deploy.sh db-init
./deploy/aws/ecs/deploy.sh smoke
```

## HTTPS (after first HTTP smoke works)

1. Request ACM certificate in the **same region** as the ALB (or `us-east-1` only if using CloudFront later).
2. Validate via DNS.
3. Add an HTTPS listener on the ALB forwarding to the existing target group; optionally redirect :80 → :443.
4. Point Route 53 alias to the ALB DNS from stack output `AlbDnsName`.
5. Update `APP_URL` / `NEXT_PUBLIC_WS_URL` in `.env` to `https://` / `wss://`, then `./deploy/aws/ecs/deploy.sh sync-env`.

## Worker auto-scaling

After stack create, `deploy.sh` / `sync-task-env` can register CPU target tracking (min 2 / max 8). Create the service-linked role once if missing:

```bash
aws iam create-service-linked-role --aws-service-name ecs.application-autoscaling.amazonaws.com
```

## Cost note

First demo uses `db.t3.micro` / free-tier-friendly sizing where possible, single Redis node, 1 web task. Tear down with:

```bash
aws cloudformation delete-stack --stack-name clawx-prod --region ap-south-1
```

## CI/CD (GitHub Actions → ECS)

Push to **`main`** builds five images, pushes to ECR (`:latest` + commit SHA), force-redeploys ECS, then smokes `https://app.clawxlab.xyz/api/health`.

Workflow: [`.github/workflows/deploy-ecs.yml`](../../../.github/workflows/deploy-ecs.yml)

### Branch model

| Branch | Purpose | Auto-deploys? |
|--------|---------|---------------|
| `main` | Production | Yes |
| `develop` | Local / WIP / sidelined work | No |
| `feature/*` | Short-lived → merge to `develop` or `main` | No |

```bash
# Production (updates AWS)
git checkout main && git pull && git push origin main

# WIP (GitHub backup only)
git checkout develop && git push origin develop

# Promote
git checkout main && git merge develop && git push origin main
```

### One-time GitHub ↔ AWS wiring

1. Local AWS keys in gitignored [`../.env.aws`](../.env.aws) (never commit).
2. Create OIDC role (once):

```bash
set -a && source deploy/aws/.env.aws && set +a
chmod +x deploy/aws/ecs/setup-github-oidc.sh
./deploy/aws/ecs/setup-github-oidc.sh
```

Role ARN: `arn:aws:iam::123209654070:role/clawx-github-deploy`

GitHub repo: **`ClawXLabs/clawX`** (set `GITHUB_REPO` if different).

3. Log into GitHub CLI and set secret + `NEXT_PUBLIC_*` Variables:

```bash
gh auth login
chmod +x deploy/aws/ecs/setup-github-vars.sh
./deploy/aws/ecs/setup-github-vars.sh
```

Required:

| Kind | Name | Purpose |
|------|------|---------|
| Secret | `AWS_DEPLOY_ROLE_ARN` | OIDC assume-role for Actions |
| Variable | `NEXT_PUBLIC_CONTRACT_ADDRESS` | Baked into web image |
| Variable | `NEXT_PUBLIC_TUSDC_ADDRESS` | Baked into web image |
| Variable | `NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS` | Baked into web image |
| Variable | `NEXT_PUBLIC_FUJI_RPC_URL` | Baked into web image |
| Variable | `NEXT_PUBLIC_TRADE_RELAY` | Usually `true` |
| Variable | `NEXT_PUBLIC_WS_URL` | e.g. `wss://app.clawxlab.xyz/ws` |
| Variable | `NEXT_PUBLIC_CHAIN_ID` | `43113` |

4. Watch deploys: GitHub → **Actions** → *Deploy ClawX to ECS*. Logs: CloudWatch `/ecs/clawx/web`.

### What CI does **not** do

- CloudFormation / infra create
- Secrets Manager sync from local `.env`
- `db:init`

For secret or `APP_URL` changes, run locally:

```bash
./deploy/aws/ecs/deploy.sh sync-env
```
