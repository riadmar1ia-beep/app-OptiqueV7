// backend/routes/prescriptions.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// =======================
// VALIDATION PRESSCRIPTION AMÉLIORÉE
// =======================
function validatePrescription(prescription) {
  // Vérifier qu'il y a au moins une correction
  const hasCorrection = 
    (prescription.od_sphere !== null && prescription.od_sphere !== undefined && prescription.od_sphere !== 0) ||
    (prescription.od_cylinder !== null && prescription.od_cylinder !== undefined && prescription.od_cylinder !== 0) ||
    (prescription.og_sphere !== null && prescription.og_sphere !== undefined && prescription.og_sphere !== 0) ||
    (prescription.og_cylinder !== null && prescription.og_cylinder !== undefined && prescription.og_cylinder !== 0);
  
  if (!hasCorrection) {
    throw new Error('Prescription invalide : au moins une correction (sphère ou cylindre) est requise');
  }
  
  // Validation des sphères
  const spheres = [
    { value: prescription.od_sphere, name: 'OD (œil droit)' },
    { value: prescription.og_sphere, name: 'OG (œil gauche)' }
  ];
  
  for (const sphere of spheres) {
    if (sphere.value !== null && sphere.value !== undefined && sphere.value !== 0) {
      if (sphere.value < -20 || sphere.value > 20) {
        throw new Error(`Sphère ${sphere.name} hors limites : doit être entre -20 et +20`);
      }
    }
  }
  
  // Validation des cylindres
  const cylinders = [
    { value: prescription.od_cylinder, name: 'OD (œil droit)' },
    { value: prescription.og_cylinder, name: 'OG (œil gauche)' }
  ];
  
  for (const cylinder of cylinders) {
    if (cylinder.value !== null && cylinder.value !== undefined && cylinder.value !== 0) {
      if (cylinder.value < -6 || cylinder.value > 6) {
        throw new Error(`Cylindre ${cylinder.name} hors limites : doit être entre -6 et +6`);
      }
    }
  }
  
  // Validation des axes (obligatoire si cylindre non nul)
  const axes = [
    { cylinder: prescription.od_cylinder, axis: prescription.od_axis, name: 'OD (œil droit)' },
    { cylinder: prescription.og_cylinder, axis: prescription.og_axis, name: 'OG (œil gauche)' }
  ];
  
  for (const axis of axes) {
    if (axis.cylinder !== null && axis.cylinder !== undefined && axis.cylinder !== 0) {
      // Cylindre non nul → axe obligatoire
      if (axis.axis === null || axis.axis === undefined) {
        throw new Error(`Axe ${axis.name} obligatoire car le cylindre n'est pas nul`);
      }
      if (axis.axis < 0 || axis.axis > 180) {
        throw new Error(`Axe ${axis.name} hors limites : doit être entre 0 et 180`);
      }
    } else {
      // Cylindre nul → axe interdit
      if (axis.axis !== null && axis.axis !== undefined && axis.axis !== 0) {
        throw new Error(`Axe ${axis.name} interdit lorsque le cylindre est nul`);
      }
    }
  }
  
  // Validation des additions
  const additions = [
    { value: prescription.od_addition, name: 'OD (œil droit)' },
    { value: prescription.og_addition, name: 'OG (œil gauche)' }
  ];
  
  for (const addition of additions) {
    if (addition.value !== null && addition.value !== undefined && addition.value !== 0) {
      if (addition.value < 0.5 || addition.value > 3.5) {
        throw new Error(`Addition ${addition.name} hors limites : doit être entre 0.50 et 3.50`);
      }
    }
  }
  
  return true;
}

// =======================
// GET /api/prescriptions/client/:clientId
// =======================
router.get('/client/:clientId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, doctor_name, date_of_issue, expiry_date, 
              od_sphere, od_cylinder, od_axis, od_addition,
              og_sphere, og_cylinder, og_axis, og_addition,
              pupillary_distance, notes, created_at
       FROM prescriptions 
       WHERE client_id = $1 AND tenant_id = $2
       ORDER BY date_of_issue DESC`,
      [req.params.clientId, req.tenantId]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erreur GET prescriptions:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// POST /api/prescriptions
// =======================
router.post('/', async (req, res) => {
  try {
    validatePrescription(req.body);
    
    const { 
      client_id, doctor_name, doctor_phone, date_of_issue, expiry_date,
      od_sphere, od_cylinder, od_axis, od_addition,
      og_sphere, og_cylinder, og_axis, og_addition,
      pupillary_distance, notes 
    } = req.body;

    const clientCheck = await pool.query(
      'SELECT id, first_name, last_name FROM clients WHERE id = $1 AND tenant_id = $2 AND is_active = true',
      [client_id, req.tenantId]
    );
    
    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Client non trouvé ou inactif' });
    }

    if (new Date(expiry_date) <= new Date(date_of_issue)) {
      return res.status(400).json({ error: 'La date d\'expiration doit être postérieure à la date de délivrance' });
    }

    const result = await pool.query(
      `INSERT INTO prescriptions 
       (tenant_id, client_id, doctor_name, doctor_phone, date_of_issue, expiry_date, 
        od_sphere, od_cylinder, od_axis, od_addition,
        og_sphere, og_cylinder, og_axis, og_addition,
        pupillary_distance, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
       RETURNING *`,
      [req.tenantId, client_id, doctor_name, doctor_phone, date_of_issue, expiry_date,
       od_sphere || null, od_cylinder || null, od_axis || null, od_addition || null,
       og_sphere || null, og_cylinder || null, og_axis || null, og_addition || null,
       pupillary_distance || null, notes || null]
    );

    res.json({ 
      success: true, 
      data: result.rows[0],
      message: `Ordonnance créée pour ${clientCheck.rows[0].first_name} ${clientCheck.rows[0].last_name}`
    });

  } catch (err) {
    console.error('Erreur POST prescription:', err.message);
    
    if (err.message.includes('Prescription invalide') || 
        err.message.includes('hors limites') ||
        err.message.includes('obligatoire') ||
        err.message.includes('interdit')) {
      return res.status(400).json({ error: err.message });
    }
    
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/prescriptions/:id
// =======================
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.first_name, c.last_name 
       FROM prescriptions p
       JOIN clients c ON c.id = p.client_id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [req.params.id, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ordonnance non trouvée' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur GET prescription:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// DELETE /api/prescriptions/:id
// =======================
router.delete('/:id', async (req, res) => {
  try {
    const check = await pool.query(
      `SELECT 1 FROM supplier_orders 
       WHERE right_eye_config->>'prescription_id' = $1 
          OR left_eye_config->>'prescription_id' = $1 
       LIMIT 1`,
      [req.params.id]
    );
    
    if (check.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Ordonnance utilisée dans une commande → suppression interdite' 
      });
    }
    
    const result = await pool.query(
      'DELETE FROM prescriptions WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ordonnance non trouvée' });
    }
    
    res.json({ success: true, message: 'Ordonnance supprimée' });
  } catch (err) {
    console.error('Erreur DELETE prescription:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// PUT /api/prescriptions/:id
// =======================
router.put('/:id', async (req, res) => {
  try {
    validatePrescription(req.body);

    const usageCheck = await pool.query(
      `SELECT 1
       FROM core_sales_order
       WHERE prescription_id = $1 AND tenant_id = $2
       LIMIT 1`,
      [req.params.id, req.tenantId]
    );

    if (usageCheck.rows.length > 0) {
      return res.status(400).json({
        error: 'Ordonnance déjà utilisée dans une commande. Modification interdite.'
      });
    }

    const {
      doctor_name, doctor_phone, date_of_issue, expiry_date,
      od_sphere, od_cylinder, od_axis, od_addition,
      og_sphere, og_cylinder, og_axis, og_addition,
      pupillary_distance, notes
    } = req.body;

    if (new Date(expiry_date) <= new Date(date_of_issue)) {
      return res.status(400).json({ error: 'La date d\'expiration doit être postérieure à la date de délivrance' });
    }

    const result = await pool.query(
      `UPDATE prescriptions
       SET doctor_name = $1,
           doctor_phone = $2,
           date_of_issue = $3,
           expiry_date = $4,
           od_sphere = $5,
           od_cylinder = $6,
           od_axis = $7,
           od_addition = $8,
           og_sphere = $9,
           og_cylinder = $10,
           og_axis = $11,
           og_addition = $12,
           pupillary_distance = $13,
           notes = $14,
           updated_at = NOW()
       WHERE id = $15 AND tenant_id = $16
       RETURNING *`,
      [
        doctor_name,
        doctor_phone,
        date_of_issue,
        expiry_date,
        od_sphere || null, od_cylinder || null, od_axis || null, od_addition || null,
        og_sphere || null, og_cylinder || null, og_axis || null, og_addition || null,
        pupillary_distance || null, notes || null,
        req.params.id,
        req.tenantId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ordonnance non trouvée' });
    }

    res.json({ success: true, data: result.rows[0], message: 'Ordonnance modifiée' });
  } catch (err) {
    console.error('Erreur PUT prescription:', err.message);
    if (err.message.includes('Prescription invalide') ||
        err.message.includes('hors limites') ||
        err.message.includes('obligatoire') ||
        err.message.includes('interdit')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
