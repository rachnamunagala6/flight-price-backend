const { Pool } = require('pg');

// Neon (and most hosted Postgres) require SSL; rejectUnauthorized:false is the
// standard workaround for their auto-generated certs not chaining to a local CA.
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

async function initSchema() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trips (
      code TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function tripExists(code) {
  const { rows } = await pool.query('SELECT 1 FROM trips WHERE code = $1', [code]);
  return rows.length > 0;
}

async function getTrip(code) {
  const { rows } = await pool.query('SELECT data FROM trips WHERE code = $1', [code]);
  return rows[0] ? rows[0].data : null;
}

async function insertTrip(code, data) {
  await pool.query('INSERT INTO trips (code, data) VALUES ($1, $2)', [code, data]);
}

async function updateTrip(code, data) {
  const { rowCount } = await pool.query(
    'UPDATE trips SET data = $2, updated_at = now() WHERE code = $1',
    [code, data]
  );
  return rowCount > 0;
}

module.exports = { pool, initSchema, tripExists, getTrip, insertTrip, updateTrip };
