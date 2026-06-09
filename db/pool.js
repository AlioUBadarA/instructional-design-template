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

// Migrations — idempotentes, sans risque
async function runMigrations() {
  console.log('[MIG] Debut runMigrations...');
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

  for (let i = 0; i < migrations.length; i++) {
    try {
      await pool.query(migrations[i]);
      console.log(`[MIG] Step ${i + 1}/${migrations.length} OK`);
    } catch (err) {
      console.error(`[MIG] Step ${i + 1} error:`, err.message);
    }
  }
  console.log('[MIG] Migrations appliquees');

  // ── Compte superadmin garanti ──────────────────────────────────
  const email    = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.SUPERADMIN_PASSWORD?.trim();
  const nom      = process.env.SUPERADMIN_NOM?.trim() || 'Super Admin PFS';

  console.log(`[MIG] SUPERADMIN_EMAIL: ${email || 'NON DEFINI'}`);
  console.log(`[MIG] SUPERADMIN_PASSWORD: ${password ? '***set***' : 'NON DEFINI'}`);

  if (email && password) {
    try {
      const bcrypt = require('bcryptjs');
      console.log('[MIG] Hachage du mot de passe...');
      const hash = await bcrypt.hash(password, 10);
      console.log('[MIG] Hash OK, upsert en cours...');

      await pool.query(`
        INSERT INTO users (nom, email, password, rizerie, role)
        VALUES ($1, $2, $3, 'PFS Administration', 'superadmin')
        ON CONFLICT (email) DO UPDATE
          SET password  = EXCLUDED.password,
              role      = 'superadmin',
              suspended = FALSE
      `, [nom, email, hash]);

      console.log(`[MIG] Superadmin OK : ${email}`);
    } catch (err) {
      console.error('[MIG] Erreur creation superadmin:', err.message);
    }
  } else {
    console.log('[MIG] Pas de superadmin a creer (variables manquantes)');
  }
}

module.exports = { pool, initSchema, runMigrations };
