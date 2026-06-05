// backend/routes/coatings.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// =======================
// GET /api/coatings - Récupérer tous les traitements
// =======================
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM coating_pricing WHERE tenant_id = $1',
      [req.tenantId]
    );
    
    const data = result.rows.map(row => ({
      ...row,
      selling_price_cents: parseFloat(row.selling_price_cents),
      purchase_price_cents: parseFloat(row.purchase_price_cents) || 0
    }));
    
    res.json({ success: true, data });
  } catch (err) {
    console.error('Erreur GET coatings:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/coatings/:id - Récupérer un traitement par ID
// =======================
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT * FROM coating_pricing WHERE id = $1 AND tenant_id = $2',
      [id, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Traitement non trouvé' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur GET coatings/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// POST /api/coatings - Créer un nouveau traitement
// =======================
router.post('/', async (req, res) => {
  const { coating_code, coating_name, selling_price_cents, purchase_price_cents } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO coating_pricing 
       (tenant_id, coating_code, coating_name, selling_price_cents, purchase_price_cents)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.tenantId, coating_code, coating_name, selling_price_cents, purchase_price_cents || 0]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur POST coating:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// PUT /api/coatings/:id - Mettre à jour un traitement
// =======================
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { coating_code, coating_name, selling_price_cents, purchase_price_cents } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE coating_pricing 
       SET coating_code = $1, coating_name = $2, 
           selling_price_cents = $3, purchase_price_cents = $4
       WHERE id = $5 AND tenant_id = $6
       RETURNING *`,
      [coating_code, coating_name, selling_price_cents, purchase_price_cents || 0, id, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Traitement non trouvé' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur PUT coating:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// DELETE /api/coatings/:id - Supprimer un traitement
// =======================
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'DELETE FROM coating_pricing WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Traitement non trouvé' });
    }
    
    res.json({ success: true, message: 'Traitement supprimé avec succès' });
  } catch (err) {
    console.error('Erreur DELETE coating:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;