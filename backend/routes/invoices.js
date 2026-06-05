// backend/src/routes/invoices.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { getNextInvoiceNumber, getExistingInvoiceByOrder } = require('../services/sequence.service');

// GET /api/sales-invoices - Liste toutes les factures
router.get('/sales-invoices', authMiddleware, requirePermission('sales.read'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         ci.id,
         ci.invoice_number,
         ci.invoice_date,
         ci.total_ht_cents,
         ci.total_tva_cents,
         ci.total_ttc_cents,
         ci.payment_status,
         ci.payment_method,
         ci.client_name as customer_name,
         ci.client_id,
         ci.order_id as sales_order_id,
         ci.created_at,
         COUNT(cii.id) as items_count
       FROM core_invoices ci
       LEFT JOIN core_invoice_items cii ON cii.invoice_id = ci.id
       WHERE ci.tenant_id = $1
       GROUP BY ci.id
       ORDER BY ci.created_at DESC`,
      [req.tenantId]
    );
    
    const formattedRows = result.rows.map(row => ({
      id: row.id,
      invoice_number: row.invoice_number,
      invoice_date: row.invoice_date,
      amount_ht_cents: row.total_ht_cents,
      tax_amount_cents: row.total_tva_cents,
      amount_ttc_cents: row.total_ttc_cents,
      payment_status: row.payment_status,
      payment_method: row.payment_method,
      client_id: row.client_id,
      customer_name: row.customer_name || 'Vente directe',
      created_at: row.created_at,
      items_count: parseInt(row.items_count || 0)
    }));
    
    res.json({ success: true, data: formattedRows });
  } catch (err) {
    console.error('Erreur GET sales-invoices:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/sales-invoices/by-order/:orderId - Récupérer la facture d'une commande
// =======================
router.get('/sales-invoices/by-order/:orderId', authMiddleware, requirePermission('sales.read'), async (req, res) => {
  const { orderId } = req.params;
  
  try {
    const invoiceResult = await pool.query(
      `SELECT ci.* 
       FROM core_invoices ci
       WHERE ci.order_id = $1 AND ci.tenant_id = $2`,
      [orderId, req.tenantId]
    );
    
    if (invoiceResult.rows.length === 0) {
      return res.json({ success: true, exists: false });
    }
    
    const items = await pool.query(
      `SELECT * FROM core_invoice_items 
       WHERE invoice_id = $1`,
      [invoiceResult.rows[0].id]
    );
    
    res.json({ 
      success: true, 
      exists: true,
      invoice: {
        ...invoiceResult.rows[0],
        items: items.rows
      }
    });
    
  } catch (err) {
    console.error('Erreur GET by-order:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/sales-invoices/next-number - Obtenir le prochain numéro
// =======================
router.get('/sales-invoices/next-number', authMiddleware, requirePermission('sales.read'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT get_next_document_number($1, 'invoice') as next_number`,
      [req.tenantId]
    );
    
    res.json({ 
      success: true, 
      next_number: result.rows[0].next_number 
    });
  } catch (err) {
    console.error('Erreur GET next-number:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/sales-invoices/:id - Détail d'une facture
// IMPORTANT: doit être après /by-order et /next-number pour éviter les conflits Express
// =======================
router.get('/sales-invoices/:id', authMiddleware, requirePermission('sales.read'), async (req, res) => {
  const { id } = req.params;
  
  try {
    const invoice = await pool.query(
      `SELECT 
         ci.*,
         COUNT(cii.id) as items_count
       FROM core_invoices ci
       LEFT JOIN core_invoice_items cii ON cii.invoice_id = ci.id
       WHERE ci.id = $1 AND ci.tenant_id = $2
       GROUP BY ci.id`,
      [id, req.tenantId]
    );
    
    if (invoice.rows.length === 0) {
      return res.status(404).json({ error: 'Facture non trouvée' });
    }
    
    const invoiceRow = invoice.rows[0];
    
    const items = await pool.query(
      `SELECT * FROM core_invoice_items 
       WHERE invoice_id = $1
       ORDER BY created_at DESC`,
      [id]
    );
    
    const data = {
      id: invoiceRow.id,
      invoice_number: invoiceRow.invoice_number,
      invoice_date: invoiceRow.invoice_date,
      amount_ht_cents: parseFloat(invoiceRow.total_ht_cents),
      tax_amount_cents: parseFloat(invoiceRow.total_tva_cents),
      amount_ttc_cents: parseFloat(invoiceRow.total_ttc_cents),
      payment_status: invoiceRow.payment_status,
      payment_method: invoiceRow.payment_method,
      created_at: invoiceRow.created_at,
      items_count: parseInt(invoiceRow.items_count || 0),
      customer_name: invoiceRow.client_name || 'Vente directe',
      client_id: invoiceRow.client_id,
      order_id: invoiceRow.order_id,
      items: items.rows.map(item => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unit_price_cents: parseFloat(item.unit_price_cents),
        total_ht_cents: parseFloat(item.total_ht_cents),
        tax_rate: item.tax_rate,
        tax_amount_cents: parseFloat(item.tax_amount_cents),
        total_ttc_cents: parseFloat(item.total_ttc_cents)
      }))
    };
    
    res.json({ success: true, data });
  } catch (err) {
    console.error('Erreur GET sales-invoices/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/supplier-invoices - Liste des factures fournisseur
// =======================
router.get('/supplier-invoices', authMiddleware, requirePermission('accounting.read'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
          si.*, 
          s.name AS supplier_name, 
          so.order_id AS supplier_order_number
       FROM supplier_invoices si
       LEFT JOIN suppliers s ON s.id = si.supplier_id
       LEFT JOIN supplier_orders so ON so.id = si.order_id
       WHERE si.tenant_id = $1
       ORDER BY si.invoice_date DESC, si.created_at DESC`,
      [req.tenantId]
    );
    
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erreur GET supplier-invoices:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// POST /api/supplier-invoices - Créer une facture fournisseur
// =======================
router.post('/supplier-invoices', authMiddleware, requirePermission('accounting.write'), async (req, res) => {
  const {
    supplier_id,
    order_id,
    invoice_number,
    invoice_date,
    amount_ht,
    amount_tva,
    amount_ttc,
    notes
  } = req.body;
  
  try {
    const generatedInvoiceNumber = invoice_number || ('FAC-' + Date.now());
    const safeAmountHt = Number(amount_ht) || 0;
    const safeAmountTva = Number(amount_tva) || 0;
    const safeAmountTtc = Number(amount_ttc) || (safeAmountHt + safeAmountTva);
    
    const result = await pool.query(
      `INSERT INTO supplier_invoices (
        tenant_id,
        supplier_id,
        order_id,
        invoice_number,
        invoice_date,
        amount_ht,
        amount_tva,
        amount_ttc,
        notes,
        payment_status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *`,
      [
        req.tenantId,
        supplier_id,
        order_id || null,
        generatedInvoiceNumber,
        invoice_date || new Date(),
        safeAmountHt,
        safeAmountTva,
        safeAmountTtc,
        notes || null,
        'pending'
      ]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur POST supplier-invoices:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// PUT /api/supplier-invoices/:id/pay - Marquer une facture fournisseur comme payée
// =======================
router.put('/supplier-invoices/:id/pay', authMiddleware, requirePermission('accounting.write'), async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      `UPDATE supplier_invoices
       SET 
         payment_status = $1,
         payment_date = NOW(),
         updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      ['paid', id, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Facture non trouvée' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur paiement facture:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// POST /api/sales-invoices/generate-from-order - Générer une facture depuis une commande
// =======================
router.post('/sales-invoices/generate-from-order', authMiddleware, async (req, res) => {
  const { order_id } = req.body;
  const crypto = require('crypto');

  if (!order_id) {
    return res.status(400).json({ error: 'order_id requis' });
  }

  const dbClient = await pool.connect();

  try {
    await dbClient.query('BEGIN');

    // 1. Vérifier si une facture existe déjà pour cette commande
    const existingInvoice = await getExistingInvoiceByOrder(dbClient, order_id);
    if (existingInvoice.exists) {
      await dbClient.query('ROLLBACK');
      return res.json({ 
        success: true, 
        invoice_number: existingInvoice.invoice_number,
        already_exists: true
      });
    }

    // 2. Récupérer la commande
    const orderResult = await dbClient.query(
      `SELECT cso.*, 
              COALESCE(cl.first_name || ' ' || cl.last_name, 'Client') as customer_name
       FROM core_sales_order cso
       LEFT JOIN clients cl ON cl.id = cso.client_id
       WHERE cso.id = $1 AND cso.tenant_id = $2`,
      [order_id, req.tenantId]
    );

    if (orderResult.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Commande non trouvée' });
    }

    const order = orderResult.rows[0];

    // 3. Récupérer les items de la commande
    const itemsResult = await dbClient.query(
      `SELECT * FROM core_sales_order_item WHERE sales_order_id = $1`,
      [order_id]
    );

    // 4. Générer le numéro de facture séquentiel
    const invoiceNumber = await getNextInvoiceNumber(dbClient, req.tenantId);
    const invoiceId = crypto.randomUUID();

    // 5. Créer la facture dans core_invoices
    await dbClient.query(
      `INSERT INTO core_invoices 
       (id, invoice_number, tenant_id, client_id, client_name, order_id,
        total_ht_cents, total_tva_cents, total_ttc_cents,
        payment_status, payment_method, invoice_date, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_DATE, NOW())`,
      [
        invoiceId, invoiceNumber, req.tenantId,
        order.client_id, order.customer_name, order_id,
        order.total_ht_cents, order.total_tva_cents, order.total_ttc_cents,
        order.payment_status === 'paid' ? 'paid' : 'unpaid',
        'cash'
      ]
    );

    // 6. Créer les lignes de facture depuis les items de commande
    for (const item of itemsResult.rows) {
      const taxAmount = item.tax_amount_cents || Math.round(item.total_cents * ((item.tax_rate || 20) / 100));
      await dbClient.query(
        `INSERT INTO core_invoice_items
         (id, invoice_id, tenant_id, description, quantity,
          unit_price_cents, total_ht_cents, tax_rate, tax_amount_cents, total_ttc_cents, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [
          crypto.randomUUID(), invoiceId, req.tenantId,
          item.description, item.quantity,
          item.unit_price_cents, item.total_cents,
          item.tax_rate || 20, taxAmount,
          item.total_cents + taxAmount
        ]
      );
    }

    await dbClient.query('COMMIT');

    res.json({ 
      success: true, 
      invoice_number: invoiceNumber,
      invoice_id: invoiceId
    });

  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Erreur generate-from-order:', err);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

module.exports = router;