// backend/routes/settings.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET - Récupérer les paramètres de l'entreprise
router.get('/company', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM company_settings 
       WHERE tenant_id = $1 
       LIMIT 1`,
      [req.tenantId]
    );
    
    if (result.rows.length === 0) {
      // Créer les paramètres par défaut si non existants
      const insertResult = await pool.query(
        `INSERT INTO company_settings (tenant_id, company_name, address, phone)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [req.tenantId, 'MARZOUK OPTIQUE', 'N40 Rue 6, Haj Fatah – Casablanca', '05 22 90 00 42']
      );
      return res.json({ success: true, data: insertResult.rows[0] });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur GET company settings:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT - Mettre à jour les paramètres
router.put('/company', async (req, res) => {
  const {
    company_name, address, phone, email, website,
    rc, if_number, patente, ice, logo_url,
    invoice_prefix, credit_note_prefix, purchase_order_prefix,
    quote_prefix, delivery_note_prefix
  } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE company_settings 
       SET company_name = COALESCE($1, company_name),
           address = COALESCE($2, address),
           phone = COALESCE($3, phone),
           email = COALESCE($4, email),
           website = COALESCE($5, website),
           rc = COALESCE($6, rc),
           if_number = COALESCE($7, if_number),
           patente = COALESCE($8, patente),
           ice = COALESCE($9, ice),
           logo_url = COALESCE($10, logo_url),
           invoice_prefix = COALESCE($11, invoice_prefix),
           credit_note_prefix = COALESCE($12, credit_note_prefix),
           purchase_order_prefix = COALESCE($13, purchase_order_prefix),
           quote_prefix = COALESCE($14, quote_prefix),
           delivery_note_prefix = COALESCE($15, delivery_note_prefix),
           updated_at = NOW()
       WHERE tenant_id = $16
       RETURNING *`,
      [company_name, address, phone, email, website,
       rc, if_number, patente, ice, logo_url,
       invoice_prefix, credit_note_prefix, purchase_order_prefix,
       quote_prefix, delivery_note_prefix, req.tenantId]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur PUT company settings:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST - Générer un nouveau numéro de document
router.post('/generate-number/:type', async (req, res) => {
  const { type } = req.params; // invoice, credit_note, purchase_order, quote, delivery_note
  
  const typeMap = {
    invoice: { prefix: 'invoice_prefix', counter: 'next_invoice_number' },
    credit_note: { prefix: 'credit_note_prefix', counter: 'next_credit_note_number' },
    purchase_order: { prefix: 'purchase_order_prefix', counter: 'next_purchase_order_number' },
    quote: { prefix: 'quote_prefix', counter: 'next_quote_number' },
    delivery_note: { prefix: 'delivery_note_prefix', counter: 'next_delivery_note_number' }
  };
  
  const config = typeMap[type];
  if (!config) {
    return res.status(400).json({ error: 'Type de document invalide' });
  }
  
  try {
    const result = await pool.query(
      `UPDATE company_settings 
       SET ${config.counter} = ${config.counter} + 1
       WHERE tenant_id = $1
       RETURNING ${config.prefix} as prefix, ${config.counter} as number`,
      [req.tenantId]
    );
    
    const { prefix, number } = result.rows[0];
    const year = new Date().getFullYear();
    const documentNumber = `${prefix}-${year}-${String(number).padStart(4, '0')}`;
    
    res.json({ success: true, data: { documentNumber, number, prefix } });
  } catch (err) {
    console.error('Erreur generation numero:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;