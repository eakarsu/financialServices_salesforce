const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const pool = require('./db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [714_2026]);
    await client.query(`CREATE TABLE IF NOT EXISTS sales_schema_migrations (
      name text PRIMARY KEY, sha256 char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const directory = path.resolve(__dirname, 'migrations');
    for (const name of (await fs.readdir(directory)).filter((entry) => /^\d+_[a-z0-9_]+\.sql$/.test(entry)).sort()) {
      const sql = await fs.readFile(path.join(directory, name), 'utf8');
      const sha256 = crypto.createHash('sha256').update(sql).digest('hex');
      const prior = await client.query('SELECT sha256 FROM sales_schema_migrations WHERE name=$1', [name]);
      if (prior.rowCount) {
        if (prior.rows[0].sha256 !== sha256) throw new Error(`Migration checksum changed: ${name}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO sales_schema_migrations(name,sha256) VALUES($1,$2)', [name, sha256]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [714_2026]).catch(() => {});
    client.release();
  }
}

if (require.main === module) migrate().then(() => pool.end()).then(() => console.log('Sales migrations applied')).catch(async (error) => { console.error(error.message); await pool.end(); process.exitCode = 1; });
module.exports = { migrate };
