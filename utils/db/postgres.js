import { Pool } from 'pg';

const globalForPostgres = globalThis;

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for PostgreSQL persistence');
  }

  const ssl =
    process.env.DATABASE_SSL === 'false'
      ? false
      : process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false;

  const pool = new Pool({
    connectionString,
    ssl,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30_000),
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 5_000),
  });

  pool.on('error', (error) => {
    console.error('[postgres] Unexpected idle client error:', error);
  });

  return pool;
}

export function getPool() {
  if (!globalForPostgres.__clawxPostgresPool) {
    globalForPostgres.__clawxPostgresPool = createPool();
  }
  return globalForPostgres.__clawxPostgresPool;
}

export function query(text, values) {
  return getPool().query(text, values);
}

export async function withTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (globalForPostgres.__clawxPostgresPool) {
    await globalForPostgres.__clawxPostgresPool.end();
    delete globalForPostgres.__clawxPostgresPool;
  }
}
