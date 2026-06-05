// backend/routes/pricing.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// =======================
// GET /api/pricing - Récupérer tous les prix
// =======================
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, lens_type, index_type, material, base_price_cents, selling_price_cents FROM price_grid WHERE tenant_id = $1',
      [req.tenantId]
    );
    
    const data = result.rows.map(row => ({
      ...row,
      base_price_cents: parseFloat(row.base_price_cents),
      selling_price_cents: parseFloat(row.selling_price_cents)
    }));
    
    res.json({ success: true, data });
  } catch (err) {
    console.error('Erreur GET pricing:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/pricing/:id - Récupérer un prix par ID
// =======================
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT id, lens_type, index_type, material, base_price_cents, selling_price_cents FROM price_grid WHERE id = $1 AND tenant_id = $2',
      [id, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prix non trouvé' });
    }
    
    const data = {
      ...result.rows[0],
      base_price_cents: parseFloat(result.rows[0].base_price_cents),
      selling_price_cents: parseFloat(result.rows[0].selling_price_cents)
    };
    
    res.json({ success: true, data });
  } catch (err) {
    console.error('Erreur GET pricing/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// POST /api/pricing - Créer un nouveau prix
// =======================
router.post('/', async (req, res) => {
  const { lens_type, index_type, material, selling_price_cents, base_price_cents } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO price_grid 
       (tenant_id, lens_type, index_type, material, selling_price_cents, base_price_cents, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [req.tenantId, lens_type, index_type, material, selling_price_cents, base_price_cents || 0]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur POST pricing:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// PUT /api/pricing/:id - Mettre à jour un prix
// =======================
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { lens_type, index_type, material, selling_price_cents, base_price_cents } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE price_grid 
       SET lens_type = $1, index_type = $2, material = $3, 
           selling_price_cents = $4, base_price_cents = $5, updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7
       RETURNING *`,
      [lens_type, index_type, material, selling_price_cents, base_price_cents || 0, id, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prix non trouvé' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur PUT pricing:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// DELETE /api/pricing/:id - Supprimer un prix
// =======================
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'DELETE FROM price_grid WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prix non trouvé' });
    }
    
    res.json({ success: true, message: 'Prix supprimé avec succès' });
  } catch (err) {
    console.error('Erreur DELETE pricing:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;