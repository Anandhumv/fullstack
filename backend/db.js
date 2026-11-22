const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config(); // Also check CWD
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

// Automatically enable SSL for cloud-hosted PostgreSQL instances (Neon, Supabase, Render)
const isSSL = Boolean(
  connectionString && (
    connectionString.includes('neon.tech') ||
    connectionString.includes('sslmode=require') ||
    process.env.NODE_ENV === 'production'
  )
);

const pool = new Pool({
  connectionString,
  ssl: isSSL ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
