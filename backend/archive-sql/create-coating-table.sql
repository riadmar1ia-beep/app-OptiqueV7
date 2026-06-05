CREATE TABLE IF NOT EXISTS coating_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  coating_code VARCHAR(50) NOT NULL,
  coating_name VARCHAR(255) NOT NULL,
  purchase_price_cents INTEGER NOT NULL DEFAULT 0,
  selling_price_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, coating_code)
);

INSERT INTO coating_pricing (tenant_id, coating_code, coating_name, purchase_price_cents, selling_price_cents)
VALUES 
  ('default-shop', 'AR', 'Antireflet', 1500, 3000),
  ('default-shop', 'PHOTO', 'Photochromique', 2500, 5000),
  ('default-shop', 'BLUE', 'Anti-lumiere bleue', 1000, 2000),
  ('default-shop', 'SCRATCH', 'Anti-rayure', 800, 1500),
  ('default-shop', 'FOG', 'Anti-buee', 1200, 2500),
  ('default-shop', 'UV', 'Protection UV', 500, 1000)
ON CONFLICT (tenant_id, coating_code) DO NOTHING;
