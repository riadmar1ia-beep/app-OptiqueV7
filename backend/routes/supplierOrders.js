// backend/routes/supplierOrders.js
// GESTION DES COMMANDES FOURNISSEUR DE VERRES (OPTICAL LAB ORDERS)
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// =======================
// GET /api/orders/supplier/orders - Liste des commandes fournisseur verres
// =======================
router.get('/orders', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         so.order_id, 
         so.status, 
         so.created_at, 
         so.expected_price_cents,
         so.actual_price_cents,
         c.first_name || ' ' || c.last_name AS customer_name,
         c.phone AS customer_phone,
         s.name AS supplier_name,
         so_order.order_number as sales_order_number,
         so.supplier_invoice_number,
         so.supplier_invoice_date,
         so.supplier_invoice_amount,
         so.credit_note_number,
         so.credit_note_amount_cents,
         so.credit_note_date
       FROM supplier_orders so
       LEFT JOIN clients c ON c.id = so.client_id
       LEFT JOIN suppliers s ON s.id = so.supplier_id
       LEFT JOIN core_sales_order so_order ON so_order.id = so.sales_order_id
       WHERE so.tenant_id = $1
         AND (so.source_type IS NULL OR so.source_type = 'optical_lab' OR so.source_type != 'purchase_order')
       ORDER BY so.created_at DESC`,
      [req.tenantId]
    );
    
    const formattedResult = result.rows.map(row => ({
      ...row,
      expected_price_dh: ((row.expected_price_cents || 0) / 100).toFixed(2),
      actual_price_dh: ((row.actual_price_cents || 0) / 100).toFixed(2)
    }));
    
    res.json({ success: true, data: formattedResult });
  } catch (err) {
    console.error('Erreur GET supplier orders:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/orders/supplier/orders/:orderId - Détail d'une commande verres
// =======================
router.get('/orders/:orderId', async (req, res) => {
  const { orderId } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT 
         so.*,
         c.id as client_id,
         CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
         c.phone AS customer_phone,
         c.email AS customer_email,
         s.name AS supplier_name,
         s.id as supplier_id,
         cso.order_number as sales_order_number
       FROM supplier_orders so
       LEFT JOIN clients c ON c.id = so.client_id
       LEFT JOIN suppliers s ON s.id = so.supplier_id
       LEFT JOIN core_sales_order cso ON cso.id = so.sales_order_id
       WHERE so.order_id = $1 AND so.tenant_id = $2`,
      [orderId, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Commande fournisseur non trouvée' });
    }
    
    // Récupérer les items depuis core_sales_order_item
    const salesOrder = await pool.query(
      `SELECT 
         csoi.id,
         csoi.sales_order_id,
         csoi.line_type as item_type,
         csoi.description,
         csoi.quantity,
         csoi.unit_price_cents,
         csoi.total_cents as client_price_cents,
         csoi.tax_amount_cents as client_tax_cents,
         csoi.metadata,
         (csoi.total_cents + COALESCE(csoi.tax_amount_cents, 0)) as client_total_ttc_cents
       FROM core_sales_order_item csoi
       WHERE csoi.sales_order_id = $1 AND csoi.line_type = 'optical_job'`,
      [result.rows[0].sales_order_id]
    );
    
    const data = result.rows[0];
    data.expected_price_dh = ((data.expected_price_cents || 0) / 100).toFixed(2);
    data.actual_price_dh = ((data.actual_price_cents || 0) / 100).toFixed(2);
    data.client_items = salesOrder.rows;
    
    if (data.items && typeof data.items === 'string') {
      data.items = JSON.parse(data.items);
    }
    
    res.json({ success: true, data: data });
  } catch (err) {
    console.error('Erreur GET supplier order detail:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// PUT /api/orders/supplier/orders/:orderId/status - Changer le statut
// =======================
router.put('/orders/:orderId/status', async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE supplier_orders 
       SET status = $1 
       WHERE order_id = $2 AND tenant_id = $3
       RETURNING *`,
      [status, orderId, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur PUT status:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// POST /api/orders/supplier/orders/:orderId/receive - Réceptionner
// =======================
router.post('/orders/:orderId/receive', async (req, res) => {
  const { orderId } = req.params;
  const { 
    invoice_number, 
    invoice_date, 
    amount_ht, 
    amount_tva, 
    amount_ttc, 
    notes
  } = req.body;
  
  const dbClient = await pool.connect();
  
  try {
    await dbClient.query('BEGIN');
    
    const supplierOrder = await dbClient.query(
      `SELECT so.id, so.sales_order_id, so.status, so.supplier_id, so.expected_price_cents
       FROM supplier_orders so
       WHERE so.order_id = $1 AND so.tenant_id = $2`,
      [orderId, req.tenantId]
    );
    
    if (supplierOrder.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Commande fournisseur non trouvée' });
    }
    
    const currentStatus = supplierOrder.rows[0].status;
    const allowedStatuses = ['shipped', 'approved', 'sent'];
    
    if (!allowedStatuses.includes(currentStatus)) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Cette commande ne peut pas être réceptionnée. Statut actuel: ${currentStatus}` 
      });
    }
    
    const actualPriceCents = (amount_ht || 0) * 100;
    
    await dbClient.query(
      `UPDATE supplier_orders 
       SET status = 'received', 
           received_at = NOW(),
           actual_price_cents = $1,
           supplier_invoice_number = $2,
           supplier_invoice_date = $3,
           supplier_invoice_amount = $4
       WHERE order_id = $5 AND tenant_id = $6`,
      [actualPriceCents, invoice_number, invoice_date, amount_ht, orderId, req.tenantId]
    );
    
 // ============================================
// METTRE À JOUR LES PRIX D'ACHAT DES JOBS OPTIQUES
// ============================================
const salesOrderId = supplierOrder.rows[0].sales_order_id;

const lensCountResult = await dbClient.query(
  `SELECT COUNT(*) AS count
   FROM core_sales_order_item
   WHERE sales_order_id = $1
     AND line_type = 'optical_job'`,
  [salesOrderId]
);

const lensCount = parseInt(lensCountResult.rows[0].count, 10) || 1;
const costPerLens = Math.round(actualPriceCents / lensCount);

console.log({
  salesOrderId,
  actualPriceCents,
  lensCount,
  costPerLens
});

const updateResult = await dbClient.query(
  `UPDATE core_optical_job
   SET cost_price_cents = $1,
       supplier_id = $2,
       updated_at = NOW()
   WHERE sales_order_id = $3`,
  [costPerLens, supplierOrder.rows[0].supplier_id, salesOrderId]
);

console.log({
  salesOrderId,
  supplierId: supplierOrder.rows[0].supplier_id,
  costPerLens,
  updatedRows: updateResult.rowCount
});

    
    if (invoice_number) {
      const safeAmountHt = Number(amount_ht) || 0;
      const safeAmountTva = Number(amount_tva) || 0;
      const safeAmountTtc = Number(amount_ttc) || (safeAmountHt + safeAmountTva);
      
      const existingInvoice = await dbClient.query(
        `SELECT id FROM supplier_invoices 
         WHERE invoice_number = $1 AND tenant_id = $2`,
        [invoice_number, req.tenantId]
      );
      
      if (existingInvoice.rows.length === 0) {
        await dbClient.query(
          `INSERT INTO supplier_invoices 
           (tenant_id, supplier_id, order_id, invoice_number, invoice_date,
            amount_ht, amount_tva, amount_ttc, notes, payment_status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
          [req.tenantId, supplierOrder.rows[0].supplier_id, supplierOrder.rows[0].id,
           invoice_number, invoice_date || new Date(), safeAmountHt, safeAmountTva,
           safeAmountTtc, notes || null, 'pending']
        );
      }
    }
    
    await dbClient.query('COMMIT');
    
    const marginCents = (supplierOrder.rows[0].expected_price_cents || 0) - actualPriceCents;
    
    res.json({ 
      success: true, 
      message: '✅ Commande réceptionnée avec succès',
      data: {
        expected_price_dh: ((supplierOrder.rows[0].expected_price_cents || 0) / 100).toFixed(2),
        actual_price_dh: (actualPriceCents / 100).toFixed(2),
        margin_dh: (marginCents / 100).toFixed(2)
      }
    });
    
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Erreur réception:', err);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// =======================
// POST /api/orders/supplier/orders/:orderId/validate - Valider contrôle qualité
// =======================
router.post('/orders/:orderId/validate', async (req, res) => {
  const { orderId } = req.params;
  const { notes } = req.body;
  const dbClient = await pool.connect();
  
  try {
    await dbClient.query('BEGIN');
    
    const supplierOrder = await dbClient.query(
      `SELECT so.id, so.sales_order_id, so.status
       FROM supplier_orders so
       WHERE so.order_id = $1 AND so.tenant_id = $2`,
      [orderId, req.tenantId]
    );
    
    if (supplierOrder.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Commande fournisseur non trouvée' });
    }
    
    const allowedStatuses = ['received', 'quality_pending', 'replacement_received'];
    if (!allowedStatuses.includes(supplierOrder.rows[0].status)) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ 
        error: `La commande ne peut pas être validée. Statut actuel: ${supplierOrder.rows[0].status}` 
      });
    }
    
    await dbClient.query(
      `UPDATE supplier_orders 
       SET status = 'validated', 
           quality_control_at = NOW(),
           quality_control_notes = $1
       WHERE order_id = $2 AND tenant_id = $3`,
      [notes || null, orderId, req.tenantId]
    );
    
    const allOrdersValidated = await dbClient.query(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'validated' THEN 1 ELSE 0 END) as validated
       FROM supplier_orders 
       WHERE sales_order_id = $1 AND tenant_id = $2`,
      [supplierOrder.rows[0].sales_order_id, req.tenantId]
    );
    
    const total = parseInt(allOrdersValidated.rows[0].total);
    const validated = parseInt(allOrdersValidated.rows[0].validated);
    
    let salesOrderUpdated = false;
    if (total > 0 && total === validated) {
      await dbClient.query(
        `UPDATE core_sales_order 
         SET status = 'ready' 
         WHERE id = $1 AND tenant_id = $2`,
        [supplierOrder.rows[0].sales_order_id, req.tenantId]
      );
      salesOrderUpdated = true;
    }
    
    await dbClient.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: salesOrderUpdated 
        ? '✅ Contrôle qualité validé - Commande client PRÊTE'
        : '✅ Contrôle qualité validé',
      sales_order_ready: salesOrderUpdated
    });
    
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Erreur validation:', err);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// =======================
// POST /api/orders/supplier/orders/:orderId/dispute - Signaler un litige
// =======================
router.post('/orders/:orderId/dispute', async (req, res) => {
  const { orderId } = req.params;
  const { issues, notes } = req.body;
  const dbClient = await pool.connect();
  
  try {
    await dbClient.query('BEGIN');
    
    const supplierOrder = await dbClient.query(
      `SELECT so.id, so.sales_order_id, so.status
       FROM supplier_orders so
       WHERE so.order_id = $1 AND so.tenant_id = $2`,
      [orderId, req.tenantId]
    );
    
    if (supplierOrder.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Commande fournisseur non trouvée' });
    }
    
    await dbClient.query(
      `UPDATE supplier_orders 
       SET status = 'dispute', quality_control_notes = $1
       WHERE order_id = $2 AND tenant_id = $3`,
      [notes || null, orderId, req.tenantId]
    );
    
    for (const issue of issues) {
      await dbClient.query(
        `INSERT INTO supplier_order_issues 
         (supplier_order_id, item_type, issue_type, description, quantity, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [supplierOrder.rows[0].id, issue.item_type, issue.issue_type, 
         issue.description, issue.quantity || 1, 'open']
      );
    }
    
    await dbClient.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: '⚠️ Litige signalé - En attente de résolution',
      nb_issues: issues.length
    });
    
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Erreur litige:', err);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// =======================
// PUT /api/orders/supplier/orders/:orderId/dispute/resolve - Résoudre litige
// =======================
router.put('/orders/:orderId/dispute/resolve', async (req, res) => {
  const { orderId } = req.params;
  const { resolved_notes } = req.body;
  const dbClient = await pool.connect();
  
  try {
    await dbClient.query('BEGIN');
    
    await dbClient.query(
      `UPDATE supplier_order_issues 
       SET status = 'resolved', resolved_at = NOW(), notes = $1
       WHERE supplier_order_id = (SELECT id FROM supplier_orders WHERE order_id = $2)
         AND status = 'open'`,
      [resolved_notes || null, orderId]
    );
    
    await dbClient.query(
      `UPDATE supplier_orders 
       SET status = 'received', quality_control_notes = $1
       WHERE order_id = $2 AND tenant_id = $3`,
      ['Litige résolu - En attente de re-contrôle', orderId, req.tenantId]
    );
    
    await dbClient.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: '✅ Litige résolu - Retour au contrôle qualité'
    });
    
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Erreur résolution litige:', err);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// =======================
// GET /api/orders/supplier/orders/:orderId/issues - Récupérer les litiges
// =======================
router.get('/orders/:orderId/issues', async (req, res) => {
  const { orderId } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT * FROM supplier_order_issues 
       WHERE supplier_order_id = (SELECT id FROM supplier_orders WHERE order_id = $1)
       ORDER BY created_at DESC`,
      [orderId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erreur GET issues:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// POST /api/orders/supplier/orders/:orderId/credit-note - Demander avoir
// =======================
router.post('/orders/:orderId/credit-note', async (req, res) => {
  const { orderId } = req.params;
  const { credit_note_number, amount_dh, credit_note_date, notes } = req.body;
  
  const dbClient = await pool.connect();
  
  try {
    await dbClient.query('BEGIN');
    
    const orderResult = await dbClient.query(
      `SELECT id, supplier_invoice_amount FROM supplier_orders 
       WHERE order_id = $1 AND tenant_id = $2`,
      [orderId, String(req.tenantId)]
    );
    
    if (orderResult.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    
    const supplierOrderUuid = orderResult.rows[0].id;
    const invoiceAmount = parseFloat(orderResult.rows[0].supplier_invoice_amount) || 0;
    const amountCents = amount_dh ? Math.round(amount_dh * 100) : null;
    
    if (credit_note_number) {
      await dbClient.query(
        `UPDATE supplier_orders 
         SET status = 'credit_note',
             credit_note_number = $1,
             credit_note_amount_cents = $2,
             credit_note_date = $3,
             quality_control_notes = $4
         WHERE order_id = $5 AND tenant_id = $6`,
        [credit_note_number, amountCents, credit_note_date || new Date(), 
         notes || `Avoir ${credit_note_number}`, orderId, String(req.tenantId)]
      );
    } else {
      await dbClient.query(
        `UPDATE supplier_orders 
         SET status = 'credit_note',
             quality_control_notes = $1
         WHERE order_id = $2 AND tenant_id = $3`,
        [notes || 'Demande d\'avoir', orderId, String(req.tenantId)]
      );
    }
    
    const eventNotes = credit_note_number 
      ? `Avoir ${credit_note_number} de ${amount_dh || 0} DH`
      : notes || 'Demande d\'avoir';
    
    const eventData = JSON.stringify({ 
      credit_note_number: credit_note_number || null, 
      amount_dh: amount_dh || 0, 
      credit_note_date: credit_note_date || null,
      invoice_amount: invoiceAmount,
      remaining: invoiceAmount - (amount_dh || 0)
    });
    
    await dbClient.query(
      `INSERT INTO supplier_order_events 
       (supplier_order_id, event_type, event_data, notes, tenant_id, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [supplierOrderUuid, 'credit_note', eventData, eventNotes, String(req.tenantId)]
    );
    
    await dbClient.query('COMMIT');
    
    const remainingAmount = invoiceAmount - (amount_dh || 0);
    
    res.json({ 
      success: true, 
      message: remainingAmount === 0 && amount_dh > 0
        ? '✅ Avoir enregistré - Solde = 0 DH' 
        : amount_dh > 0 ? `⚠️ Avoir partiel - Solde restant: ${remainingAmount.toFixed(2)} DH`
        : 'Demande d\'avoir enregistrée',
      data: {
        credit_note_number: credit_note_number || null,
        amount_dh: amount_dh || 0,
        remaining_amount: remainingAmount,
        is_complete: remainingAmount === 0 && amount_dh > 0
      }
    });
    
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Erreur credit note:', err);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// =======================
// GET /api/orders/supplier/orders/:orderId/events - Historique
// =======================
router.get('/orders/:orderId/events', async (req, res) => {
  const { orderId } = req.params;
  
  try {
    const orderResult = await pool.query(
      `SELECT id FROM supplier_orders 
       WHERE order_id = $1 AND tenant_id = $2`,
      [orderId, String(req.tenantId)]
    );
    
    if (orderResult.rows.length === 0) {
      return res.json({ success: true, data: [] });
    }
    
    const internalId = orderResult.rows[0].id;
    
    const result = await pool.query(
      `SELECT * FROM supplier_order_events 
       WHERE supplier_order_id = $1
       ORDER BY created_at DESC`,
      [internalId]
    );
    
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erreur GET events:', err);
    res.status(500).json({ error: err.message });
  }
});


/// =======================
// POST /api/supplier-orders - Créer une commande fournisseur (depuis confirmation client)
// =======================
router.post('/', async (req, res) => {
  const { sales_order_id, supplier_id, items, notes } = req.body;
  const dbClient = await pool.connect();
  
  try {
    await dbClient.query('BEGIN');
    
    // Generate sequential order ID in format BCF-YYYY-XXXXX
      const year = new Date().getFullYear();
      // Find the latest order number for the current year
      const latestResult = await dbClient.query(
        `SELECT order_id FROM supplier_orders WHERE order_id LIKE $1 ORDER BY created_at DESC LIMIT 1`,
        [`BCF-${year}-%`]
      );
      let nextSeq = 1;
      if (latestResult.rows.length > 0) {
        const latestId = latestResult.rows[0].order_id;
        const match = latestId.match(/BCF-\d{4}-(\d{5})/);
        if (match) {
          nextSeq = parseInt(match[1], 10) + 1;
        }
      }
      const orderId = `BCF-${year}-${String(nextSeq).padStart(5, '0')}`;
    
    const salesOrder = await dbClient.query(
      `SELECT 
         cso.client_id,
         CONCAT(cl.first_name, ' ', cl.last_name) as customer_name
       FROM core_sales_order cso
       LEFT JOIN clients cl ON cl.id = cso.client_id
       WHERE cso.id = $1 AND cso.tenant_id = $2`,
      [sales_order_id, req.tenantId]
    );

    const clientId = salesOrder.rows[0]?.client_id || null;
    
    let total_expected_price = 0;
    let right_eye_config = null;
    let left_eye_config = null;

    // Parcourir tous les items pour extraire TOUTES les données
    for (const item of items) {
      total_expected_price += (item.unit_price_cents || 0) * (item.quantity || 1);
      
      if (item.metadata) {
        const metadata = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
        
        // Extraire les données complètes pour chaque œil
        if (metadata.eye === 'OD' || metadata.right_eye) {
          const eyeData = metadata.right_eye || metadata;
          right_eye_config = {
            type: eyeData.type || metadata.lens_config?.type || '-',
            index: eyeData.index || metadata.lens_config?.index || '-',
            material: eyeData.material || metadata.lens_config?.material || '-',
            prescription: eyeData.prescription || metadata.prescription || null,
            coatings: eyeData.coatings || metadata.lens_config?.coatings || [],
            coatings_detail: eyeData.coatings_detail || metadata.lens_config?.coatings_detail || [],
            tint: eyeData.tint || metadata.lens_config?.tint || null,
            price: eyeData.price || metadata.price || 0,
            // ✅ Ajouter les paramètres de montage dans right_eye_config
            mounting: metadata.mounting || null
          };
        }
        
        if (metadata.eye === 'OG' || metadata.left_eye) {
          const eyeData = metadata.left_eye || metadata;
          left_eye_config = {
            type: eyeData.type || metadata.lens_config?.type || '-',
            index: eyeData.index || metadata.lens_config?.index || '-',
            material: eyeData.material || metadata.lens_config?.material || '-',
            prescription: eyeData.prescription || metadata.prescription || null,
            coatings: eyeData.coatings || metadata.lens_config?.coatings || [],
            coatings_detail: eyeData.coatings_detail || metadata.lens_config?.coatings_detail || [],
            tint: eyeData.tint || metadata.lens_config?.tint || null,
            price: eyeData.price || metadata.price || 0,
            // ✅ Ajouter les paramètres de montage dans left_eye_config
            mounting: metadata.mounting || null
          };
        }
      }
    }
    
    // Log pour déboguer
    console.log('📦 Données extraites pour la commande fournisseur:', {
      right_eye_config,
      left_eye_config
    });
    
    // ✅ INSERT avec les colonnes existantes uniquement
      const result = await dbClient.query(
        `INSERT INTO supplier_orders 
         (tenant_id, order_id, sales_order_id, supplier_id,
          right_eye_config, left_eye_config, items, status, 
          expected_price_cents, source_type, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         RETURNING *`,
        [
          req.tenantId, orderId, sales_order_id, supplier_id,
          JSON.stringify(right_eye_config), JSON.stringify(left_eye_config),
          JSON.stringify(items), 'shipped',
          total_expected_price, 'optical_lab'
        ]
      );
    
    // Mettre à jour le statut de la commande client
    await dbClient.query(
      `UPDATE core_sales_order 
       SET status = 'pending', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [sales_order_id, req.tenantId]
    );
    
    await dbClient.query('COMMIT');
    
    console.log('✅ Commande fournisseur créée avec succès:', {
      id: result.rows[0].id,
      order_id: orderId
    });
    
    res.json({ 
      success: true, 
      data: result.rows[0],
      message: `Commande fournisseur ${orderId} créée avec succès`
    });
    
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('❌ Erreur création commande fournisseur:', err);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// =======================
// GET /api/supplier-orders/sales-order/:salesOrderId - Récupérer commandes fournisseur liées
// =======================
router.get('/sales-order/:salesOrderId', async (req, res) => {
  const { salesOrderId } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT so.*, s.name as supplier_name
       FROM supplier_orders so
       LEFT JOIN suppliers s ON s.id = so.supplier_id
       WHERE so.sales_order_id = $1 AND so.tenant_id = $2`,
      [salesOrderId, req.tenantId]
    );
    
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erreur:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/supplier-orders/:id - Récupérer une commande fournisseur pour le PDF
// =======================
// =======================
// GET /api/supplier-orders/:id - Récupérer une commande fournisseur pour le PDF
// =======================
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT so.*, s.name as supplier_name
       FROM supplier_orders so
       LEFT JOIN suppliers s ON s.id = so.supplier_id
       WHERE so.id = $1 AND so.tenant_id = $2`,
      [id, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    
    const row = result.rows[0];
    
    // ✅ Fonction pour normaliser un œil (sans TypeScript)
    const normalizeEye = function(eyeConfig) {
      if (!eyeConfig) return null;
      return {
        type: eyeConfig.type || '-',
        index: eyeConfig.index || '-',
        material: eyeConfig.material || '-',
        prescription: eyeConfig.prescription ? {
          sphere: eyeConfig.prescription.sphere || 0,
          cylinder: eyeConfig.prescription.cylinder || 0,
          axis: eyeConfig.prescription.axis || null,
          addition: eyeConfig.prescription.addition || null,
          prism: eyeConfig.prescription.prism || null,
          prism_base: eyeConfig.prescription.prism_base || null
        } : null,
        coatings: eyeConfig.coatings || [],
        coatings_detail: eyeConfig.coatings_detail || [],
        tint: eyeConfig.tint || null
      };
    };
    
    const rightEyeObj = typeof row.right_eye_config === 'string' ? JSON.parse(row.right_eye_config || '{}') : row.right_eye_config;
    const leftEyeObj = typeof row.left_eye_config === 'string' ? JSON.parse(row.left_eye_config || '{}') : row.left_eye_config;
    const eyeMounting = (rightEyeObj?.mounting || leftEyeObj?.mounting || row.mounting_params);

    const pdfData = {
      order_number: row.order_id,
      date: new Date(row.created_at).toLocaleDateString('fr-FR'),
      supplier_name: row.supplier_name,
      right_eye: normalizeEye(row.right_eye_config),
      left_eye: normalizeEye(row.left_eye_config),
      mounting: eyeMounting ? {
        pupillary_distance: Number(eyeMounting.pupillary_distance ?? 0),
        mounting_height: Number(eyeMounting.mounting_height ?? 0),
        vertex_distance: Number(eyeMounting.vertex_distance ?? 12),
        pantoscopic_angle: Number(eyeMounting.pantoscopic_angle ?? 0),
        frame_wrap: Number(eyeMounting.frame_wrap ?? 0)
      } : null,
      notes: row.notes
    };
    
    console.log('📦 Données PDF depuis backend:', JSON.stringify(pdfData, null, 2));
    
    const settingsResult = await pool.query(
      `SELECT * FROM company_settings WHERE tenant_id = $1 LIMIT 1`,
      [req.tenantId]
    );
    
    res.json({ 
      success: true, 
      data: pdfData, 
      settings: settingsResult.rows[0] || {} 
    });
    
  } catch (err) {
    console.error('Erreur GET supplier order:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;