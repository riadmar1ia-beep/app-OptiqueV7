-- Tables pour la gestion des verres optiques

-- Table des ordonnances
CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  patient_name VARCHAR(255) NOT NULL,
  doctor_name VARCHAR(255) NOT NULL,
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

-- Table des commandes de verres
CREATE TABLE IF NOT EXISTS lens_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  prescription_id UUID REFERENCES prescriptions(id),
  has_prescription BOOLEAN NOT NULL,
  right_eye_data JSONB NOT NULL,
  left_eye_data JSONB NOT NULL,
  total_cents INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  estimated_delivery DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP,
  notes TEXT
);

-- Table des types de verres
CREATE TABLE IF NOT EXISTS lens_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  multiplier DECIMAL(5,2) DEFAULT 1.0,
  available_indexes TEXT[],
  available_materials TEXT[]
);

-- Table des traitements
CREATE TABLE IF NOT EXISTS coatings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  price_cents INTEGER NOT NULL,
  description TEXT
);

-- Insertion des types de verres par défaut
INSERT INTO lens_types (code, name, description, multiplier, available_indexes, available_materials) VALUES
('UNIFOCAL', 'Unifocal', 'Verre simple distance unique', 1.0, ARRAY['1.5','1.6','1.67','1.74'], ARRAY['organic','mineral','polycarbonate']),
('PROGRESSIVE', 'Progressif', 'Verre progressif multifocal', 2.5, ARRAY['1.6','1.67','1.74'], ARRAY['organic','polycarbonate','trivex']),
('BIFOCAL', 'Bifocal', 'Verre bifocal deux distances', 1.5, ARRAY['1.5','1.6','1.67'], ARRAY['organic','mineral']),
('OCCUPATIONAL', 'Occupational', 'Verre travail / écran', 1.8, ARRAY['1.6','1.67','1.74'], ARRAY['organic','polycarbonate']);

-- Insertion des traitements par défaut
INSERT INTO coatings (code, name, price_cents, description) VALUES
('AR', 'Antireflet', 3000, 'Traitement antireflet haute performance'),
('PHOTO', 'Photochromique', 5000, 'Verres qui s''assombrissent à la lumière'),
('BLUE', 'Anti-lumière bleue', 2000, 'Filtre la lumière bleue des écrans'),
('SCRATCH', 'Anti-rayure', 1500, 'Résistance aux rayures'),
('FOG', 'Anti-buée', 2500, 'Empêche la formation de buée'),
('UV', 'Protection UV', 1000, 'Protection contre les rayons UV');

-- Index
CREATE INDEX IF NOT EXISTS idx_prescriptions_tenant ON prescriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_name);
CREATE INDEX IF NOT EXISTS idx_lens_orders_tenant ON lens_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lens_orders_status ON lens_orders(status);