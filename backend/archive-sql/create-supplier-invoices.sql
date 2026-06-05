CREATE TABLE IF NOT EXISTS supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  invoice_number VARCHAR(100) NOT NULL,
  supplier_name VARCHAR(255) NOT NULL,
  invoice_date DATE NOT NULL,
  total_ht_cents INTEGER NOT NULL,
  total_tva_cents INTEGER NOT NULL,
  total_ttc_cents INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  payment_due_date DATE,
  payment_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supplier_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  invoice_id UUID REFERENCES supplier_invoices(id),
  lens_type VARCHAR(50) NOT NULL,
  index_type VARCHAR(10) NOT NULL,
  material VARCHAR(50) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
