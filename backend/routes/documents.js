// backend/routes/documents.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

function parseJsonField(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (err) {
      return fallback;
    }
  }
  return fallback;
}

function normalizeMounting(source) {
  const mounting = source?.mounting || source?.metadata?.mounting || source?.lens_details?.mounting || {};
  return {
    pupillary_distance: Number(mounting.pupillary_distance ?? 0),
    mounting_height: Number(mounting.mounting_height ?? 0),
    vertex_distance: Number(mounting.vertex_distance ?? 0),
    pantoscopic_angle: Number(mounting.pantoscopic_angle ?? 0),
    frame_wrap: Number(mounting.frame_wrap ?? 0),
  };
}

// =======================
// GET - Générer le prochain numéro de document
// =======================
router.get('/next-number/:type', async (req, res) => {
  const { type } = req.params;
  
  const validTypes = ['invoice', 'credit_note', 'delivery_note', 'quote'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: 'Type de document invalide' });
  }
  
  try {
    const result = await pool.query(
      `SELECT get_next_document_number($1, $2) as document_number`,
      [req.tenantId, type]
    );
    
    res.json({ 
      success: true, 
      data: { 
        document_number: result.rows[0].document_number,
        type 
      } 
    });
  } catch (err) {
    console.error('Erreur génération numéro:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// POST - Créer une facture client
// =======================
router.post('/invoice', async (req, res) => {
  const { 
    sales_order_id, 
    client_id,
    client_name,
    client_email,
    client_phone,
    client_address,
    items,
    amount_ht,
    amount_tva,
    amount_ttc,
    payment_method,
    notes
  } = req.body;
  
  const dbClient = await pool.connect();
  
  try {
    await dbClient.query('BEGIN');
    
    const numberResult = await dbClient.query(
      `SELECT get_next_document_number($1, 'invoice') as document_number`,
      [req.tenantId]
    );
    const invoiceNumber = numberResult.rows[0].document_number;
    
    const invoiceResult = await dbClient.query(
      `INSERT INTO sales_invoices 
       (tenant_id, invoice_number, invoice_date, 
        amount_ht_cents, amount_tva_cents, amount_ttc_cents, 
        payment_status, payment_method, notes, created_at)
       VALUES ($1, $2, NOW(), $3, $4, $5, 'unpaid', $6, $7, NOW())
       RETURNING *`,
      [req.tenantId, invoiceNumber, amount_ht * 100, amount_tva * 100, amount_ttc * 100, 
       payment_method || 'cash', notes || null]
    );
    
    for (const item of items) {
      await dbClient.query(
        `INSERT INTO sales_invoice_items 
         (tenant_id, invoice_id, description, quantity, 
          unit_price_cents, total_cents, tax_rate, tax_amount_cents, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [req.tenantId, invoiceResult.rows[0].id, item.description, item.quantity,
         item.unit_price_cents, item.total_cents, item.tax_rate || 20, 
         item.tax_amount_cents || Math.round(item.total_cents * 0.2)]
      );
    }
    
    if (sales_order_id) {
      await dbClient.query(
        `UPDATE core_sales_order 
         SET invoice_id = $1, 
             invoice_number = $2, 
             payment_status = 'invoiced',
             updated_at = NOW()
         WHERE id = $3`,
        [invoiceResult.rows[0].id, invoiceNumber, sales_order_id]
      );
    }
    
    await dbClient.query('COMMIT');
    
    res.json({ 
      success: true, 
      data: {
        invoice_id: invoiceResult.rows[0].id,
        invoice_number: invoiceNumber,
        invoice_date: new Date().toISOString(),
        amount_ht,
        amount_tva,
        amount_ttc
      },
      message: `Facture ${invoiceNumber} créée avec succès`
    });
    
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Erreur création facture:', err);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// =======================
// POST - Créer un avoir (crédit note)
// =======================
router.post('/credit-note', async (req, res) => {
  const { 
    invoice_id, 
    invoice_number,
    amount_ht, 
    amount_tva, 
    amount_ttc, 
    reason,
    items
  } = req.body;
  
  const dbClient = await pool.connect();
  
  try {
    await dbClient.query('BEGIN');
    
    const numberResult = await dbClient.query(
      `SELECT get_next_document_number($1, 'credit_note') as document_number`,
      [req.tenantId]
    );
    const creditNoteNumber = numberResult.rows[0].document_number;
    
    const creditNoteResult = await dbClient.query(
      `INSERT INTO supplier_credit_notes 
       (tenant_id, credit_note_number, amount_ht, amount_tva, amount_ttc, 
        reason, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [req.tenantId, creditNoteNumber, amount_ht, amount_tva, amount_ttc, reason || null]
    );
    
    if (invoice_id) {
      await dbClient.query(
        `UPDATE sales_invoices 
         SET payment_status = 'credited', 
             updated_at = NOW()
         WHERE id = $1`,
        [invoice_id]
      );
    }
    
    await dbClient.query('COMMIT');
    
    res.json({ 
      success: true, 
      data: {
        credit_note_id: creditNoteResult.rows[0].id,
        credit_note_number: creditNoteNumber,
        credit_note_date: new Date().toISOString(),
        original_invoice: invoice_number,
        amount_ht,
        amount_tva,
        amount_ttc
      },
      message: `Avoir ${creditNoteNumber} créé avec succès`
    });
    
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Erreur création avoir:', err);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// =======================
// GET - Récupérer une facture par son numéro
// =======================
router.get('/invoice/:invoice_number', async (req, res) => {
  const { invoice_number } = req.params;
  const dbClient = await pool.connect();
  
  try {
    const invoiceResult = await dbClient.query(
      `SELECT i.*, 
              COALESCE(SUM(cn.amount_ttc), 0) as credited_amount
       FROM sales_invoices i
       LEFT JOIN supplier_credit_notes cn ON cn.tenant_id = i.tenant_id 
          AND cn.reason LIKE '%' || i.invoice_number || '%'
       WHERE i.invoice_number = $1 AND i.tenant_id = $2
       GROUP BY i.id`,
      [invoice_number, req.tenantId]
    );
    
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Facture non trouvée' });
    }
    
    const itemsResult = await dbClient.query(
      `SELECT * FROM sales_invoice_items 
       WHERE invoice_id = $1
       ORDER BY created_at`,
      [invoiceResult.rows[0].id]
    );
    
    res.json({ 
      success: true, 
      data: {
        ...invoiceResult.rows[0],
        items: itemsResult.rows
      } 
    });
  } catch (err) {
    console.error('Erreur récupération facture:', err);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// ============================================
// ROUTES POUR GÉNÉRATION DES PDF
// ============================================

// =======================
// GET /api/documents/invoice-data/:id - Données pour facture PDF
// =======================
router.get('/invoice-data/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const invoice = await pool.query(
      `SELECT si.*, 
              c.first_name, c.last_name, c.phone, c.email, c.address
       FROM sales_invoices si
       LEFT JOIN clients c ON c.id = si.client_id
       WHERE si.id = $1 AND si.tenant_id = $2`,
      [id, req.tenantId]
    );
    
    if (invoice.rows.length === 0) {
      return res.status(404).json({ error: 'Facture non trouvée' });
    }
    
    const invoiceData = invoice.rows[0];
    
    const items = await pool.query(
      `SELECT * FROM sales_invoice_items 
       WHERE invoice_id = $1`,
      [id]
    );
    
    const settings = await pool.query(
      `SELECT * FROM company_settings WHERE tenant_id = $1`,
      [req.tenantId]
    );
    
    const clientName = invoiceData.first_name && invoiceData.last_name
      ? `${invoiceData.first_name} ${invoiceData.last_name}`
      : invoiceData.customer_name || 'Client comptoir';
    
    const formattedItems = items.rows.map(item => ({
      reference: item.id.substring(0, 8),
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price_cents / 100,
      total: item.total_cents / 100
    }));
    
    res.json({
      success: true,
      data: {
        number: invoiceData.invoice_number,
        date: new Date(invoiceData.invoice_date || invoiceData.created_at).toLocaleDateString('fr-FR'),
        client_name: clientName,
        client_address: invoiceData.address || '',
        client_phone: invoiceData.phone || '',
        client_email: invoiceData.email || '',
        items: formattedItems,
        subtotal: invoiceData.amount_ht_cents / 100,
        tax_rate: 20,
        tax_amount: invoiceData.tax_amount_cents / 100,
        total: invoiceData.amount_ttc_cents / 100,
        payment_method: invoiceData.payment_method || 'Espèces',
        notes: invoiceData.notes
      },
      settings: settings.rows[0] || {}
    });
    
  } catch (err) {
    console.error('Erreur GET invoice-data:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/documents/quote-data/:id - Données pour devis PDF
// =======================
router.get('/quote-data/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const order = await pool.query(
      `SELECT so.*, 
              c.first_name, c.last_name, c.phone, c.email, c.address
       FROM core_sales_order so
       LEFT JOIN clients c ON c.id = so.client_id
       WHERE so.id = $1 AND so.tenant_id = $2`,
      [id, req.tenantId]
    );
    
    if (order.rows.length === 0) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    
    const orderData = order.rows[0];
    
    const items = await pool.query(
      `SELECT * FROM core_sales_order_item 
       WHERE sales_order_id = $1`,
      [id]
    );
    
    const settings = await pool.query(
      `SELECT * FROM company_settings WHERE tenant_id = $1`,
      [req.tenantId]
    );
    
    // ============================================
    // EXTRAIRE LES VERRES AVEC LEURS MÉTADONNÉES
    // ============================================
    let right_eye = null;
    let left_eye = null;
    let mounting = null;
    
    for (const item of items.rows) {
      if (item.line_type === 'optical_job') {
        const metadata = parseJsonField(item.metadata, {});
        const lensConfig = metadata.lens_config || {};
        const prescription = metadata.prescription || {};
        
        if (metadata.eye === 'OD') {
          right_eye = {
            type: lensConfig.type,
            index: lensConfig.index,
            material: lensConfig.material,
            coatings: lensConfig.coatings || [],
            tint: lensConfig.tint || { color: 'none', gradient: false, intensity: 0 },
            prescription: {
              sphere: prescription.sphere,
              cylinder: prescription.cylinder,
              axis: prescription.axis,
              addition: prescription.addition,
              prism: prescription.prism,
              prism_base: prescription.prism_base
            }
          };
        }
        if (metadata.eye === 'OG') {
          left_eye = {
            type: lensConfig.type,
            index: lensConfig.index,
            material: lensConfig.material,
            coatings: lensConfig.coatings || [],
            tint: lensConfig.tint || { color: 'none', gradient: false, intensity: 0 },
            prescription: {
              sphere: prescription.sphere,
              cylinder: prescription.cylinder,
              axis: prescription.axis,
              addition: prescription.addition,
              prism: prescription.prism,
              prism_base: prescription.prism_base
            }
          };
        }
        
        if (!mounting) {
          const normalizedMounting = normalizeMounting(metadata);
          if (Object.values(normalizedMounting).some((value) => value !== 0)) {
            mounting = normalizedMounting;
          }
        }
      }
    }
    
    const totalHT = items.rows.reduce((sum, item) => sum + item.total_cents, 0) / 100;
    const totalTVA = items.rows.reduce((sum, item) => sum + item.tax_amount_cents, 0) / 100;
    
    const clientName = orderData.first_name && orderData.last_name
      ? `${orderData.first_name} ${orderData.last_name}`
      : orderData.customer_name;
    
    const formattedItems = items.rows.map(item => ({
      reference: item.line_type === 'optical_job' ? 'VERRE' : (item.product_id?.substring(0, 8) || 'REF'),
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price_cents / 100,
      total: item.total_cents / 100
    }));
    
    res.json({
      success: true,
      data: {
        number: orderData.order_number,
        date: new Date(orderData.created_at).toLocaleDateString('fr-FR'),
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR'),
        client_name: clientName,
        client_address: orderData.address || '',
        client_phone: orderData.phone || '',
        client_email: orderData.email || '',
        items: formattedItems,
        // ✅ AJOUT DES INFORMATIONS DE PRESCRIPTION ET VERRES
        right_eye: right_eye,
        left_eye: left_eye,
        mounting: mounting,
        subtotal: totalHT,
        tax_rate: 20,
        tax_amount: totalTVA,
        total: totalHT + totalTVA,
        notes: orderData.notes
      },
      settings: settings.rows[0] || {}
    });
    
  } catch (err) {
    console.error('Erreur GET quote-data:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/documents/lab-order-data/:id - Données pour bon de commande laboratoire (à partir de sales_order)
// =======================
router.get('/lab-order-data/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const order = await pool.query(
      `SELECT so.*, 
              c.first_name, c.last_name
       FROM core_sales_order so
       LEFT JOIN clients c ON c.id = so.client_id
       WHERE so.id = $1 AND so.tenant_id = $2`,
      [id, req.tenantId]
    );
    
    if (order.rows.length === 0) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    
    const lensItems = await pool.query(
      `SELECT * FROM core_sales_order_item 
       WHERE sales_order_id = $1 AND item_type = 'lens'`,
      [id]
    );
    
    let right_eye = null;
    let left_eye = null;
    
    for (const item of lensItems.rows) {
      if (item.metadata) {
        const metadata = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
        if (metadata.eye === 'OD') right_eye = metadata.right_eye;
        if (metadata.eye === 'OG') left_eye = metadata.left_eye;
      }
    }
    
    const settings = await pool.query(
      `SELECT * FROM company_settings WHERE tenant_id = $1`,
      [req.tenantId]
    );
    
    const orderData = order.rows[0];
    const clientName = orderData.first_name && orderData.last_name
      ? `${orderData.first_name} ${orderData.last_name}`
      : orderData.customer_name;
    
    res.json({
      success: true,
      data: {
        order_number: orderData.order_number,
        date: new Date(orderData.created_at).toLocaleDateString('fr-FR'),
        client_name: clientName,
        right_eye: right_eye,
        left_eye: left_eye,
        supplier_name: 'Laboratoire externe',
        notes: orderData.notes
      },
      settings: settings.rows[0] || {}
    });
    
  } catch (err) {
    console.error('Erreur GET lab-order-data:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// ✅ GET /api/documents/supplier-order-data/:id - Données pour bon de commande fournisseur (à partir de supplier_orders)
// =======================
router.get('/supplier-order-data/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Récupérer la commande fournisseur
    const supplierOrder = await pool.query(
      `SELECT so.*, 
              s.name as supplier_name,
              c.first_name, c.last_name
       FROM supplier_orders so
       LEFT JOIN suppliers s ON s.id = so.supplier_id
       LEFT JOIN core_sales_order so2 ON so2.id = so.sales_order_id
       LEFT JOIN clients c ON c.id = so.client_id
       WHERE so.id = $1 AND so.tenant_id = $2`,
      [id, req.tenantId]
    );
    
    if (supplierOrder.rows.length === 0) {
      return res.status(404).json({ error: 'Commande fournisseur non trouvée' });
    }
    
    const data = supplierOrder.rows[0];
    
    // ✅ Récupérer en priorité les données pré-normalisées de la table supplier_orders
    let right_eye = null;
    let left_eye = null;
    let mounting = null;

    const rightEyeObj = data.right_eye_config;
    const leftEyeObj = data.left_eye_config;

    const normalizeEye = function(eyeConfig) {
      if (!eyeConfig) return null;
      const config = typeof eyeConfig === 'string' ? parseJsonField(eyeConfig) : eyeConfig;
      if (!config || (!config.type && !config.index && !config.material && !config.prescription)) {
        return null;
      }
      return {
        type: config.type || '-',
        index: config.index || '-',
        material: config.material || '-',
        prescription: config.prescription ? {
          sphere: config.prescription.sphere || 0,
          cylinder: config.prescription.cylinder || 0,
          axis: config.prescription.axis || null,
          addition: config.prescription.addition || null,
          prism: config.prescription.prism || null,
          prism_base: config.prescription.prism_base || null
        } : null,
        coatings: config.coatings || [],
        coatings_detail: config.coatings_detail || [],
        tint: config.tint || null
      };
    };

    if (rightEyeObj || leftEyeObj) {
      right_eye = normalizeEye(rightEyeObj);
      left_eye = normalizeEye(leftEyeObj);
      
      const eyeMounting = (rightEyeObj?.mounting || leftEyeObj?.mounting || data.mounting_params);
      if (eyeMounting) {
        mounting = {
          pupillary_distance: Number(eyeMounting.pupillary_distance ?? 0),
          mounting_height: Number(eyeMounting.mounting_height ?? 0),
          vertex_distance: Number(eyeMounting.vertex_distance ?? 12),
          pantoscopic_angle: Number(eyeMounting.pantoscopic_angle ?? 0),
          frame_wrap: Number(eyeMounting.frame_wrap ?? 0),
        };
      }
    }

    // Si aucune donnée n'a été trouvée dans les colonnes directes, utiliser le fallback
    if (!right_eye && !left_eye) {
      const lensItems = await pool.query(
        `SELECT * FROM core_sales_order_item 
         WHERE sales_order_id = $1 AND line_type = 'optical_job'`,
        [data.sales_order_id]
      );
      
      for (const item of lensItems.rows) {
        const metadata = parseJsonField(item.metadata, {});
        
        // Nouveau format (imbriqué)
        if (metadata.right_eye || metadata.left_eye) {
          if (metadata.right_eye) {
            right_eye = normalizeEye(metadata.right_eye);
          }
          if (metadata.left_eye) {
            left_eye = normalizeEye(metadata.left_eye);
          }
          if (metadata.mounting && !mounting) {
            const eyeMounting = metadata.mounting;
            mounting = {
              pupillary_distance: Number(eyeMounting.pupillary_distance ?? 0),
              mounting_height: Number(eyeMounting.mounting_height ?? 0),
              vertex_distance: Number(eyeMounting.vertex_distance ?? 12),
              pantoscopic_angle: Number(eyeMounting.pantoscopic_angle ?? 0),
              frame_wrap: Number(eyeMounting.frame_wrap ?? 0),
            };
          }
        } else {
          // Ancien format (à plat)
          const lensConfig = metadata.lens_config || {};
          const prescription = metadata.prescription || {};
          
          if (metadata.eye === 'OD') {
            right_eye = {
              type: lensConfig.type || '-',
              index: lensConfig.index || '-',
              material: lensConfig.material || '-',
              coatings: lensConfig.coatings || [],
              coatings_detail: lensConfig.coatings_detail || [],
              tint: lensConfig.tint || null,
              prescription: {
                sphere: prescription.sphere || 0,
                cylinder: prescription.cylinder || 0,
                axis: prescription.axis || null,
                addition: prescription.addition || null,
                prism: prescription.prism || null,
                prism_base: prescription.prism_base || null
              }
            };
          }
          if (metadata.eye === 'OG') {
            left_eye = {
              type: lensConfig.type || '-',
              index: lensConfig.index || '-',
              material: lensConfig.material || '-',
              coatings: lensConfig.coatings || [],
              coatings_detail: lensConfig.coatings_detail || [],
              tint: lensConfig.tint || null,
              prescription: {
                sphere: prescription.sphere || 0,
                cylinder: prescription.cylinder || 0,
                axis: prescription.axis || null,
                addition: prescription.addition || null,
                prism: prescription.prism || null,
                prism_base: prescription.prism_base || null
              }
            };
          }
          
          if (!mounting) {
            const normalizedMounting = normalizeMounting(metadata);
            if (Object.values(normalizedMounting).some((value) => value !== 0)) {
              mounting = normalizedMounting;
            }
          }
        }
      }
    }
    
    const settings = await pool.query(
      `SELECT * FROM company_settings WHERE tenant_id = $1`,
      [req.tenantId]
    );
    
    const clientName = data.first_name && data.last_name
      ? `${data.first_name} ${data.last_name}`
      : 'Client non renseigné';
      
    res.json({
      success: true,
      data: {
        order_number: data.order_id || data.order_number,
        date: new Date(data.created_at).toLocaleDateString('fr-FR'),
        client_name: clientName,
        supplier_name: data.supplier_name || 'Laboratoire externe',
        right_eye: right_eye,
        left_eye: left_eye,
        mounting: mounting,
        notes: data.technical_notes || data.notes
      },
      settings: settings.rows[0] || {}
    });
    
  } catch (err) {
    console.error('Erreur GET supplier-order-data:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
