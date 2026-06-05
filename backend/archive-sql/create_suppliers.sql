CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  commercial_name VARCHAR(255),
  ice VARCHAR(15),
  if VARCHAR(20),
  rc VARCHAR(50),
  cnss VARCHAR(50),
  patente VARCHAR(50),
  address TEXT NOT NULL,
  city VARCHAR(100),
  postal_code VARCHAR(10),
  phone VARCHAR(50) NOT NULL,
  fax VARCHAR(50),
  email VARCHAR(255),
  website VARCHAR(255),
  contact_name VARCHAR(255),
  contact_phone VARCHAR(50),
  contact_email VARCHAR(255),
  bank_name VARCHAR(255),
  bank_account_number VARCHAR(100),
  bank_rib VARCHAR(100),
  bank_iban VARCHAR(100),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);

INSERT INTO suppliers (tenant_id, name, commercial_name, ice, if, rc, cnss, patente, address, city, phone, email) VALUES
('default-shop', 'Essilor Maroc', 'Essilor', '001234567890123', '12345678', '12345', '987654321', '12345678', '123 Boulevard Mohammed V', 'Casablanca', '0522123456', 'contact@essilor.ma'),
('default-shop', 'Zeiss Maroc', 'Zeiss Optics', '001234567890124', '12345679', '12346', '987654322', '12345679', '45 Avenue Hassan II', 'Rabat', '0537123456', 'contact@zeiss.ma'),
('default-shop', 'Hoya Lens Maroc', 'Hoya', '001234567890125', '12345680', '12347', '987654323', '12345680', '78 Rue Allal Ben Abdellah', 'Casablanca', '0522345678', 'contact@hoya.ma')
ON CONFLICT DO NOTHING;
