-- Tables pour la séparation vente / fournisseur

-- Table des ordonnances
CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  patient_name VARCHAR(255) NOT NULL,
  patient_email VARCHAR(255),
  patient_phone VARCHAR(50),
  doctor_name VARCHAR(255) NOT NULL,
  doctor_id VARCHAR(100),
  date DATE NOT NULL,
  expires_at DATE NOT NULL,
  is_valid BOOLEAN DEFAULT true,
  document_url TEXT,
  right_sphere DECIMAL(5,2),
  right_cylinder DECIMAL(5,2),
  right_axis INTEGER,
  right_addition DECIMAL(5,2),
  left_sphere DECIMAL(5,2),
  left_cylinder DECIMAL(5,2),
  left_axis INTEGER,
  left_addition DECIMAL(5,2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des ventes (interface client)
CREATE TABLE IF NOT EXISTS sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  prescription_id UUID REFERENCES prescriptions(id),
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255),
  customer_phone VARCHAR(50),
  order_number VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  payment_method VARCHAR(50),
  payment_status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP,
  notes TEXT
);

-- Table des commandes fournisseur (données techniques uniquement)
CREATE TABLE IF NOT EXISTS supplier_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  order_id VARCHAR(100) UNIQUE NOT NULL,
  sales_order_id UUID REFERENCES sales_orders(id),
  supplier_reference VARCHAR(100),
  right_eye_config JSONB NOT NULL,
  left_eye_config JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  technical_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP,
  confirmed_at TIMESTAMP,
  delivered_at TIMESTAMP
);

-- Table des configurations techniques des verres
CREATE TABLE IF NOT EXISTS lens_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  sales_order_id UUID REFERENCES sales_orders(id),
  supplier_order_id UUID REFERENCES supplier_orders(id),
  right_eye_technical JSONB NOT NULL,
  left_eye_technical JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des prix (séparés par rôle)
CREATE TABLE IF NOT EXISTS lens_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lens_type VARCHAR(50) NOT NULL,
  index_type VARCHAR(10) NOT NULL,
  material VARCHAR(50) NOT NULL,
  purchase_price_cents INTEGER NOT NULL,
  selling_price_cents INTEGER NOT NULL,
  margin_percentage DECIMAL(5,2),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lens_type, index_type, material)
);

-- Insertion des prix par défaut
INSERT INTO lens_pricing (lens_type, index_type, material, purchase_price_cents, selling_price_cents, margin_percentage) VALUES
('unifocal', '1.5', 'organic', 2000, 5000, 150),
('unifocal', '1.6', 'organic', 3000, 7500, 150),
('unifocal', '1.67', 'organic', 4500, 11250, 150),
('unifocal', '1.74', 'organic', 7000, 17500, 150),
('progressive', '1.6', 'organic', 6000, 15000, 150),
('progressive', '1.67', 'organic', 8000, 20000, 150),
('progressive', '1.74', 'organic', 12000, 30000, 150),
('bifocal', '1.5', 'mineral', 3500, 8750, 150),
('bifocal', '1.6', 'mineral', 5000, 12500, 150),
('occupational', '1.6', 'polycarbonate', 5500, 13750, 150);

-- Table des traitements avec prix séparés
CREATE TABLE IF NOT EXISTS coating_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coating_code VARCHAR(50) NOT NULL,
  coating_name VARCHAR(255) NOT NULL,
  purchase_price_cents INTEGER NOT NULL,
  selling_price_cents INTEGER NOT NULL,
  UNIQUE(coating_code)
);

INSERT INTO coating_pricing (coating_code, coating_name, purchase_price_cents, selling_price_cents) VALUES
('AR', 'Antireflet', 1500, 3000),
('PHOTO', 'Photochromique', 2500, 5000),
('BLUE', 'Anti-lumière bleue', 1000, 2000),
('SCRATCH', 'Anti-rayure', 800, 1500),
('FOG', 'Anti-buée', 1200, 2500),
('UV', 'Protection UV', 500, 1000);

-- Index pour performance
CREATE INDEX idx_sales_orders_tenant ON sales_orders(tenant_id);
CREATE INDEX idx_sales_orders_customer ON sales_orders(customer_name);
CREATE INDEX idx_supplier_orders_order_id ON supplier_orders(order_id);
CREATE INDEX idx_supplier_orders_status ON supplier_orders(status);
CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_name);