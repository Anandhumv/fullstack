const { Pool } = require('pg');
require('dotenv').config();
const mockDb = require('./mockDb');

let pool = null;
let useMock = false;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 1500,
  });

  pool.query('SELECT 1').catch((err) => {
    console.log(`[Frontdesk DB] PostgreSQL connection failed (${err.message}). Using pre-seeded in-memory store.`);
    useMock = true;
  });
} else {
  console.log('[Frontdesk DB] No DATABASE_URL specified. Running with pre-seeded in-memory store.');
  useMock = true;
}

module.exports = {
  query: async (text, params) => {
    if (useMock || !pool) {
      return mockDb.query(text, params);
    }
    try {
      return await pool.query(text, params);
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.message.includes('connect')) {
        useMock = true;
        return mockDb.query(text, params);
      }
      throw err;
    }
  },
  pool: {
    connect: async () => {
      if (useMock || !pool) return mockDb.pool.connect();
      try {
        return await pool.connect();
      } catch {
        useMock = true;
        return mockDb.pool.connect();
      }
    },
    end: () => (pool ? pool.end() : Promise.resolve()),
  },
};
