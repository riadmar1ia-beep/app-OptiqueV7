DROP TABLE IF EXISTS prescriptions CASCADE;

CREATE TABLE prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  client_id UUID,
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
