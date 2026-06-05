// backend/routes/purchaseOrders.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../config/database');

// =======================
// GET - Liste des commandes d'achat
// =======================
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT so.*, s.name as supplier_name
       FROM supplier_orders so
       LEFT JOIN suppliers s ON s.id = so.supplier_id
       WHERE so.tenant_id = $1 
         AND so.source_type = 'purchase_order'
       ORDER BY so.created_at DESC`,
      [req.tenantId]
    );
    
    const formattedResult = result.rows.map(row => {
      let items = row.items;
      if (items && typeof items === 'string') {
        try {
          items = JSON.parse(items);
        } catch(e) {
          items = [];
        }
      }
      
      return {
        ...row,
        items: items || [],
        expected_price_dh: ((row.expected_price_cents || 0) / 100).toFixed(2),
        actual_price_dh: ((row.actual_price_cents || 0) / 100).toFixed(2)
      };
    });
    
    res.json({ success: true, data: formattedResult });
  } catch (err) {
    console.error('Erreur GET purchase orders:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET - Détail d'une commande d'achat
// =======================
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const orderResult = await pool.query(
      `SELECT so.*, s.name as supplier_name
       FROM supplier_orders so
       LEFT JOIN suppliers s ON s.id = so.supplier_id
       WHERE so.order_id = $1 AND so.tenant_id = $2
         AND so.source_type = 'purchase_order'`,
      [id, req.tenantId]
    );
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    
    const data = orderResult.rows[0];
    data.expected_price_dh = ((data.expected_price_cents || 0) / 100).toFixed(2);
    data.actual_price_dh = ((data.actual_price_cents || 0) / 100).toFixed(2);
    
    let items = [];
    if (data.items) {
      if (typeof data.items === 'string') {
        try {
          items = JSON.parse(data.items);
        } catch(e) {
          items = [];
        }
      } else {
        items = data.items;
      }
    }
    
    data.items = items;
    
    res.json({ success: true, data: data });
  } catch (err) {
    console.error('Erreur GET purchase order detail:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// POST - Créer une commande d'achat
// =======================
router.post('/', async (req, res) => {
  const { supplier_id, items, notes } = req.body;
  
  const dbClient = await pool.connect();
  console.log('📦 Items reçus:', items);
  
  try {
    await dbClient.query('BEGIN');
    
    const orderId = 'PO-' + Date.now() + '-' + crypto.randomUUID().slice(0, 8);
    
    let expectedPriceCents = 0;
    for (const item of items) {
      expectedPriceCents += (item.purchase_price_cents || item.unit_price_cents || 0) * (item.quantity || 1);
    }
    
    const result = await dbClient.query(
      `INSERT INTO supplier_orders 
       (tenant_id, order_id, supplier_id, source_type, order_type,
        items, expected_price_cents, status, technical_notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [
        req.tenantId,
        orderId,
        supplier_id,
        'purchase_order',
        'mixed',
        JSON.stringify(items || []),
        expectedPriceCents,
        'draft',
        notes || null
      ]
    );
    
    await dbClient.query('COMMIT');
    
    const data = result.rows[0];
    data.expected_price_dh = (data.expected_price_cents / 100).toFixed(2);
    data.actual_price_dh = ((data.actual_price_cents || 0) / 100).toFixed(2);
    
    if (data.items && typeof data.items === 'string') {
      data.items = JSON.parse(data.items);
    }
    
    res.status(201).json({ 
      success: true, 
      data: data,
      message: 'Commande d\'achat créée avec succès'
    });
    
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Erreur POST purchase order:', err);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// =======================
// PUT - Mettre à jour le statut
// =======================
router.put('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE supplier_orders 
       SET status = $1::varchar,
           logistic_status = CASE 
             WHEN $1::varchar = 'sent' THEN 'sent'::varchar
             WHEN $1::varchar = 'approved' THEN 'approved'::varchar
             WHEN $1::varchar = 'received' THEN 'received'::varchar
             WHEN $1::varchar = 'passed' THEN 'completed'::varchar
             ELSE logistic_status
           END,
           quality_status = CASE 
             WHEN $1::varchar = 'quality_pending' THEN 'pending'::varchar
             WHEN $1::varchar = 'passed' THEN 'approved'::varchar
             WHEN $1::varchar = 'dispute' THEN 'disputed'::varchar
             ELSE quality_status
           END,
           received_at = CASE WHEN $1::varchar = 'received' THEN NOW() ELSE received_at END,
           quality_control_at = CASE WHEN $1::varchar = 'quality_pending' THEN NOW() ELSE quality_control_at END,
           updated_at = NOW()
       WHERE order_id = $2 AND tenant_id = $3
         AND source_type = 'purchase_order'
       RETURNING *`,
      [status, id, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur PUT purchase order status:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// POST - Réceptionner une commande d'achat
// =======================
router.post('/:id/receive', async (req, res) => {
  const { id } = req.params;
  const { invoice_number, invoice_date, amount_ht, amount_tva, amount_ttc, notes, items } = req.body;
  
  const dbClient = await pool.connect();
  
  try {
    await dbClient.query('BEGIN');
    
    console.log(`📦 Réception commande: ${id}`);
    console.log('📦 Body reçu:', req.body);
    
    const purchaseOrder = await dbClient.query(
      `SELECT id, supplier_id, items, expected_price_cents 
       FROM supplier_orders 
       WHERE order_id = $1 AND tenant_id = $2
         AND source_type = 'purchase_order'`,
      [id, req.tenantId]
    );
    
    if (purchaseOrder.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    
    let actualPriceCents = 0;
    if (amount_ht) {
      actualPriceCents = amount_ht * 100;
    } else if (items && items.length > 0) {
      for (const item of items) {
        actualPriceCents += (item.unit_price_cents || 0) * (item.quantity || 1);
      }
    } else {
      actualPriceCents = purchaseOrder.rows[0].expected_price_cents;
    }
    
    let itemsToProcess = items;
    if (!itemsToProcess || itemsToProcess.length === 0) {
      let storedItems = purchaseOrder.rows[0].items;
      if (typeof storedItems === 'string') {
        storedItems = JSON.parse(storedItems);
      }
      itemsToProcess = storedItems;
    }
    
    await dbClient.query(
      `UPDATE supplier_orders 
       SET status = 'received',
           logistic_status = 'received',
           received_at = NOW(),
           actual_price_cents = $1,
           supplier_invoice_number = $2,
           supplier_invoice_date = $3,
           supplier_invoice_amount = $4,
           updated_at = NOW()
       WHERE order_id = $5 AND tenant_id = $6`,
      [actualPriceCents, invoice_number || null, invoice_date || null, amount_ht || 0, id, req.tenantId]
    );
    
    for (const item of itemsToProcess) {
      if (item.product_id) {
        const hasStockColumn = await dbClient.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'products' AND column_name = 'stock_quantity'
          )
        `);
        
        if (hasStockColumn.rows[0].exists) {
          await dbClient.query(
            `UPDATE products 
             SET stock_quantity = COALESCE(stock_quantity, 0) + $1,
                 updated_at = NOW()
             WHERE id = $2 AND tenant_id = $3`,
            [item.quantity, item.product_id, req.tenantId]
          );
        }
        
        await dbClient.query(
          `INSERT INTO stock_movements 
           (tenant_id, product_id, type, quantity, source_type, source_id, created_at)
           VALUES ($1, $2, 'IN', $3, 'purchase_order', $4, NOW())`,
          [req.tenantId, item.product_id, item.quantity, purchaseOrder.rows[0].id]
        );
        
        console.log(`✅ Stock +${item.quantity} pour produit ${item.product_id}`);
      }
    }
    
    if (invoice_number) {
      await dbClient.query(
        `INSERT INTO supplier_invoices 
         (tenant_id, supplier_id, order_id, invoice_number, invoice_date,
          amount_ht, amount_tva, amount_ttc, payment_status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW())`,
        [req.tenantId, purchaseOrder.rows[0].supplier_id, purchaseOrder.rows[0].id,
         invoice_number, invoice_date || new Date(), amount_ht || 0, amount_tva || 0, amount_ttc || 0]
      );
    }
    
    await dbClient.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: '✅ Commande d\'achat réceptionnée et stock mis à jour',
      data: {
        actual_price_dh: (actualPriceCents / 100).toFixed(2),
        invoice_number: invoice_number || null,
        items_processed: itemsToProcess.length
      }
    });
    
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('❌ Erreur réception purchase order:', err);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// =======================
// DELETE - Supprimer une commande
// =======================
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const check = await pool.query(
      `SELECT status FROM supplier_orders 
       WHERE order_id = $1 AND tenant_id = $2
         AND source_type = 'purchase_order'`,
      [id, req.tenantId]
    );
    
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    
    if (check.rows[0].status !== 'draft') {
      return res.status(400).json({ error: 'Impossible de supprimer une commande envoyée' });
    }
    
    await pool.query(
      `DELETE FROM supplier_orders 
       WHERE order_id = $1 AND tenant_id = $2`,
      [id, req.tenantId]
    );
    
    res.json({ success: true, message: 'Commande supprimée' });
  } catch (err) {
    console.error('Erreur DELETE purchase order:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// POST - Créer un avoir (credit note)
// =======================
router.post('/:orderId/credit-note', async (req, res) => {
  const { orderId } = req.params;
  const { credit_note_number, amount_dh, credit_note_date, notes } = req.body;
  const tenantId = req.tenantId;
  const userId = req.userId;

  const dbClient = await pool.connect();
  
  try {
    await dbClient.query('BEGIN');

    // Récupérer la commande
    const orderResult = await dbClient.query(
      `SELECT id, status, supplier_invoice_amount 
       FROM supplier_orders 
       WHERE order_id = $1 AND tenant_id = $2 AND source_type = 'purchase_order'`,
      [orderId, String(tenantId)]
    );
    
    if (orderResult.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    
    const order = orderResult.rows[0];
    
    // Vérifier que la commande n'est pas déjà validée
    if (order.status === 'validated') {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'Commande déjà validée, impossible de créer un avoir' });
    }
    
    // Vérifier que le montant ne dépasse pas la facture
    if (order.supplier_invoice_amount && amount_dh > order.supplier_invoice_amount) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Le montant de l'avoir (${amount_dh} DH) dépasse le montant de la facture (${order.supplier_invoice_amount} DH)` 
      });
    }
    
    // Créer l'événement dans purchase_order_events
    const eventData = JSON.stringify({
      credit_note_number,
      amount_dh,
      amount_ht: amount_dh,
      amount_ttc: amount_dh * 1.2,
      credit_note_date,
      notes
    });
    
    const eventResult = await dbClient.query(
      `INSERT INTO purchase_order_events 
       (supplier_order_id, event_type, data, created_by, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [order.id, 'credit_note_created', eventData, userId || null]
    );
    
    // Mettre à jour la commande avec l'avoir
    await dbClient.query(
      `UPDATE supplier_orders 
       SET status = 'credit_note',
           credit_note_number = $1,
           credit_note_amount_cents = $2,
           credit_note_date = $3,
           updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5`,
      [credit_note_number, Math.round(amount_dh * 100), credit_note_date, order.id, tenantId]
    );
    
    await dbClient.query('COMMIT');
    
    // Rafraîchir la vue matérialisée si elle existe
    try {
      await pool.query('REFRESH MATERIALIZED VIEW purchase_order_financials');
    } catch (refreshErr) {
      console.log('⚠️ Vue matérialisée non rafraîchie:', refreshErr.message);
    }
    
    res.status(201).json({ 
      success: true, 
      message: 'Avoir créé avec succès',
      data: {
        id: eventResult.rows[0].id,
        credit_note_number,
        amount_dh,
        credit_note_date,
        notes
      }
    });
    
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('❌ Erreur création avoir:', err);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// =======================
// GET - Récupérer les avoirs d'une commande
// =======================
router.get('/:orderId/credit-notes', async (req, res) => {
  const { orderId } = req.params;
  const tenantId = req.tenantId;
  
  try {
    // Récupérer l'ID interne de la commande
    const orderResult = await pool.query(
      `SELECT id FROM supplier_orders 
       WHERE order_id = $1 AND tenant_id = $2 AND source_type = 'purchase_order'`,
      [orderId, String(tenantId)]
    );
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    
    const internalId = orderResult.rows[0].id;
    
    // Récupérer les événements de type credit_note_created
    const result = await pool.query(
      `SELECT * FROM purchase_order_events 
       WHERE supplier_order_id = $1 AND event_type = 'credit_note_created'
       ORDER BY created_at DESC`,
      [internalId]
    );
    
    // Formater les données
    const creditNotes = result.rows.map(row => {
      let data = {};
      try {
        data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      } catch(e) {}
      
      return {
        id: row.id,
        credit_note_number: data.credit_note_number,
        amount_dh: data.amount_dh,
        amount_ht: data.amount_ht,
        amount_ttc: data.amount_ttc,
        credit_note_date: data.credit_note_date,
        reason: data.notes,
        created_at: row.created_at,
        created_by: row.created_by
      };
    });
    
    res.json({ success: true, data: creditNotes });
    
  } catch (err) {
    console.error('❌ Erreur GET credit-notes:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET - Récupérer les remplacements d'une commande
// =======================
router.get('/:orderId/replacements', async (req, res) => {
  const { orderId } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT r.* FROM supplier_replacements r
       JOIN supplier_orders so ON so.id = r.supplier_order_id
       WHERE so.order_id = $1 AND so.tenant_id = $2`,
      [orderId, req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erreur GET replacements:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET - Récupérer l'historique des événements
// =======================
router.get('/:orderId/events', async (req, res) => {
  const { orderId } = req.params;
  const tenantId = req.tenantId;
  
  try {
    // Récupérer l'ID interne de la commande
    const orderResult = await pool.query(
      `SELECT id FROM supplier_orders 
       WHERE order_id = $1 AND tenant_id = $2 AND source_type = 'purchase_order'`,
      [orderId, String(tenantId)]
    );
    
    if (orderResult.rows.length === 0) {
      return res.json({ success: true, data: [] });
    }
    
    const internalId = orderResult.rows[0].id;
    
    // Récupérer tous les événements
    const result = await pool.query(
      `SELECT * FROM purchase_order_events 
       WHERE supplier_order_id = $1
       ORDER BY created_at DESC`,
      [internalId]
    );
    
    // Formater les données
    const events = result.rows.map(row => {
      let eventData = {};
      try {
        eventData = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      } catch(e) {}
      
      return {
        id: row.id,
        event_type: row.event_type,
        event_data: eventData,
        created_at: row.created_at,
        created_by: row.created_by
      };
    });
    
    res.json({ success: true, data: events });
    
  } catch (err) {
    console.error('❌ Erreur GET events:', err);
    res.status(500).json({ error: err.message });
  }
});

  // =======================
  // GET - Financial summary for a purchase order
  // =======================
  router.get('/:orderId/summary', async (req, res) => {
    const { orderId } = req.params;
    const tenantId = req.tenantId;
    try {
      // Get internal ID
      // Refresh the materialized view to ensure up‑to‑date financials
      await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY purchase_order_financials');
      // Get internal ID
      const orderResult = await pool.query(`
        SELECT id FROM supplier_orders 
        WHERE order_id = $1 AND tenant_id = $2 AND source_type = 'purchase_order'`,
        [orderId, String(tenantId)]
      );
      if (orderResult.rows.length === 0) {
        return res.status(404).json({ error: 'Commande non trouvée' });
      }
      const internalId = orderResult.rows[0].id;
      // Query materialized view for financials
      const summaryResult = await pool.query(`
        SELECT invoice_total, total_credit_ht, total_credit_ttc, remaining, is_settled
        FROM purchase_order_financials 
        WHERE supplier_order_id = $1`,
        [internalId]
      );
      const summary = summaryResult.rows[0] || {};
      res.json({ success: true, data: summary });
    } catch (err) {
      console.error('❌ Erreur GET summary:', err);
      res.status(500).json({ error: err.message });
    }
  });

module.exports = router;
