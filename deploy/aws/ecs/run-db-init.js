#!/usr/bin/env node
/**
 * Run db schema init against RDS using a one-off Fargate task (web image has node + pg + schema).
 * Falls back to printing DATABASE_URL instructions if the one-off task cannot be started.
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

const region = arg('region', process.env.AWS_REGION || 'ap-south-1');
const stack = arg('stack', 'clawx-prod');
const project = arg('project', 'clawx');

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

const secretString = awsJson([
  'secretsmanager', 'get-secret-value',
  '--secret-id', outputs.AppSecretArn,
  '--region', region,
  '--query', 'SecretString',
  '--output', 'json',
]);
const secret = typeof secretString === 'string' ? JSON.parse(secretString) : secretString;
if (!secret.DATABASE_URL) {
  console.error('DATABASE_URL missing from app secret — run sync-env first');
  process.exit(1);
}

const task = awsJson([
  'ecs', 'describe-task-definition',
  '--task-definition', `${project}-web`,
  '--region', region,
  '--query', 'taskDefinition',
  '--output', 'json',
]);

const overrides = {
  containerOverrides: [
    {
      name: 'web',
      command: [
        'node',
        '-e',
        `
const fs=require('fs');const {Pool}=require('pg');
(async()=>{
  const pool=new Pool({
    connectionString:process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL==='false' ? false : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED!=='false' }
  });
  try {
    // schema is baked into image under /app/db if present; else create minimal from embedded
    const schemaPath='/app/db/schema.sql';
    if(!fs.existsSync(schemaPath)){ console.error('schema.sql missing in image'); process.exit(1); }
    await pool.query(fs.readFileSync(schemaPath,'utf8'));
    console.log('[db:init] ok');
  } finally { await pool.end(); }
})().catch(e=>{ console.error(e); process.exit(1); });
`.trim(),
      ],
      environment: [
        { name: 'DATABASE_URL', value: secret.DATABASE_URL },
        { name: 'DATABASE_SSL', value: secret.DATABASE_SSL || 'true' },
        { name: 'DATABASE_SSL_REJECT_UNAUTHORIZED', value: secret.DATABASE_SSL_REJECT_UNAUTHORIZED || 'false' },
      ],
    },
  ],
};

const net = {
  awsvpcConfiguration: {
    subnets: [outputs.PrivateSubnet1, outputs.PrivateSubnet2],
    securityGroups: [outputs.EcsSecurityGroupId],
    assignPublicIp: 'DISABLED',
  },
};

const overridesFile = path.join(__dirname, '.db-init-overrides.json');
const netFile = path.join(__dirname, '.db-init-network.json');
fs.writeFileSync(overridesFile, JSON.stringify(overrides));
fs.writeFileSync(netFile, JSON.stringify(net));

try {
  console.log('[db-init] Starting one-off Fargate task...');
  const started = awsJson([
    'ecs', 'run-task',
    '--cluster', outputs.ClusterName,
    '--launch-type', 'FARGATE',
    '--task-definition', task.taskDefinitionArn || `${project}-web`,
    '--network-configuration', `file://${netFile}`,
    '--overrides', `file://${overridesFile}`,
    '--region', region,
    '--output', 'json',
  ]);
  const arn = started.tasks?.[0]?.taskArn;
  if (!arn) {
    console.error(started.failures || started);
    process.exit(1);
  }
  console.log('[db-init] Task', arn);
  awsText([
    'ecs', 'wait', 'tasks-stopped',
    '--cluster', outputs.ClusterName,
    '--tasks', arn,
    '--region', region,
  ]);
  const desc = awsJson([
    'ecs', 'describe-tasks',
    '--cluster', outputs.ClusterName,
    '--tasks', arn,
    '--region', region,
    '--output', 'json',
  ]);
  const exitCode = desc.tasks?.[0]?.containers?.[0]?.exitCode;
  console.log('[db-init] Exit code', exitCode);
  if (exitCode !== 0) process.exit(1);
} finally {
  fs.unlinkSync(overridesFile);
  fs.unlinkSync(netFile);
}
