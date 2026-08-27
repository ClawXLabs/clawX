const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const connectionString = process.env.DATABASE_URL;
  const ssl =
    process.env.DATABASE_SSL === 'false' || connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' };

  const pool = new Pool({
    connectionString,
    ssl,
  });

  try {
    const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('[db:init] Schema applied successfully');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[db:init] Failed:', error.message || error);
  process.exit(1);
});
