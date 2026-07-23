#!/usr/bin/env node
/**
 * Apply admin schema patch (platform_config, leaderboard_filters, airdrop_log, campaigns)
 * via S3 + one-off ECS task (private RDS).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const region = process.env.AWS_REGION || 'ap-south-1';
const stack = process.env.STACK_NAME || 'clawx-prod';
const aws =
  process.env.AWS_BIN ||
  (fs.existsSync('C:/Program Files/Amazon/AWSCLIV2/aws.exe')
    ? 'C:/Program Files/Amazon/AWSCLIV2/aws.exe'
    : 'aws');

function awsJson(args) {
  const out = execFileSync(aws, args, { encoding: 'utf8', env: process.env });
  return out.trim() ? JSON.parse(out) : null;
}
function awsText(args) {
  return execFileSync(aws, args, { encoding: 'utf8', env: process.env }).trim();
}

const patchFile = path.join(__dirname, '.admin-schema-patch.sql');
if (!fs.existsSync(patchFile)) {
  console.error('Missing', patchFile);
  process.exit(1);
}

const account = awsText(['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text', '--region', region]);
const bucket = `clawx-migrate-${account}`;
const key = `postgres/admin-schema-patch-${Date.now()}.sql`;

try {
  awsText(['s3api', 'head-bucket', '--bucket', bucket, '--region', region]);
} catch {
  awsText([
    's3api', 'create-bucket',
    '--bucket', bucket,
    '--region', region,
    '--create-bucket-configuration', `LocationConstraint=${region}`,
  ]);
}

awsText(['s3', 'cp', patchFile, `s3://${bucket}/${key}`, '--region', region]);
const presign = awsText(['s3', 'presign', `s3://${bucket}/${key}`, '--expires-in', '3600', '--region', region]);
console.log('[patch] uploaded', `s3://${bucket}/${key}`);

const outputs = {};
for (const o of awsJson([
  'cloudformation', 'describe-stacks',
  '--stack-name', stack, '--region', region,
  '--query', 'Stacks[0].Outputs', '--output', 'json',
]) || []) {
  outputs[o.OutputKey] = o.OutputValue;
}

const secretRaw = awsJson([
  'secretsmanager', 'get-secret-value',
  '--secret-id', outputs.AppSecretArn,
  '--region', region,
  '--query', 'SecretString',
  '--output', 'json',
]);
const secret = typeof secretRaw === 'string' ? JSON.parse(secretRaw) : secretRaw;

const dbRaw = awsJson([
  'secretsmanager', 'get-secret-value',
  '--secret-id', outputs.DbSecretArn,
  '--region', region,
  '--query', 'SecretString',
  '--output', 'json',
]);
const dbCreds = typeof dbRaw === 'string' ? JSON.parse(dbRaw) : dbRaw;
const databaseUrl =
  secret.DATABASE_URL && !/localhost|127\.0\.0\.1/i.test(secret.DATABASE_URL)
    ? secret.DATABASE_URL
    : `postgresql://${encodeURIComponent(dbCreds.username)}:${encodeURIComponent(dbCreds.password)}@${outputs.DbEndpoint}:${outputs.DbPort || 5432}/clawx`;

const task = awsJson([
  'ecs', 'describe-task-definition',
  '--task-definition', 'clawx-web',
  '--region', region,
  '--query', 'taskDefinition',
  '--output', 'json',
]);

const inline = `
const {Pool}=require('pg');
const https=require('https');
const http=require('http');
function fetchText(url){
  return new Promise((resolve,reject)=>{
    const lib=url.startsWith('https')?https:http;
    lib.get(url,res=>{
      let d='';
      res.on('data',c=>d+=c);
      res.on('end',()=>{
        if(res.statusCode&&res.statusCode>=400) return reject(new Error('fetch '+res.statusCode));
        resolve(d);
      });
    }).on('error',reject);
  });
}
(async()=>{
  const pool=new Pool({ connectionString:process.env.DATABASE_URL, ssl:{ rejectUnauthorized:false } });
  try {
    const sql=await fetchText(process.env.PATCH_URL);
    console.log('[patch] fetched', sql.length, 'bytes');
    await pool.query(sql);
    const tables=await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[]) ORDER BY 1",
      [['platform_config','leaderboard_filters','airdrop_log','campaigns']]
    );
    console.log('[patch] tables', tables.rows.map(r=>r.tablename).join(','));
    const pc=await pool.query("SELECT faucet_amount_tusdc::text, faucet_cooldown_sec, faucet_paused FROM platform_config WHERE id='default'");
    console.log('[platform]', JSON.stringify(pc.rows[0]||null));
    const lf=await pool.query('SELECT COUNT(*)::int AS c FROM leaderboard_filters');
    console.log('[filters]', lf.rows[0].c);
  } finally { await pool.end(); }
})().catch(e=>{ console.error(e); process.exit(1); });
`.trim();

const overrides = {
  containerOverrides: [{
    name: 'web',
    command: ['node', '-e', inline],
    environment: [
      { name: 'DATABASE_URL', value: databaseUrl },
      { name: 'PATCH_URL', value: presign },
    ],
  }],
};
const of = path.join(__dirname, '.schema-overrides.json');
const nf = path.join(__dirname, '.schema-network.json');
fs.writeFileSync(of, JSON.stringify(overrides));
fs.writeFileSync(nf, JSON.stringify({
  awsvpcConfiguration: {
    subnets: [outputs.PrivateSubnet1, outputs.PrivateSubnet2],
    securityGroups: [outputs.EcsSecurityGroupId],
    assignPublicIp: 'DISABLED',
  },
}));

try {
  const started = awsJson([
    'ecs', 'run-task',
    '--cluster', outputs.ClusterName,
    '--launch-type', 'FARGATE',
    '--task-definition', task.taskDefinitionArn,
    '--network-configuration', `file://${nf}`,
    '--overrides', `file://${of}`,
    '--region', region,
    '--output', 'json',
  ]);
  const arn = started.tasks?.[0]?.taskArn;
  if (!arn) {
    console.error(started.failures || started);
    process.exit(1);
  }
  console.log('[patch] task', arn);
  awsText(['ecs', 'wait', 'tasks-stopped', '--cluster', outputs.ClusterName, '--tasks', arn, '--region', region]);
  const desc = awsJson([
    'ecs', 'describe-tasks',
    '--cluster', outputs.ClusterName,
    '--tasks', arn,
    '--region', region,
    '--output', 'json',
  ]);
  const exitCode = desc.tasks?.[0]?.containers?.[0]?.exitCode;
  console.log('[patch] exit', exitCode, desc.tasks?.[0]?.stoppedReason || '');
  const ev = awsJson([
    'logs', 'filter-log-events',
    '--region', region,
    '--log-group-name', '/ecs/clawx/web',
    '--start-time', String(Date.now() - 900000),
    '--filter-pattern', '[patch]',
    '--limit', '40',
    '--output', 'json',
  ]);
  for (const e of ev.events || []) console.log(e.message);
  if (exitCode !== 0) process.exit(1);
} finally {
  try { fs.unlinkSync(of); } catch {}
  try { fs.unlinkSync(nf); } catch {}
}
