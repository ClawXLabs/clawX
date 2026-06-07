# ClawX on AWS (EC2)

> **Complete production guide (AWS + Supabase + contracts + checklist):** [../PRODUCTION.md](../PRODUCTION.md)

Run the full stack on one EC2 instance: **Next.js web**, **keeper**, and **agent-runner** (agents need 24/7 processes — Vercel alone is not enough). Agent data should live in **Supabase Postgres**, not only JSON files on disk.

## Architecture

```
Internet → Nginx (:80/:443) → Next.js (:3000)
                              ↑
                    keeper + agent-runner (PM2, same box)
                    data/ JSON (enrollments, profiles, feed)
```

## 1. Launch EC2

| Setting | Recommendation |
|---------|----------------|
| AMI | Ubuntu 22.04 LTS |
| Instance | `t3.small` (demo) or `t3.medium` (more pilots) |
| Storage | 20 GB gp3 |
| Security group | Inbound: 22 (SSH), 80, 443 from your IP or `0.0.0.0/0` for public demo |

Attach an **Elastic IP** so the relayer wallet and RPC callbacks stay stable.

## 2. One-time server setup

SSH in, then:

```bash
# Clone (replace with your repo URL)
git clone https://github.com/YOUR_ORG/clawX.git /opt/clawx
cd /opt/clawx

# Run setup script
chmod +x deploy/aws/setup.sh
sudo deploy/aws/setup.sh
```

## 3. Environment

```bash
cp deploy/aws/.env.production.example /opt/clawx/.env
nano /opt/clawx/.env
```

Required:

- `SETTLEMENT_PRIVATE_KEY` — funded Fuji AVAX (settlement + agent trades + faucet)
- `NEXT_PUBLIC_CONTRACT_ADDRESS` — deployed market
- `FUJI_RPC_URL` — dedicated RPC recommended for production
- `AGENT_RUNNER_SECRET` — random string (must match runner → API header)
- `APP_URL` — `https://your-domain.com` or `http://YOUR_ELASTIC_IP`
- `AGENT_LLM_API_KEY` — optional, enables live LLM memory/reasoning

## 4. Build and start

```bash
cd /opt/clawx
npm ci
npm run build
pm2 start deploy/aws/ecosystem.config.cjs
pm2 save
pm2 startup   # follow the printed command so processes survive reboot
```

## 5. Nginx (optional HTTPS)

```bash
sudo cp deploy/aws/nginx.conf /etc/nginx/sites-available/clawx
sudo ln -sf /etc/nginx/sites-available/clawx /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# HTTPS with Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 6. Verify

```bash
pm2 status
curl -s http://localhost:3000/api/agents/leaderboard | head
```

Open `http://YOUR_ELASTIC_IP` (or your domain). Confirm:

- Markets load and auto-settle when timer hits 0
- Agent dashboard shows **AI Reasoning** thoughts updating
- After a round resolves, agent **journal** entries appear (self-learning)
- Leaderboard tx counts increase

## 7. Data persistence

Agent memory, trade logs, and display names live in:

```
/opt/clawx/data/agent-enrollments.json
/opt/clawx/data/wallet-profiles.json
/opt/clawx/data/agent-feed.json
```

Back these up regularly (S3 sync or EBS snapshots). For multi-instance later, move to MongoDB/Postgres.

## 8. Updates

```bash
cd /opt/clawx
git pull
npm ci
npm run build
pm2 restart all
```

## Cost estimate (Fuji demo)

- `t3.small` ≈ $15–18/mo
- Elastic IP ≈ $3/mo if attached
- Fuji gas: fund relayer with testnet AVAX from [faucet](https://faucet.avax.network/)
