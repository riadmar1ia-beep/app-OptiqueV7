// backend/routes/suppliers.js - Version complète corrigée
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// =======================
// GET /api/suppliers - Liste tous les fournisseurs
// =======================
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM suppliers WHERE tenant_id = $1 AND is_active = true ORDER BY name',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erreur GET suppliers:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// POST /api/suppliers - Créer un fournisseur
// =======================
router.post('/', async (req, res) => {
  const {
    name, commercial_name, ice, if: ifField, rc, cnss, patente,
    address, city, postal_code,
    phone, fax, email, website,
    contact_name, contact_phone, contact_email,
    bank_name, bank_account_number, bank_rib, iban,
    notes
  } = req.body;

  try {
    // Validation du téléphone
    const phoneRegex = /^(\+212|0)[5-7][0-9]{8}$/;
    if (!phone || !phoneRegex.test(phone)) {
      return res.status(400).json({ error: 'Téléphone invalide (ex: 0612345678 ou +212612345678)' });
    }

    // Note: "if" est un mot réservé en SQL, donc on l'écrit entre guillemets: "if"
    const result = await pool.query(
      `INSERT INTO suppliers 
       (tenant_id, name, commercial_name, ice, "if", rc, cnss, patente,
        address, city, postal_code, phone, fax, email, website,
        contact_name, contact_phone, contact_email,
        bank_name, bank_account_number, bank_rib, iban, notes,
        is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               $9, $10, $11, $12, $13, $14, $15,
               $16, $17, $18, $19, $20, $21, $22, $23,
               true, NOW(), NOW())
       RETURNING *`,
      [
        req.tenantId, 
        name, 
        commercial_name || null,
        ice || null,
        ifField || null,
        rc || null,
        cnss || null,
        patente || null,
        address || null,
        city || null,
        postal_code || null,
        phone,
        fax || null,
        email || null,
        website || null,
        contact_name || null,
        contact_phone || null,
        contact_email || null,
        bank_name || null,
        bank_account_number || null,
        bank_rib || null,
        iban || null,
        notes || null
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur POST supplier:', err);
    
    if (err.code === '23505') {
      return res.status(409).json({ error: 'ICE déjà existant' });
    }
    
    res.status(500).json({ error: err.message });
  }
});

// =======================
// PUT /api/suppliers/:id - Modifier un fournisseur
// =======================
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    name, commercial_name, ice, if: ifField, rc, cnss, patente,
    address, city, postal_code,
    phone, fax, email, website,
    contact_name, contact_phone, contact_email,
    bank_name, bank_account_number, bank_rib, iban,
    notes
  } = req.body;

  try {
    if (phone) {
      const phoneRegex = /^(\+212|0)[5-7][0-9]{8}$/;
      if (!phoneRegex.test(phone)) {
        return res.status(400).json({ error: 'Téléphone invalide (ex: 0612345678 ou +212612345678)' });
      }
    }

    const result = await pool.query(
      `UPDATE suppliers SET 
        name = COALESCE($1, name),
        commercial_name = COALESCE($2, commercial_name),
        ice = COALESCE($3, ice),
        "if" = COALESCE($4, "if"),
        rc = COALESCE($5, rc),
        cnss = COALESCE($6, cnss),
        patente = COALESCE($7, patente),
        address = COALESCE($8, address),
        city = COALESCE($9, city),
        postal_code = COALESCE($10, postal_code),
        phone = COALESCE($11, phone),
        fax = COALESCE($12, fax),
        email = COALESCE($13, email),
        website = COALESCE($14, website),
        contact_name = COALESCE($15, contact_name),
        contact_phone = COALESCE($16, contact_phone),
        contact_email = COALESCE($17, contact_email),
        bank_name = COALESCE($18, bank_name),
        bank_account_number = COALESCE($19, bank_account_number),
        bank_rib = COALESCE($20, bank_rib),
        iban = COALESCE($21, iban),
        notes = COALESCE($22, notes),
        updated_at = NOW()
      WHERE id = $23 AND tenant_id = $24 AND is_active = true
      RETURNING *`,
      [
        name, commercial_name, ice, ifField, rc, cnss, patente,
        address, city, postal_code,
        phone, fax, email, website,
        contact_name, contact_phone, contact_email,
        bank_name, bank_account_number, bank_rib, iban,
        notes,
        id,
        req.tenantId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fournisseur non trouvé ou inactif' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur PUT supplier:', err);
    
    if (err.code === '23505') {
      return res.status(409).json({ error: 'ICE déjà existant' });
    }
    
    res.status(500).json({ error: err.message });
  }
});

// =======================
// DELETE /api/suppliers/:id - Désactiver un fournisseur
// =======================
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const check = await pool.query(
      'SELECT 1 FROM supplier_orders WHERE supplier_id = $1 LIMIT 1',
      [id]
    );
    
    if (check.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Fournisseur utilisé dans une commande → suppression interdite' 
      });
    }
    
    const result = await pool.query(
      'UPDATE suppliers SET is_active = false WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fournisseur non trouvé' });
    }
    
    res.json({ success: true, message: 'Fournisseur désactivé' });
  } catch (err) {
    console.error('Erreur DELETE supplier:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;