# Domain setup — avoid Vercel `DEPLOYMENT_NOT_FOUND`

## Correct public URL

**App (AWS ECS):** https://app.clawxlab.xyz  

Do **not** share bare `https://clawxlab.xyz` or `https://www.clawxlab.xyz` until those hosts redirect here. Visitors typing the apex today hit **Vercel** and see:

```text
404: NOT_FOUND
Code: DEPLOYMENT_NOT_FOUND
```

## Why

| Host | Where traffic goes | Result |
|------|--------------------|--------|
| `app.clawxlab.xyz` | AWS ALB → ECS | Live app |
| `clawxlab.xyz` | Vercel | `DEPLOYMENT_NOT_FOUND` if no deployment |
| `www.clawxlab.xyz` | Vercel | Same |

DNS for the zone is still on **Vercel nameservers** (`ns1.vercel-dns.com` / `ns2.vercel-dns.com`).

## Checklist (Vercel dashboard — do once)

1. Open [vercel.com](https://vercel.com) → the project that owns `clawxlab.xyz`.
2. **Settings → Domains**
3. If **`app.clawxlab.xyz`** is listed on the Vercel project, **Remove** it (AWS owns that hostname via DNS CNAME; Vercel must not claim it).
4. For **`clawxlab.xyz`** (apex): set **Redirect** to `https://app.clawxlab.xyz` (301/308).  
   Same for **`www.clawxlab.xyz`** → `https://app.clawxlab.xyz`.
5. Confirm **DNS** (Vercel → Domains / DNS for the zone) still has:

| Type | Name | Value |
|------|------|--------|
| CNAME | `app` | `clawx-prod-1931854364.ap-south-1.elb.amazonaws.com` |

(Use the current ALB DNS from CloudFormation output `AlbDnsName` if the hostname changed.)

6. Save and wait 1–5 minutes (apex TTL may be longer).

## Verify

```bash
chmod +x deploy/aws/ecs/verify-domain.sh
./deploy/aws/ecs/verify-domain.sh
```

Or manually:

```bash
# App → ALB (not Vercel IPs)
nslookup app.clawxlab.xyz 8.8.8.8
curl -sI https://app.clawxlab.xyz/api/health
# expect HTTP/1.1 200 and body {"ok":true,...}

# After redirects are configured:
curl -sI https://clawxlab.xyz/
curl -sI https://www.clawxlab.xyz/
# expect 301/307/308 Location: https://app.clawxlab.xyz/...
```

Worldwide CNAME check: https://www.whatsmydns.net/#CNAME/app.clawxlab.xyz

## Admin desk (ECS)

**Admin URL (after DNS):** https://admin.clawxlab.xyz  

Same ALB as the public app; host rule routes `admin.clawxlab.xyz` → ECS service `admin` (private VPC → RDS).

### DNS you must add (Vercel DNS for `clawxlab.xyz`)

| Type | Name | Value |
|------|------|--------|
| CNAME | `admin` | `clawx-prod-1931854364.ap-south-1.elb.amazonaws.com` |
| CNAME | `_96a61acc82173b7305f305c527234399.admin` | `_ea3756d0b9efcb0acc6a55fd5292b987.jkddzztszm.acm-validations.aws.` |

The second record is ACM validation for HTTPS. After status is **ISSUED**, attach cert:

```bash
export ADMIN_CERT_ARN=arn:aws:acm:ap-south-1:123209654070:certificate/edc7a14d-6ea7-4207-8f2e-28dbc071a912
node deploy/aws/ecs/ensure-admin-https-rule.js --cert-arn "$ADMIN_CERT_ARN"
```

Do **not** attach `admin.clawxlab.xyz` to the Vercel admin project (remove it if present).

Redeploy admin image later:

```bash
./deploy/aws/ecs/deploy.sh admin-image
./deploy/aws/ecs/deploy.sh sync-admin
```

## Share with users

Until apex redirects work, tell people explicitly:

**https://app.clawxlab.xyz**

If they previously saw the Vercel 404: hard refresh, private window, or wait for DNS cache to expire.
