DROP TABLE IF EXISTS price_grid CASCADE;

CREATE TABLE price_grid (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  lens_type VARCHAR(50) NOT NULL,
  index_type VARCHAR(10) NOT NULL,
  material VARCHAR(50) NOT NULL,
  base_price_cents INTEGER NOT NULL DEFAULT 0,
  selling_price_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO price_grid (tenant_id, lens_type, index_type, material, base_price_cents, selling_price_cents) VALUES
('default-shop', 'unifocal', '1.5', 'organic', 2000, 5000),
('default-shop', 'unifocal', '1.6', 'organic', 3000, 7500),
('default-shop', 'unifocal', '1.67', 'organic', 4500, 11250),
('default-shop', 'progressive', '1.6', 'organic', 6000, 15000),
('default-shop', 'progressive', '1.67', 'organic', 8000, 20000);
