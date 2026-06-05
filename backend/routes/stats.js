// backend/routes/stats.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// =======================
// GET /api/stats - Statistiques générales
// =======================
router.get('/', async (req, res) => {
  try {
    const revenue = await pool.query(
      "SELECT COALESCE(SUM(total_cents), 0) as total FROM sales WHERE tenant_id = $1 AND status = 'paid'",
      [req.tenantId]
    );

    res.json({
      success: true,
      data: {
        revenue_euros: (revenue.rows[0].total / 100).toFixed(2)
      }
    });
  } catch (err) {
    console.error('Erreur GET stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/stats/dashboard - KPIs tableau de bord
// =======================
router.get('/dashboard', async (req, res) => {
  try {
    // Chiffre d'affaires du jour
    const todayRevenue = await pool.query(
      `SELECT COALESCE(SUM(amount_ttc_cents), 0) as total 
       FROM sales_invoices 
       WHERE tenant_id = $1 AND DATE(created_at) = CURRENT_DATE`,
      [req.tenantId]
    );

    // Nombre de commandes en attente
    const pendingOrders = await pool.query(
      `SELECT COUNT(*) as count 
       FROM core_sales_order 
       WHERE tenant_id = $1 AND status = 'pending'`,
      [req.tenantId]
    );

    // Nombre de commandes fournisseur à recevoir
    const supplierOrdersPending = await pool.query(
      `SELECT COUNT(*) as count 
       FROM supplier_orders 
       WHERE tenant_id = $1 AND status = 'shipped'`,
      [req.tenantId]
    );

    // Nombre de litiges actifs
    const activeDisputes = await pool.query(
      `SELECT COUNT(*) as count 
       FROM supplier_orders 
       WHERE tenant_id = $1 AND status = 'dispute'`,
      [req.tenantId]
    );

    // Stock faible
    const lowStock = await pool.query(
      `SELECT COUNT(*) as count 
       FROM products p
       LEFT JOIN stock_movements sm ON sm.product_id = p.id AND sm.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1 
         AND p.deleted_at IS NULL 
         AND p.min_stock > 0
       GROUP BY p.id, p.min_stock
       HAVING COALESCE(SUM(CASE WHEN sm.type = 'IN' THEN sm.quantity ELSE -sm.quantity END), 0) <= p.min_stock`,
      [req.tenantId]
    );

    res.json({
      success: true,
      data: {
        today_revenue_dh: (todayRevenue.rows[0].total / 100).toFixed(2),
        pending_orders: parseInt(pendingOrders.rows[0].count),
        supplier_orders_pending: parseInt(supplierOrdersPending.rows[0].count),
        active_disputes: parseInt(activeDisputes.rows[0].count),
        low_stock_products: parseInt(lowStock.rows.length || 0)
      }
    });
  } catch (err) {
    console.error('Erreur GET stats/dashboard:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/stats/sales - Ventes par période
// =======================
router.get('/sales', async (req, res) => {
  const { period = 'month' } = req.query;
  
  try {
    let groupBy;
    let dateFormat;
    
    switch (period) {
      case 'day':
        groupBy = 'HOUR';
        dateFormat = 'HH24:00';
        break;
      case 'week':
        groupBy = 'DAY';
        dateFormat = 'Day';
        break;
      case 'month':
        groupBy = 'DAY';
        dateFormat = 'DD/MM';
        break;
      case 'year':
        groupBy = 'MONTH';
        dateFormat = 'Month';
        break;
      default:
        groupBy = 'DAY';
        dateFormat = 'DD/MM';
    }
    
    const result = await pool.query(
      `SELECT 
         DATE_TRUNC($1, created_at) as period,
         COALESCE(SUM(amount_ttc_cents), 0) as total_cents
       FROM sales_invoices
       WHERE tenant_id = $2
       GROUP BY DATE_TRUNC($1, created_at)
       ORDER BY period DESC
       LIMIT 30`,
      [period === 'day' ? 'hour' : period === 'week' ? 'day' : period === 'year' ? 'month' : 'day', req.tenantId]
    );
    
    const data = result.rows.map(row => ({
      period: row.period,
      total_dh: (parseFloat(row.total_cents) / 100).toFixed(2)
    }));
    
    res.json({ success: true, data });
  } catch (err) {
    console.error('Erreur GET stats/sales:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/stats/top-products - Produits les plus vendus
// =======================
router.get('/top-products', async (req, res) => {
  const { limit = 10 } = req.query;
  
  try {
    const result = await pool.query(
      `SELECT 
         p.id, p.reference, p.name,
         COUNT(sii.id) as sale_count,
         SUM(sii.quantity) as total_quantity,
         SUM(sii.total_cents) as total_revenue_cents
       FROM sales_invoice_items sii
       JOIN products p ON p.id = sii.product_id
       WHERE sii.tenant_id = $1 AND sii.product_id IS NOT NULL
       GROUP BY p.id, p.reference, p.name
       ORDER BY total_quantity DESC
       LIMIT $2`,
      [req.tenantId, parseInt(limit)]
    );
    
    const data = result.rows.map(row => ({
      ...row,
      total_revenue_dh: (parseFloat(row.total_revenue_cents) / 100).toFixed(2)
    }));
    
    res.json({ success: true, data });
  } catch (err) {
    console.error('Erreur GET stats/top-products:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;