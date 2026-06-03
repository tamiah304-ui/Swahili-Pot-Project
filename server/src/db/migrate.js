'use strict';

const fs = require('fs');
const path = require('path');
const pool = require('./pool');

/**
 * Runs the schema file. Every statement uses CREATE TABLE IF NOT EXISTS,
 * so this is idempotent and safe to run on every boot.
 */
async function runOnce() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    // gen_random_uuid() lives in pgcrypto on older Postgres builds.
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    await client.query(sql);

    // --- Idempotent upgrades for databases created before these features ---
    // Allow the 'admin' and 'attachee' roles; admins exist without a department.
    await client.query("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check");
    await client.query(
      "ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('supervisor', 'instructor', 'admin', 'attachee'))"
    );
    await client.query('ALTER TABLE users ALTER COLUMN department_id DROP NOT NULL');

    // Submission storage driver + optional task link (added for attachees/uploads).
    await client.query(
      "ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS file_storage VARCHAR(10)"
    );
    await client.query('ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS task_id INTEGER');

    // Intentional startup logging.
    console.log('Database migration complete — all tables ensured.');
  } finally {
    client.release();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Serverless Postgres (e.g. Neon) occasionally drops the very first
 * connection from a cold pooler. Retry a few times so boot is reliable.
 */
async function migrate(retries = 8) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      // Warm-up ping: serverless Postgres (Neon) may be suspended and return
      // ECONNREFUSED while it resumes (~3–5s). A cheap query wakes it first.
      await pool.query('SELECT 1');
      return await runOnce();
    } catch (err) {
      if (attempt > retries) throw err;
      console.error(
        `[${new Date().toISOString()}] Migration attempt ${attempt} failed (${err.code || err.message || 'connection issue'}); retrying…`
      );
      await sleep(Math.min(3000, 1000 * attempt));
    }
  }
}

// Allow running directly: `npm run migrate`
if (require.main === module) {
  require('dotenv').config();
  migrate()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}

module.exports = migrate;
