const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Erreur pool PostgreSQL:', err.message);
});

// Initialise le schema au demarrage
async function initSchema() {
  const fs = require('fs');
  const path = require('path');
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Schema PostgreSQL initialise');
  } catch (err) {
    console.error('Erreur initialisation schema:', err.message);
    throw err;
  }
}

// Migration superadmin — idempotente (IF NOT EXISTS), sans risque
async function runMigrations() {
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'rizier' CHECK (role IN ('rizier','superadmin'))`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_reason TEXT`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
      actor_nom   VARCHAR(120),
      action      VARCHAR(80) NOT NULL,
      target_id   UUID,
      target_nom  VARCHAR(150),
      detail      JSONB,
      ip          VARCHAR(45),
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_logs(actor_id)`,
  ];

  for (const sql of migrations) {
    try {
      await pool.query(sql);
    } catch (err) {
      console.error('Migration error:', err.message);
    }
  }
  console.log('Migrations superadmin appliquees');

  // Passage en superadmin via variable d'environnement
  if (process.env.SUPERADMIN_EMAIL) {
    try {
      const r = await pool.query(
        `UPDATE users SET role = 'superadmin' WHERE email = $1`,
        [process.env.SUPERADMIN_EMAIL.toLowerCase().trim()]
      );
      if (r.rowCount > 0) {
        console.log(`Superadmin defini : ${process.env.SUPERADMIN_EMAIL}`);
      } else {
        console.warn(`SUPERADMIN_EMAIL: aucun utilisateur trouve avec ${process.env.SUPERADMIN_EMAIL}`);
      }
    } catch (err) {
      console.error('Erreur passage superadmin:', err.message);
    }
  }

  // Reset mot de passe via variable d'environnement
  if (process.env.RESET_PASSWORD_EMAIL && process.env.RESET_PASSWORD_VALUE) {
    try {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash(process.env.RESET_PASSWORD_VALUE, 12);
      const r = await pool.query(
        `UPDATE users SET password = $1 WHERE email = $2`,
        [hash, process.env.RESET_PASSWORD_EMAIL.toLowerCase().trim()]
      );
      if (r.rowCount > 0) {
        console.log(`Mot de passe reinitialise pour : ${process.env.RESET_PASSWORD_EMAIL}`);
      } else {
        console.warn(`RESET_PASSWORD_EMAIL: aucun utilisateur trouve avec ${process.env.RESET_PASSWORD_EMAIL}`);
      }
    } catch (err) {
      console.error('Erreur reset mot de passe:', err.message);
    }
  }
}

module.exports = { pool, initSchema, runMigrations };
