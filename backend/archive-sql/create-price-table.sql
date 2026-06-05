CREATE TABLE IF NOT EXISTS price_grid (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  lens_type VARCHAR(50) NOT NULL,
  index_type VARCHAR(10) NOT NULL,
  material VARCHAR(50) NOT NULL,
  base_price_cents INTEGER NOT NULL DEFAULT 0,
  coating_price_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, lens_type, index_type, material)
);

INSERT INTO price_grid (tenant_id, lens_type, index_type, material, base_price_cents, coating_price_cents) VALUES
('default-shop', 'unifocal', '1.5', 'organic', 5000, 1000),
('default-shop', 'unifocal', '1.6', 'organic', 7500, 1000),
('default-shop', 'unifocal', '1.67', 'organic', 11250, 1000),
('default-shop', 'progressive', '1.6', 'organic', 15000, 1500),
('default-shop', 'progressive', '1.67', 'organic', 20000, 1500),
('default-shop', 'progressive', '1.74', 'organic', 30000, 1500),
('default-shop', 'bifocal', '1.5', 'mineral', 8750, 1200),
('default-shop', 'occupational', '1.6', 'polycarbonate', 13750, 1400)
ON CONFLICT (tenant_id, lens_type, index_type, material) DO NOTHING;
