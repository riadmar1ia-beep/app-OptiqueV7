ALTER TABLE users 
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100) DEFAULT 'default_tenant';

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- Mettre ? jour les utilisateurs existants
UPDATE users SET tenant_id = 'default_tenant' WHERE tenant_id IS NULL;
