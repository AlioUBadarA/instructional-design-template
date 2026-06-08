-- Migration : Superadmin + Audit
-- À exécuter UNE SEULE FOIS sur la base Render

-- 1. Colonnes sur users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role            VARCHAR(20) NOT NULL DEFAULT 'rizier'
    CHECK (role IN ('rizier','superadmin')),
  ADD COLUMN IF NOT EXISTS suspended       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspended_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

-- 2. Table audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_nom   VARCHAR(120),
  action      VARCHAR(80) NOT NULL,
  target_id   UUID,
  target_nom  VARCHAR(150),
  detail      JSONB,
  ip          VARCHAR(45),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_logs(actor_id);

-- 3. Passe TON compte en superadmin (remplace l'email)
-- UPDATE users SET role = 'superadmin' WHERE email = 'ton@email.com';
