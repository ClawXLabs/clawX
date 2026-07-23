#!/usr/bin/env node
/**
 * Merge local .env into Secrets Manager app secret, compute DATABASE_URL + REDIS_URL
 * from CloudFormation outputs, register revised ECS task definitions with full env,
 * and force new deployments for all five services.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function awsJson(args) {
  const awsBin = process.env.AWS_BIN || path.join(__dirname, 'bin', 'aws');
  const bin = fs.existsSync(awsBin) ? awsBin : 'aws';
  const r = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';
  const out = execFileSync(bin, args, { encoding: 'utf8', env: { ...process.env, AWS_REGION: r } });
  return out.trim() ? JSON.parse(out) : null;
}

function awsText(args) {
  const awsBin = process.env.AWS_BIN || path.join(__dirname, 'bin', 'aws');
  const bin = fs.existsSync(awsBin) ? awsBin : 'aws';
  const r = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';
  return execFileSync(bin, args, { encoding: 'utf8', env: { ...process.env, AWS_REGION: r } }).trim();
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
const envName = arg('env-name', 'prod');
const root = path.resolve(__dirname, '../../..');
const localEnv = loadDotEnv(path.join(root, '.env'));

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

const dbUserPass = awsJson([
  'secretsmanager', 'get-secret-value',
  '--secret-id', outputs.DbSecretArn,
  '--region', region,
  '--query', 'SecretString',
  '--output', 'json',
]);
const dbCreds = typeof dbUserPass === 'string' ? JSON.parse(dbUserPass) : dbUserPass;

const albUrl = outputs.AlbUrl || `http://${outputs.AlbDnsName}`;
const dbUrl =
  localEnv.DATABASE_URL && !localEnv.DATABASE_URL.includes('localhost')
    ? localEnv.DATABASE_URL
    : `postgresql://${encodeURIComponent(dbCreds.username)}:${encodeURIComponent(dbCreds.password)}@${outputs.DbEndpoint}:${outputs.DbPort}/clawx`;

const redisUrl =
  localEnv.REDIS_URL && !localEnv.REDIS_URL.includes('localhost') && !localEnv.REDIS_URL.includes('127.0.0.1')
    ? localEnv.REDIS_URL
    : `redis://${outputs.RedisEndpoint}:${outputs.RedisPort || 6379}`;

const resolvedAppUrl = localEnv.APP_URL && !localEnv.APP_URL.includes('localhost') ? localEnv.APP_URL : albUrl;

const secretPayload = {
  ...localEnv,
  DATABASE_URL: dbUrl,
  REDIS_URL: redisUrl,
  DATABASE_SSL: localEnv.DATABASE_SSL || 'true',
  DATABASE_SSL_REJECT_UNAUTHORIZED: localEnv.DATABASE_SSL_REJECT_UNAUTHORIZED || 'false',
  REDIS_TLS: localEnv.REDIS_TLS || 'false',
  APP_URL: resolvedAppUrl,
  NEXT_PUBLIC_WS_URL:
    localEnv.NEXT_PUBLIC_WS_URL && !localEnv.NEXT_PUBLIC_WS_URL.includes('localhost')
      ? localEnv.NEXT_PUBLIC_WS_URL
      : resolvedAppUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:') + '/ws',
  NODE_ENV: 'production',
};

const secretArn = outputs.AppSecretArn;
if (!secretArn) {
  console.error('AppSecretArn missing from stack outputs');
  process.exit(1);
}

const tmpSecret = path.join(__dirname, '.secret-payload.json');
fs.writeFileSync(tmpSecret, JSON.stringify(secretPayload));
try {
  execFileSync(
    'aws',
    [
      'secretsmanager', 'put-secret-value',
      '--secret-id', secretArn,
      '--secret-string', `file://${tmpSecret}`,
      '--region', region,
    ],
    { stdio: 'inherit' },
  );
} finally {
  fs.unlinkSync(tmpSecret);
}
console.log('[sync] Updated Secrets Manager app secret');

const ENV_KEYS = [
  'NODE_ENV', 'PORT', 'HOST',
  'DATABASE_URL', 'DATABASE_SSL', 'DATABASE_SSL_REJECT_UNAUTHORIZED',
  'REDIS_URL', 'REDIS_TLS',
  'SETTLEMENT_PRIVATE_KEY', 'PRIVATE_KEY',
  'FUJI_RPC_URL', 'NEXT_PUBLIC_FUJI_RPC_URL',
  'NEXT_PUBLIC_CONTRACT_ADDRESS', 'NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS', 'NEXT_PUBLIC_TUSDC_ADDRESS',
  'NEXT_PUBLIC_TRADE_RELAY', 'FAST_ORACLE_ADDRESSES',
  'APP_URL', 'NEXT_PUBLIC_WS_URL',
  'AGENT_RUNNER_SECRET', 'AGENT_RUNNER_POLL_MS',
  'AGENT_LLM_API_KEY', 'AGENT_LLM_BASE_URL', 'AGENT_LLM_MODEL', 'AGENT_LLM_COOLDOWN_SEC',
  'SETTINGS_ENCRYPTION_KEY',
  'PRICE_FETCH_INTERVAL_MS', 'AGENT_QUEUE_NAME', 'AGENT_SCHEDULER_INTERVAL_MS', 'AGENT_WORKER_CONCURRENCY',
  'FAUCET_COOLDOWN_SEC',
  'OPEN_STATS_API_KEY',
];

function envList() {
  return ENV_KEYS
    .filter((k) => secretPayload[k] !== undefined && secretPayload[k] !== '')
    .map((k) => ({ name: k, value: String(secretPayload[k]) }));
}

const services = [
  { service: 'web', family: `${project}-web`, container: 'web' },
  { service: 'price-fetcher', family: `${project}-price-fetcher`, container: 'price-fetcher' },
  { service: 'keeper', family: `${project}-keeper`, container: 'keeper' },
  { service: 'agent-scheduler', family: `${project}-agent-scheduler`, container: 'agent-scheduler' },
  { service: 'agent-workers', family: `${project}-agent-worker`, container: 'agent-worker' },
];

const cluster = outputs.ClusterName;
const environment = envList();

for (const svc of services) {
  const task = awsJson([
    'ecs', 'describe-task-definition',
    '--task-definition', svc.family,
    '--region', region,
    '--query', 'taskDefinition',
    '--output', 'json',
  ]);

  const container = task.containerDefinitions.find((c) => c.name === svc.container);
  if (!container) {
    console.error(`Container ${svc.container} not found in ${svc.family}`);
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

  const tmp = path.join(__dirname, `.task-${svc.family}.json`);
  fs.writeFileSync(tmp, JSON.stringify(register));
  try {
    const registered = awsJson([
      'ecs', 'register-task-definition',
      '--cli-input-json', `file://${tmp}`,
      '--region', region,
      '--output', 'json',
    ]);
    const newArn = registered.taskDefinition.taskDefinitionArn;
    console.log(`[sync] Registered ${newArn}`);
    awsText([
      'ecs', 'update-service',
      '--cluster', cluster,
      '--service', svc.service,
      '--task-definition', newArn,
      '--force-new-deployment',
      '--region', region,
      '--query', 'service.serviceName',
      '--output', 'text',
    ]);
    console.log(`[sync] Redeployed service ${svc.service}`);
  } finally {
    fs.unlinkSync(tmp);
  }
}

console.log('[sync] Done');
