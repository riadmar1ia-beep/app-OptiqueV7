-- Table des clients
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  address TEXT,
  date_of_birth DATE,
  insurance_company VARCHAR(255),
  insurance_number VARCHAR(100),
  insurance_rate DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Table des ordonnances
CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  client_id UUID REFERENCES clients(id),
  doctor_name VARCHAR(255) NOT NULL,
  doctor_phone VARCHAR(50),
  date_of_issue DATE NOT NULL,
  expiry_date DATE NOT NULL,
  od_sphere DECIMAL(5,2),
  od_cylinder DECIMAL(5,2),
  od_axis INTEGER,
  od_addition DECIMAL(5,2),
  og_sphere DECIMAL(5,2),
  og_cylinder DECIMAL(5,2),
  og_axis INTEGER,
  og_addition DECIMAL(5,2),
  pupillary_distance DECIMAL(5,2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_prescriptions_client ON prescriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_expiry ON prescriptions(expiry_date);
