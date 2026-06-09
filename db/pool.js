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
  console.log('Migrations appliquees');

  // ── Compte superadmin garanti ─────────────────────────────────
  // Si SUPERADMIN_EMAIL + SUPERADMIN_PASSWORD sont definis :
  // - crée le compte s'il n'existe pas
  // - sinon met à jour le mot de passe ET force le role superadmin
  // Idempotent : sans danger à chaque redémarrage
  const email    = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.SUPERADMIN_PASSWORD?.trim();

  if (email && password) {
    try {
      const bcrypt = require('bcryptjs');
      const hash   = await bcrypt.hash(password, 12);
      const nom    = process.env.SUPERADMIN_NOM?.trim() || 'Super Admin PFS';

      await pool.query(`
        INSERT INTO users (nom, email, password, rizerie, role)
        VALUES ($1, $2, $3, 'PFS Administration', 'superadmin')
        ON CONFLICT (email) DO UPDATE
          SET password = EXCLUDED.password,
              role     = 'superadmin',
              suspended = FALSE
      `, [nom, email, hash]);

      console.log(`Superadmin OK : ${email}`);
    } catch (err) {
      console.error('Erreur creation superadmin:', err.message);
    }
  }
}

module.exports = { pool, initSchema, runMigrations };
