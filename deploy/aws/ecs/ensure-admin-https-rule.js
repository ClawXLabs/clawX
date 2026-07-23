#!/usr/bin/env node
/**
 * Ensure HTTPS listener has host rule admin.clawxlab.xyz → admin target group.
 * Optionally attach an ACM cert that covers the admin host (SNI).
 *
 * Usage:
 *   node deploy/aws/ecs/ensure-admin-https-rule.js
 *   node deploy/aws/ecs/ensure-admin-https-rule.js --cert-arn arn:aws:acm:...
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function awsBin() {
  if (process.env.AWS_BIN) return process.env.AWS_BIN;
  const win = 'C:/Program Files/Amazon/AWSCLIV2/aws.exe';
  if (fs.existsSync(win)) return win;
  return 'aws';
}

function awsJson(args) {
  const r = process.env.AWS_REGION || 'ap-south-1';
  const out = execFileSync(awsBin(), args, {
    encoding: 'utf8',
    env: { ...process.env, AWS_REGION: r },
  });
  return out.trim() ? JSON.parse(out) : null;
}

const region = arg('region', process.env.AWS_REGION || 'ap-south-1');
const stack = arg('stack', 'clawx-prod');
const certArn = arg('cert-arn', process.env.ADMIN_CERT_ARN || '');

const outputs = {};
for (const o of awsJson([
  'cloudformation', 'describe-stacks',
  '--stack-name', stack,
  '--region', region,
  '--query', 'Stacks[0].Outputs',
  '--output', 'json',
]) || []) {
  outputs[o.OutputKey] = o.OutputValue;
}

const adminHost = outputs.AdminHost || 'admin.clawxlab.xyz';
const adminTg = outputs.AdminTargetGroupArn;
const httpListener = outputs.HttpListenerArn;
if (!adminTg || !httpListener) {
  console.error('Missing AdminTargetGroupArn or HttpListenerArn');
  process.exit(1);
}

const albArn = awsJson([
  'elbv2', 'describe-listeners',
  '--listener-arns', httpListener,
  '--region', region,
  '--query', 'Listeners[0].LoadBalancerArn',
  '--output', 'json',
]);

const listeners = awsJson([
  'elbv2', 'describe-listeners',
  '--load-balancer-arn', albArn,
  '--region', region,
  '--output', 'json',
])?.Listeners || [];

const https = listeners.find((l) => l.Port === 443 && l.Protocol === 'HTTPS');
if (!https) {
  console.log('[https-admin] No HTTPS :443 listener yet — HTTP host rule from CFN is enough for now.');
  console.log('[https-admin] After ACM cert is issued, re-run with --cert-arn');
  process.exit(0);
}

const rules = awsJson([
  'elbv2', 'describe-rules',
  '--listener-arn', https.ListenerArn,
  '--region', region,
  '--output', 'json',
])?.Rules || [];

const existing = rules.find((r) =>
  (r.Conditions || []).some(
    (c) =>
      c.Field === 'host-header' &&
      (c.Values || c.HostHeaderConfig?.Values || []).includes(adminHost)
  )
);

if (existing) {
  console.log('[https-admin] Host rule already exists:', existing.RuleArn);
  // Ensure it points at admin TG
  execFileSync(
    awsBin(),
    [
      'elbv2', 'modify-rule',
      '--rule-arn', existing.RuleArn,
      '--actions', `Type=forward,TargetGroupArn=${adminTg}`,
      '--region', region,
    ],
    { stdio: 'inherit', env: process.env }
  );
} else {
  const used = new Set(
    rules.filter((r) => !r.IsDefault).map((r) => Number(r.Priority)).filter((n) => !Number.isNaN(n))
  );
  let priority = 10;
  while (used.has(priority)) priority += 1;
  console.log('[https-admin] Creating host rule priority', priority, 'for', adminHost);
  execFileSync(
    awsBin(),
    [
      'elbv2', 'create-rule',
      '--listener-arn', https.ListenerArn,
      '--priority', String(priority),
      '--conditions', `Field=host-header,Values=${adminHost}`,
      '--actions', `Type=forward,TargetGroupArn=${adminTg}`,
      '--region', region,
    ],
    { stdio: 'inherit', env: process.env }
  );
}

if (certArn) {
  console.log('[https-admin] Attaching certificate for SNI:', certArn);
  try {
    execFileSync(
      awsBin(),
      [
        'elbv2', 'add-listener-certificates',
        '--listener-arn', https.ListenerArn,
        '--certificates', `CertificateArn=${certArn}`,
        '--region', region,
      ],
      { stdio: 'inherit', env: process.env }
    );
  } catch (e) {
    console.log('[https-admin] add-listener-certificates note:', e.message || e);
  }
} else {
  console.log('[https-admin] Tip: pass --cert-arn once admin.clawxlab.xyz ACM cert is ISSUED');
}

console.log('[https-admin] Done');
