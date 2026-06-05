DROP TABLE IF EXISTS price_grid CASCADE;

CREATE TABLE price_grid (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  lens_type VARCHAR(50) NOT NULL,
  index_type VARCHAR(10) NOT NULL,
  material VARCHAR(50) NOT NULL,
  base_price_cents DECIMAL(10,2) DEFAULT 0,
  selling_price_cents DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO price_grid (tenant_id, lens_type, index_type, material, base_price_cents, selling_price_cents) VALUES
('default-shop', 'unifocal', '1.5', 'organic', 20, 50),
('default-shop', 'unifocal', '1.6', 'organic', 30, 75),
('default-shop', 'unifocal', '1.67', 'organic', 45, 112.50),
('default-shop', 'progressive', '1.6', 'organic', 60, 150),
('default-shop', 'progressive', '1.67', 'organic', 80, 200),
('default-shop', 'progressive', '1.74', 'organic', 120, 300);
