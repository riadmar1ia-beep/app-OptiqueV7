// backend/routes/products.js - Version corrigée sans stock_quantity
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Middleware pour obtenir tenant_id
const getTenantId = (req) => req.headers['x-tenant-id'] || 'default-shop';

// =======================
// GET /api/products - Liste tous les produits
// =======================
router.get('/', async (req, res) => {
  const tenantId = getTenantId(req);

  try {
    const result = await pool.query(
      `SELECT p.*,
              COALESCE(csv.available_stock, 0) as current_stock
       FROM products p
       LEFT JOIN core_stock_view csv ON csv.product_id = p.id
       WHERE p.tenant_id = $1
         AND p.deleted_at IS NULL
       ORDER BY p.is_featured DESC, p.created_at DESC`,
      [tenantId]
    );

    res.json({
      success: true,
      data: result.rows
    });

  } catch (err) {
    console.error('Erreur GET /products:', err);
    res.status(500).json({
      error: err.message
    });
  }
});

// =======================
// GET /api/products/export - Exporter les produits
// =======================
router.get('/export', async (req, res) => {
  const tenantId = getTenantId(req);
  
  try {
    const result = await pool.query(
      `SELECT * FROM products 
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [tenantId]
    );
    
    const headers = ['id', 'reference', 'name', 'price_cents', 'created_at'];
    const csvRows = [headers.join(',')];
    
    for (const product of result.rows) {
      const values = headers.map(header => {
        const value = product[header] || '';
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=products.csv');
    res.send(csvRows.join('\n'));
  } catch (err) {
    console.error('Erreur GET /products/export:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/products/low-stock - Produits en stock faible (basé sur stock_movements)
// =======================
router.get('/low-stock', async (req, res) => {
  const tenantId = getTenantId(req);
  
  try {
    const result = await pool.query(
      `SELECT p.*, 
              COALESCE(SUM(CASE WHEN sm.type = 'IN' THEN sm.quantity ELSE 0 END), 0) as stock_quantity
       FROM products p
       LEFT JOIN stock_movements sm ON sm.product_id = p.id AND sm.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1 AND p.deleted_at IS NULL
       GROUP BY p.id
       HAVING COALESCE(SUM(CASE WHEN sm.type = 'IN' THEN sm.quantity ELSE 0 END), 0) <= p.min_stock
         AND p.min_stock > 0`,
      [tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erreur GET /products/low-stock:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/products/featured - Produits en vedette
// =======================
router.get('/featured', async (req, res) => {
  const tenantId = getTenantId(req);
  
  try {
    const result = await pool.query(
      `SELECT * FROM products 
       WHERE tenant_id = $1 AND deleted_at IS NULL AND is_featured = true`,
      [tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erreur GET /products/featured:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/products/tags - Récupérer tous les tags
// =======================
router.get('/tags', async (req, res) => {
  const tenantId = getTenantId(req);
  
  try {
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'product_tags'
      )
    `);
    
    if (!tableExists.rows[0].exists) {
      return res.json({ success: true, data: [] });
    }
    
    const result = await pool.query(
      `SELECT DISTINCT pt.tag
       FROM product_tags pt
       JOIN products p ON pt.product_id = p.id
       WHERE p.tenant_id = $1 AND p.deleted_at IS NULL
       ORDER BY pt.tag`,
      [tenantId]
    );
    
    const tags = result.rows.map(row => row.tag);
    res.json({ success: true, data: tags });
  } catch (err) {
    console.error('Erreur GET /products/tags:', err);
    res.json({ success: true, data: [] });
  }
});

// =======================
// GET /api/products/sku/:sku - Recherche par SKU
// =======================
router.get('/sku/:sku', async (req, res) => {
  const tenantId = getTenantId(req);
  const { sku } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT * FROM products 
       WHERE sku = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [sku, tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur GET /products/sku/:sku:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/products/barcode/:barcode - Recherche par code-barres
// =======================
router.get('/barcode/:barcode', async (req, res) => {
  const tenantId = getTenantId(req);
  const { barcode } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT * FROM products 
       WHERE barcode = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [barcode, tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur GET /products/barcode/:barcode:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/products/:id - Détail d'un produit
// =======================
router.get('/:id', async (req, res) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return res.status(400).json({ error: 'Format d\'ID invalide' });
  }
  
  try {
    const result = await pool.query(
      `SELECT * FROM products 
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur GET /products/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// POST /api/products - Créer un produit
// =======================
router.post('/', async (req, res) => {
  const tenantId = getTenantId(req);
  const {
    reference, sku, barcode, name, description,
    price_cents, purchase_price_cents, margin_percent,
    min_stock, location,
    frame_type, gender, shape, material,
    frame_color, temple_color, size_code,
    lens_width, bridge_width, temple_length, lens_height,
    base_curve, rim_type, accessory_type, compatible_with,
    consumable, is_featured, is_active, supplier_id,
    frame_brand, frame_model
  } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO products (
        tenant_id, reference, name, price_cents, 
        min_stock, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *`,
      [
        tenantId, 
        reference || 'REF-' + Date.now(), 
        name || 'Nouveau produit', 
        price_cents || 0, 
        min_stock || 0
      ]
    );
    
    const product = result.rows[0];
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;
    
    // Colonnes exactes de la table (sans stock_quantity)
    if (sku !== undefined && sku !== null) { updateFields.push(`sku = $${paramIndex}`); updateValues.push(sku); paramIndex++; }
    if (barcode !== undefined && barcode !== null) { updateFields.push(`barcode = $${paramIndex}`); updateValues.push(barcode); paramIndex++; }
    if (description !== undefined && description !== null) { updateFields.push(`description = $${paramIndex}`); updateValues.push(description); paramIndex++; }
    if (purchase_price_cents !== undefined && purchase_price_cents !== null) { updateFields.push(`purchase_price_cents = $${paramIndex}`); updateValues.push(purchase_price_cents); paramIndex++; }
    if (margin_percent !== undefined && margin_percent !== null) { updateFields.push(`margin_percent = $${paramIndex}`); updateValues.push(margin_percent); paramIndex++; }
    if (location !== undefined && location !== null) { updateFields.push(`location = $${paramIndex}`); updateValues.push(location); paramIndex++; }
    if (frame_type !== undefined && frame_type !== null) { updateFields.push(`frame_type = $${paramIndex}`); updateValues.push(frame_type); paramIndex++; }
    if (gender !== undefined && gender !== null) { updateFields.push(`gender = $${paramIndex}`); updateValues.push(gender); paramIndex++; }
    if (shape !== undefined && shape !== null) { updateFields.push(`shape = $${paramIndex}`); updateValues.push(shape); paramIndex++; }
    if (material !== undefined && material !== null) { updateFields.push(`material = $${paramIndex}`); updateValues.push(material); paramIndex++; }
    if (frame_color !== undefined && frame_color !== null) { updateFields.push(`frame_color = $${paramIndex}`); updateValues.push(frame_color); paramIndex++; }
    if (temple_color !== undefined && temple_color !== null) { updateFields.push(`temple_color = $${paramIndex}`); updateValues.push(temple_color); paramIndex++; }
    if (size_code !== undefined && size_code !== null) { updateFields.push(`size_code = $${paramIndex}`); updateValues.push(size_code); paramIndex++; }
    if (lens_width !== undefined && lens_width !== null) { updateFields.push(`lens_width = $${paramIndex}`); updateValues.push(lens_width); paramIndex++; }
    if (bridge_width !== undefined && bridge_width !== null) { updateFields.push(`bridge_width = $${paramIndex}`); updateValues.push(bridge_width); paramIndex++; }
    if (temple_length !== undefined && temple_length !== null) { updateFields.push(`temple_length = $${paramIndex}`); updateValues.push(temple_length); paramIndex++; }
    if (lens_height !== undefined && lens_height !== null) { updateFields.push(`lens_height = $${paramIndex}`); updateValues.push(lens_height); paramIndex++; }
    if (base_curve !== undefined && base_curve !== null) { updateFields.push(`base_curve = $${paramIndex}`); updateValues.push(base_curve); paramIndex++; }
    if (rim_type !== undefined && rim_type !== null) { updateFields.push(`rim_type = $${paramIndex}`); updateValues.push(rim_type); paramIndex++; }
    if (accessory_type !== undefined && accessory_type !== null) { updateFields.push(`accessory_type = $${paramIndex}`); updateValues.push(accessory_type); paramIndex++; }
    if (compatible_with !== undefined && compatible_with !== null) { updateFields.push(`compatible_with = $${paramIndex}`); updateValues.push(compatible_with); paramIndex++; }
    if (consumable !== undefined && consumable !== null) { updateFields.push(`consumable = $${paramIndex}`); updateValues.push(consumable); paramIndex++; }
    if (is_featured !== undefined && is_featured !== null) { updateFields.push(`is_featured = $${paramIndex}`); updateValues.push(is_featured); paramIndex++; }
    if (is_active !== undefined && is_active !== null) { updateFields.push(`is_active = $${paramIndex}`); updateValues.push(is_active); paramIndex++; }
    if (supplier_id !== undefined && supplier_id !== null) { updateFields.push(`supplier_id = $${paramIndex}`); updateValues.push(supplier_id); paramIndex++; }
    if (frame_brand !== undefined && frame_brand !== null) { updateFields.push(`frame_brand = $${paramIndex}`); updateValues.push(frame_brand); paramIndex++; }
    if (frame_model !== undefined && frame_model !== null) { updateFields.push(`frame_model = $${paramIndex}`); updateValues.push(frame_model); paramIndex++; }
    
    if (updateFields.length > 0) {
      updateValues.push(product.id, tenantId);
      const updateQuery = `
        UPDATE products 
        SET ${updateFields.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
        RETURNING *
      `;
      
      const updatedResult = await pool.query(updateQuery, updateValues);
      return res.status(201).json({ success: true, data: updatedResult.rows[0] });
    }
    
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    console.error('Erreur POST /products:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// PUT /api/products/:id - Mettre à jour un produit
// =======================
router.put('/:id', async (req, res) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const updates = req.body;
  
  try {
    // Colonnes exactes de la table products (sans stock_quantity)
    const allowedFields = [
      'reference', 'sku', 'barcode', 'name', 'description',
      'price_cents', 'purchase_price_cents', 'margin_percent',
      'min_stock', 'location',
      'frame_type', 'gender', 'shape', 'material',
      'frame_color', 'temple_color', 'size_code',
      'lens_width', 'bridge_width', 'temple_length', 'lens_height',
      'base_curve', 'rim_type', 'accessory_type', 'compatible_with',
      'consumable', 'is_featured', 'is_active', 'supplier_id',
      'frame_brand', 'frame_model'
    ];
    
    const updateFields = [];
    const values = [];
    let paramIndex = 1;
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateFields.push(`${field} = $${paramIndex}`);
        values.push(updates[field]);
        paramIndex++;
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    }
    
    updateFields.push(`updated_at = NOW()`);
    values.push(id, tenantId);
    
    const query = `
      UPDATE products 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1} AND deleted_at IS NULL
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur PUT /products/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// DELETE /api/products/:id - Supprimer un produit (soft delete)
// =======================
router.delete('/:id', async (req, res) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      `UPDATE products 
       SET deleted_at = NOW() 
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
    
    res.json({ success: true, message: 'Produit supprimé avec succès' });
  } catch (err) {
    console.error('Erreur DELETE /products/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;