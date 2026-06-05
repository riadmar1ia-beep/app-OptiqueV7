CREATE TABLE IF NOT EXISTS sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  sales_order_id UUID REFERENCES sales_orders(id) ON DELETE CASCADE,
  item_type VARCHAR(50) NOT NULL,
  product_id UUID REFERENCES products(id),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  sales_order_id UUID REFERENCES sales_orders(id),
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  invoice_date DATE NOT NULL,
  amount_ht_cents INTEGER NOT NULL DEFAULT 0,
  amount_tva_cents INTEGER NOT NULL DEFAULT 0,
  amount_ttc_cents INTEGER NOT NULL DEFAULT 0,
  deposit_cents INTEGER DEFAULT 0,
  remaining_cents INTEGER DEFAULT 0,
  insurance_coverage_cents INTEGER DEFAULT 0,
  payment_status VARCHAR(50) DEFAULT 'unpaid',
  payment_date DATE,
  payment_method VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  invoice_id UUID REFERENCES sales_invoices(id) ON DELETE CASCADE,
  sales_order_item_id UUID REFERENCES sales_order_items(id),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved_quantity INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS available_quantity INTEGER GENERATED ALWAYS AS (stock - reserved_quantity) STORED;

CREATE INDEX IF NOT EXISTS idx_sales_order_items_order ON sales_order_items(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_order ON sales_invoices(sales_order_id);
