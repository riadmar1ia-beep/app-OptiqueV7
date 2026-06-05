-- Ajouter les colonnes expected_price et actual_price ? supplier_orders
ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS expected_price_cents INTEGER DEFAULT 0;
ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS actual_price_cents INTEGER DEFAULT 0;
ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS invoice_id UUID;

-- Cr?er la table des paiements
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  invoice_id UUID NOT NULL,
  amount_cents INTEGER NOT NULL,
  payment_method VARCHAR(50),
  payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reference VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ajouter le statut paiement ? supplier_orders
ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending';
