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

First demo uses `db.t3.small`, single Redis node, 1 web task — lower than the guide’s Multi-AZ medium estimate. Tear down with:

```bash
aws cloudformation delete-stack --stack-name clawx-prod --region ap-south-1
```
