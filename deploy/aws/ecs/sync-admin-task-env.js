#!/usr/bin/env node
/**
 * Sync narrow admin env into Secrets Manager + re-register clawx-admin task.
 *
 * Sources:
 *   - CloudFormation outputs (RDS endpoint / secrets)
 *   - clawX/.env (FUJI_RPC_URL, NEXT_PUBLIC_TUSDC_ADDRESS, FAUCET_PRIVATE_KEY / PRIVATE_KEY)
 *   - clawX-admin/.env.vercel (optional ADMIN_SESSION_SECRET override)
 *
 * Does NOT push settlement / agent / redis keys.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function awsBin() {
  const bundled = path.join(__dirname, 'bin', 'aws');
  if (process.env.AWS_BIN) return process.env.AWS_BIN;
  if (fs.existsSync(bundled)) return bundled;
  const win = 'C:/Program Files/Amazon/AWSCLIV2/aws.exe';
  if (fs.existsSync(win)) return win;
  return 'aws';
}

function awsJson(args) {
  const r = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';
  const out = execFileSync(awsBin(), args, {
    encoding: 'utf8',
    env: { ...process.env, AWS_REGION: r },
  });
  return out.trim() ? JSON.parse(out) : null;
}

function awsText(args) {
  const r = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';
  return execFileSync(awsBin(), args, {
    encoding: 'utf8',
    env: { ...process.env, AWS_REGION: r },
  }).trim();
}

function loadDotEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const region = arg('region', process.env.AWS_REGION || 'ap-south-1');
const stack = arg('stack', 'clawx-prod');
const project = arg('project', 'clawx');
const root = path.resolve(__dirname, '../../..');
const adminRoot = path.resolve(root, '../clawX-admin');

const clawxEnv = loadDotEnv(path.join(root, '.env'));
const adminEnv = {
  ...loadDotEnv(path.join(adminRoot, '.env.vercel')),
  ...loadDotEnv(path.join(adminRoot, '.env.local')),
};

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

if (!outputs.AdminSecretArn) {
  console.error('AdminSecretArn missing — deploy CloudFormation stack with admin resources first');
  process.exit(1);
}

const dbUserPass = awsJson([
  'secretsmanager', 'get-secret-value',
  '--secret-id', outputs.DbSecretArn,
  '--region', region,
  '--query', 'SecretString',
  '--output', 'json',
]);
const dbCreds = typeof dbUserPass === 'string' ? JSON.parse(dbUserPass) : dbUserPass;

let existingAdmin = {};
try {
  const raw = awsJson([
    'secretsmanager', 'get-secret-value',
    '--secret-id', outputs.AdminSecretArn,
    '--region', region,
    '--query', 'SecretString',
    '--output', 'json',
  ]);
  existingAdmin = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
} catch (_) {
  existingAdmin = {};
}

const dbUrl = `postgresql://${encodeURIComponent(dbCreds.username)}:${encodeURIComponent(dbCreds.password)}@${outputs.DbEndpoint}:${outputs.DbPort}/clawx`;

const sessionSecret =
  (adminEnv.ADMIN_SESSION_SECRET && adminEnv.ADMIN_SESSION_SECRET.length >= 16
    ? adminEnv.ADMIN_SESSION_SECRET
    : null) ||
  (existingAdmin.ADMIN_SESSION_SECRET &&
  existingAdmin.ADMIN_SESSION_SECRET !== 'REPLACE_ME' &&
  existingAdmin.ADMIN_SESSION_SECRET.length >= 16
    ? existingAdmin.ADMIN_SESSION_SECRET
    : null) ||
  crypto.randomBytes(32).toString('hex');

const faucetKey = (
  clawxEnv.FAUCET_PRIVATE_KEY ||
  adminEnv.FAUCET_PRIVATE_KEY ||
  clawxEnv.PRIVATE_KEY ||
  ''
).trim();

const secretPayload = {
  NODE_ENV: 'production',
  PORT: '3000',
  HOST: '0.0.0.0',
  DATABASE_URL: dbUrl,
  DATABASE_SSL: 'true',
  DATABASE_SSL_REJECT_UNAUTHORIZED: 'false',
  ADMIN_SESSION_SECRET: sessionSecret,
  ADMIN_HOST: outputs.AdminHost || 'admin.clawxlab.xyz',
  FUJI_RPC_URL: clawxEnv.FUJI_RPC_URL || adminEnv.FUJI_RPC_URL || '',
  NEXT_PUBLIC_TUSDC_ADDRESS:
    clawxEnv.NEXT_PUBLIC_TUSDC_ADDRESS || adminEnv.NEXT_PUBLIC_TUSDC_ADDRESS || '',
  AWS_REGION: region,
  ECS_CLUSTER: stack,
  ECS_CLUSTER_NAME: stack,
  APP_URL: clawxEnv.APP_URL || adminEnv.APP_URL || 'https://app.clawxlab.xyz',
  PUBLIC_APP_HEALTH_URL: 'https://app.clawxlab.xyz/api/health',
  ADMIN_HEALTH_URL: `https://${outputs.AdminHost || 'admin.clawxlab.xyz'}/api/health`,
};

if (faucetKey) {
  secretPayload.FAUCET_PRIVATE_KEY = faucetKey;
  secretPayload.PRIVATE_KEY = faucetKey;
}

const tmpSecret = path.join(__dirname, '.admin-secret-payload.json');
fs.writeFileSync(tmpSecret, JSON.stringify(secretPayload));
try {
  execFileSync(
    awsBin(),
    [
      'secretsmanager', 'put-secret-value',
      '--secret-id', outputs.AdminSecretArn,
      '--secret-string', `file://${tmpSecret}`,
      '--region', region,
    ],
    { stdio: 'inherit', env: process.env }
  );
} finally {
  fs.unlinkSync(tmpSecret);
}
console.log('[sync-admin] Updated Secrets Manager admin secret');

const ENV_KEYS = [
  'NODE_ENV',
  'PORT',
  'HOST',
  'DATABASE_URL',
  'DATABASE_SSL',
  'DATABASE_SSL_REJECT_UNAUTHORIZED',
  'ADMIN_SESSION_SECRET',
  'ADMIN_HOST',
  'FUJI_RPC_URL',
  'NEXT_PUBLIC_TUSDC_ADDRESS',
  'FAUCET_PRIVATE_KEY',
  'PRIVATE_KEY',
  'AWS_REGION',
  'ECS_CLUSTER',
  'ECS_CLUSTER_NAME',
  'APP_URL',
  'PUBLIC_APP_HEALTH_URL',
  'ADMIN_HEALTH_URL',
];

const environment = ENV_KEYS
  .filter((k) => secretPayload[k] !== undefined && secretPayload[k] !== '')
  .map((k) => ({ name: k, value: String(secretPayload[k]) }));

const family = `${project}-admin`;
const task = awsJson([
  'ecs', 'describe-task-definition',
  '--task-definition', family,
  '--region', region,
  '--query', 'taskDefinition',
  '--output', 'json',
]);

const container = task.containerDefinitions.find((c) => c.name === 'admin');
if (!container) {
  console.error('Container admin not found in', family);
  process.exit(1);
}
container.environment = environment;

const register = {
  family: task.family,
  taskRoleArn: task.taskRoleArn,
  executionRoleArn: task.executionRoleArn,
  networkMode: task.networkMode,
  containerDefinitions: task.containerDefinitions,
  requiresCompatibilities: task.requiresCompatibilities,
  cpu: task.cpu,
  memory: task.memory,
};
if (task.runtimePlatform) register.runtimePlatform = task.runtimePlatform;

const tmp = path.join(__dirname, `.task-${family}.json`);
fs.writeFileSync(tmp, JSON.stringify(register));
try {
  const registered = awsJson([
    'ecs', 'register-task-definition',
    '--cli-input-json', `file://${tmp}`,
    '--region', region,
    '--output', 'json',
  ]);
  const newArn = registered.taskDefinition.taskDefinitionArn;
  console.log('[sync-admin] Registered', newArn);
  awsText([
    'ecs', 'update-service',
    '--cluster', outputs.ClusterName,
    '--service', 'admin',
    '--task-definition', newArn,
    '--force-new-deployment',
    '--region', region,
    '--query', 'service.serviceName',
    '--output', 'text',
  ]);
  console.log('[sync-admin] Redeployed service admin');
} finally {
  fs.unlinkSync(tmp);
}

console.log('[sync-admin] Done');
