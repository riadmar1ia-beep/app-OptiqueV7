// backend/routes/stock.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// =======================
// GET /api/stock/products - Vue du stock des produits
// =======================
router.get('/products', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         p.id, p.reference, p.name,
         COALESCE(SUM(CASE WHEN sm.type = 'IN' THEN sm.quantity ELSE -sm.quantity END), 0) as stock_physical,
         p.reserved_quantity,
         (COALESCE(SUM(CASE WHEN sm.type = 'IN' THEN sm.quantity ELSE -sm.quantity END), 0) - p.reserved_quantity) as stock_available
       FROM products p
       LEFT JOIN stock_movements sm ON sm.product_id = p.id AND sm.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1 AND p.deleted_at IS NULL
       GROUP BY p.id
       ORDER BY p.name`,
      [req.tenantId]
    );
    
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erreur GET stock/products:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/stock/movements - Historique des mouvements de stock
// =======================
router.get('/movements', async (req, res) => {
  const { product_id, limit = 100 } = req.query;
  
  try {
    let query = `
      SELECT sm.*, p.reference, p.name
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      WHERE sm.tenant_id = $1
    `;
    const params = [req.tenantId];
    let paramIndex = 2;
    
    if (product_id) {
      query += ` AND sm.product_id = $${paramIndex}`;
      params.push(product_id);
      paramIndex++;
    }
    
    query += ` ORDER BY sm.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erreur GET stock/movements:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/stock/low-stock - Produits en stock faible
// =======================
router.get('/low-stock', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         p.id, p.reference, p.name, p.min_stock,
         COALESCE(SUM(CASE WHEN sm.type = 'IN' THEN sm.quantity ELSE -sm.quantity END), 0) as stock_physical
       FROM products p
       LEFT JOIN stock_movements sm ON sm.product_id = p.id AND sm.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1 
         AND p.deleted_at IS NULL
         AND p.min_stock > 0
       GROUP BY p.id
       HAVING COALESCE(SUM(CASE WHEN sm.type = 'IN' THEN sm.quantity ELSE -sm.quantity END), 0) <= p.min_stock
       ORDER BY (COALESCE(SUM(CASE WHEN sm.type = 'IN' THEN sm.quantity ELSE -sm.quantity END), 0) / p.min_stock) ASC`,
      [req.tenantId]
    );
    
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erreur GET stock/low-stock:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/stock/value - Valeur totale du stock
// =======================
router.get('/value', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         COALESCE(SUM(p.purchase_price_cents * 
           COALESCE(SUM(CASE WHEN sm.type = 'IN' THEN sm.quantity ELSE -sm.quantity END), 0)), 0) as total_value_cents
       FROM products p
       LEFT JOIN stock_movements sm ON sm.product_id = p.id AND sm.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND p.purchase_price_cents > 0
       GROUP BY p.id`,
      [req.tenantId]
    );
    
    const totalValueCents = result.rows.reduce((sum, row) => sum + parseFloat(row.total_value_cents), 0);
    
    res.json({ 
      success: true, 
      data: {
        total_value_dh: (totalValueCents / 100).toFixed(2),
        total_value_cents: totalValueCents
      }
    });
  } catch (err) {
    console.error('Erreur GET stock/value:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// POST /api/stock/adjust - Ajuster le stock manuellement
// =======================
router.post('/adjust', async (req, res) => {
  const { product_id, quantity, reason, notes } = req.body;
  const dbClient = await pool.connect();
  
  try {
    await dbClient.query('BEGIN');
    
    // Vérifier que le produit existe
    const product = await dbClient.query(
      'SELECT id, reference, name FROM products WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [product_id, req.tenantId]
    );
    
    if (product.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
    
    // Ajouter le mouvement de stock
    await dbClient.query(
      `INSERT INTO stock_movements 
       (tenant_id, product_id, type, quantity, source_type, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [req.tenantId, product_id, quantity > 0 ? 'IN' : 'OUT', Math.abs(quantity), 'adjustment', notes || reason || null]
    );
    
    await dbClient.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: `Stock ajusté: ${quantity > 0 ? '+' : ''}${quantity} unités pour ${product.rows[0].name}` 
    });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Erreur POST stock/adjust:', err);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// =======================
// GET /api/stock/reception-history - Historique des réceptions fournisseurs
// =======================
router.get('/reception-history', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sm.*, p.reference, p.name
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
       WHERE sm.tenant_id = $1 AND sm.type = 'IN' AND sm.source_type = 'Fournisseur'
       ORDER BY sm.created_at DESC`,
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erreur GET stock/reception-history:', err);
    res.status(500).json({ error: err.message });
  }
});
// =======================
// POST /api/stock/in - Enregistrement d'une réception fournisseur
// =======================
// =======================
// GET /stock/product/:code - Retrieve product by barcode, sku, or reference
// =======================
router.get('/product/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, barcode, sku, reference, name FROM products 
       WHERE (barcode = $1 OR sku = $1 OR reference = $1) 
         AND tenant_id = $2 AND deleted_at IS NULL`,
      [code, req.tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur GET stock/product/:code:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// POST /stock/bulk-in - Batch reception of multiple items
// =======================
router.post('/bulk-in', async (req, res) => {
  const { items } = req.body; // [{ barcode, qty, source }]
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      const { barcode, qty, source } = item;
      const prodRes = await client.query(
        `SELECT id, name FROM products 
         WHERE (barcode = $1 OR sku = $1 OR reference = $1) 
           AND tenant_id = $2 AND deleted_at IS NULL`,
        [barcode, req.tenantId]
      );
      if (prodRes.rows.length === 0) {
        // skip unknown product
        continue;
      }
      const productId = prodRes.rows[0].id;
      await client.query(
        `INSERT INTO stock_movements 
          (tenant_id, product_id, type, quantity, source_type, notes, created_at)
         VALUES ($1, $2, 'IN', $3, $4, NULL, NOW())`,
        [req.tenantId, productId, qty, source || 'Fournisseur']
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, message: 'Réceptions enregistrées' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erreur POST stock/bulk-in:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Duplicate POST /in route removed
module.exports = router;