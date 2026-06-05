// backend/routes/sales.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// =======================
// GET /api/sales - Liste toutes les factures de vente
// =======================
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         si.id,
         si.invoice_number,
         si.invoice_date,
         si.amount_ht_cents,
         si.tax_amount_cents,
         si.amount_ttc_cents,
         si.payment_status,
         si.payment_method,
         si.client_id,
         si.customer_name,
         si.document_origin,
         si.created_at,
         COALESCE(
           (SELECT COUNT(*) FROM sales_invoice_items sii WHERE sii.invoice_id = si.id),
           0
         )::int AS items_count
       FROM sales_invoices si
       WHERE si.tenant_id = $1
         AND si.document_origin IN ('cashier_sale', 'direct_sale')
       ORDER BY si.created_at DESC`,
      [req.tenantId]
    );
    
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erreur GET sales:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/sales/:id - Détail d'une vente (facture)
// =======================
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Récupérer la facture
    const invoiceResult = await pool.query(
      `SELECT si.*, 
              c.first_name, c.last_name, c.phone, c.email
       FROM sales_invoices si
       LEFT JOIN clients c ON c.id = si.client_id
       WHERE si.id = $1 AND si.tenant_id = $2`,
      [id, req.tenantId]
    );
    
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Facture non trouvée' });
    }
    
    // Récupérer les items
    const itemsResult = await pool.query(
      `SELECT sii.*, p.name as product_name, p.reference
       FROM sales_invoice_items sii
       LEFT JOIN products p ON p.id = sii.product_id
       WHERE sii.invoice_id = $1`,
      [id]
    );
    
    res.json({ 
      success: true, 
      data: {
        ...invoiceResult.rows[0],
        items: itemsResult.rows
      }
    });
  } catch (err) {
    console.error('Erreur GET sale detail:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// POST /api/sales - Créer une vente (caisse ou directe) avec facture
// =======================
router.post('/', async (req, res) => {
  console.log('🔍 === REQUÊTE REÇUE ===');
  console.log('📦 Body:', JSON.stringify(req.body, null, 2));
  
  const { customer_name, items, payment_method, client_id } = req.body;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Aucun article dans le panier' });
  }
  
  const dbClient = await pool.connect();
  
  try {
    await dbClient.query('BEGIN');
    
    let finalCustomerName = customer_name || 'Client comptoir';
    
    // Calcul des totaux avec support TVA variable
    let totalHtCents = 0;
    let totalTaxCents = 0;
    
    for (const item of items) {
      const itemTotal = (item.unit_price_cents || 0) * (item.quantity || 1);
      const tvaRate = item.tva_rate || 20;
      const itemTax = Math.round(itemTotal * tvaRate / 100);
      
      totalHtCents += itemTotal;
      totalTaxCents += itemTax;
    }
    const totalTtcCents = totalHtCents + totalTaxCents;
    
    // ✅ NUMÉRO DE FACTURE SÉQUENTIEL UNIQUE
    const numberResult = await dbClient.query(
      `SELECT generate_document_number($1, 'invoice') as invoice_number`,
      [req.tenantId]
    );
    const invoiceNumber = numberResult.rows[0].invoice_number;
    console.log('📝 Numéro de facture généré:', invoiceNumber);
    
    // Déterminer l'origine du document
    const documentOrigin = client_id ? 'direct_sale' : 'cashier_sale';
    
    // 1. Créer la facture dans sales_invoices (UNIQUE SOURCE)
    const invoiceResult = await dbClient.query(
      `INSERT INTO sales_invoices 
       (tenant_id, invoice_number, invoice_date, amount_ht_cents, 
        tax_amount_cents, amount_ttc_cents, payment_status, 
        payment_method, client_id, customer_name, document_origin, created_at)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, 'paid', $6, $7, $8, $9, NOW())
       RETURNING id, invoice_number`,
      [req.tenantId, invoiceNumber, totalHtCents, totalTaxCents, totalTtcCents, 
       payment_method, client_id || null, finalCustomerName, documentOrigin]
    );
    
    console.log('✅ Facture créée, id:', invoiceResult.rows[0].id);
    
    // 2. Insérer les items dans sales_invoice_items
    for (const item of items) {
      const itemTotal = (item.unit_price_cents || 0) * (item.quantity || 1);
      const tvaRate = item.tva_rate || 20;
      const itemTax = Math.round(itemTotal * tvaRate / 100);
      
      // Récupérer le nom du produit
      let productName = item.product_name || 'Produit';
      if (item.product_id && !productName) {
        const productResult = await dbClient.query(
          `SELECT name FROM products WHERE id = $1`,
          [item.product_id]
        );
        if (productResult.rows.length > 0) {
          productName = productResult.rows[0].name;
        }
      }
      
      // Insert dans sales_invoice_items
      await dbClient.query(
        `INSERT INTO sales_invoice_items 
         (tenant_id, invoice_id, description, quantity, 
          unit_price_cents, total_cents, tax_rate, tax_amount_cents, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [req.tenantId, invoiceResult.rows[0].id, productName,
         item.quantity, item.unit_price_cents, itemTotal, tvaRate, itemTax]
      );
      
      // Mettre à jour le stock
      if (item.product_id) {
        await dbClient.query(
          `UPDATE products 
           SET stock_quantity = stock_quantity - $1,
               updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3`,
          [item.quantity, item.product_id, req.tenantId]
        );
        
        // Ajouter mouvement de stock
        await dbClient.query(
          `INSERT INTO stock_movements 
           (tenant_id, product_id, type, quantity, source_type, source_id, created_at)
           VALUES ($1, $2, 'OUT', $3, 'sale', $4, NOW())`,
          [req.tenantId, item.product_id, item.quantity, invoiceResult.rows[0].id]
        );
        
        console.log(`  ✅ Stock mis à jour: ${productName} -${item.quantity}`);
      }
    }
    
    await dbClient.query('COMMIT');
    
    console.log('✅ Vente enregistrée avec succès !');
    
    res.json({ 
      success: true, 
      data: {
        id: invoiceResult.rows[0].id,
        invoice_id: invoiceResult.rows[0].id,
        invoice_number: invoiceNumber,
        customer_name: finalCustomerName,
        total_dh: totalTtcCents / 100,
        payment_method: payment_method,
        document_origin: documentOrigin
      },
      message: `Vente enregistrée pour ${finalCustomerName}`
    });
    
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('❌ Erreur SQL:', err);
    res.status(400).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

module.exports = router;