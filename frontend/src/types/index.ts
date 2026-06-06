export interface Product {
  id: string;
  reference: string;
  name: string;
  description?: string;
  price_cents: number;
  tax_rate: number;
  stock: number;
  min_stock: number;
  created_at: string;
}

export interface Sale {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email?: string;
  total_cents: number;
  tax_cents?: number;
  status: 'pending' | 'paid' | 'cancelled';
  payment_method: string;
  created_at: string;
  paid_at?: string;
}

export interface SaleItem {
  id: string;
  product_id: string;
  product_name?: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
}

export interface Stats {
  revenue_euros: string;
  products: number;
  sales: number;
  pending_sales?: number;
}