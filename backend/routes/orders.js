// backend/src/routes/orders.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { getNextInvoiceNumber, getExistingInvoiceByOrder } = require('../services/sequence.service');

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
// Fonction pour récupérer le prix d'achat depuis la commande fournisseur
// =======================
async function getLensCostPrice(salesOrderId, dbClient) {
  const result = await dbClient.query(
    `SELECT actual_price_cents, expected_price_cents, status, supplier_id
     FROM supplier_orders 
     WHERE sales_order_id = $1 
       AND source_type IN ('optical_lab', 'lenses', 'optical_order')
     ORDER BY created_at DESC LIMIT 1`,
    [salesOrderId]
  );
  
  if (result.rows.length === 0) {
    return { cost: 0, supplier_id: null };
  }
  
  const supplierOrder = result.rows[0];
  const cost = supplierOrder.actual_price_cents > 0
    ? supplierOrder.actual_price_cents
    : (supplierOrder.expected_price_cents || 0);

  return { cost, supplier_id: supplierOrder.supplier_id || null };
}

// =======================
// GET /api/orders/next-quote-number - Générer numéro de devis
// =======================
router.get('/next-quote-number', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT get_next_document_number($1, 'quote') as quote_number`,
      [req.tenantId]
    );
    res.json({ success: true, data: { quote_number: result.rows[0].quote_number } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/orders - Toutes les commandes
// =======================
router.get('/', async (req, res) => {
  try {
    const opticalOrders = await pool.query(
      `SELECT 
         cso.id,
         cso.order_number,
         cso.client_id,
         cso.status,
         cso.payment_status,
         cso.created_at,
         cso.total_ht_cents,
         cso.total_tva_cents,
         cso.total_ttc_cents,
         'optical' as order_type,
         COUNT(DISTINCT csoi.id) as items_count,
         COALESCE(cl.first_name || ' ' || cl.last_name, 'Client') as customer_name,
         cl.phone as customer_phone
       FROM core_sales_order cso
       LEFT JOIN core_sales_order_item csoi ON csoi.sales_order_id = cso.id
       LEFT JOIN clients cl ON cl.id = cso.client_id
       WHERE cso.tenant_id = $1
       GROUP BY cso.id, cl.first_name, cl.last_name, cl.phone
       ORDER BY cso.created_at DESC`,
      [req.tenantId]
    );

    const directSales = await pool.query(
      `SELECT 
         ci.id,
         ci.invoice_number,
         ci.invoice_date,
         ci.total_ttc_cents as amount_ttc_cents,
         ci.payment_method,
         ci.created_at,
         ci.client_id,
         COALESCE(ci.client_name, 'Vente directe') as customer_name,
         COUNT(DISTINCT cii.id) as items_count,
         'direct_sale' as order_type,
         'delivered'   as status,
         'paid'        as payment_status
       FROM core_invoices ci
       LEFT JOIN core_invoice_items cii ON cii.invoice_id = ci.id
       WHERE ci.tenant_id = $1
         AND ci.order_id IS NULL
       GROUP BY ci.id
       ORDER BY ci.created_at DESC`,
      [req.tenantId]
    );

    res.json({ 
      success: true, 
      data: {
        optical_orders: opticalOrders.rows,
        direct_sales: directSales.rows
      }
    });
  } catch (err) {
    console.error('Erreur GET orders:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/orders/optical/:id - Détails d'une commande optique
// =======================
router.get('/optical/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const order = await pool.query(
      `SELECT 
         cso.id, cso.order_number, cso.client_id, cso.status, cso.payment_status,
         cso.total_ht_cents, cso.total_tva_cents, cso.total_ttc_cents,
         cso.order_date, cso.notes, cso.created_at,
         cso.prescription_id,
         COALESCE(cl.first_name || ' ' || cl.last_name, 'Client') as customer_name,
         cl.phone as customer_phone,
         cl.email as customer_email
       FROM core_sales_order cso
       LEFT JOIN clients cl ON cl.id = cso.client_id
       WHERE cso.id = $1 AND cso.tenant_id = $2`,
      [id, req.tenantId]
    );
    
    if (order.rows.length === 0) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    
    const items = await pool.query(
      `SELECT 
         id, sales_order_id,
         line_type as item_type,
         line_type,
         description, quantity,
         unit_price_cents, total_cents,
         tax_rate, tax_amount_cents,
         product_id, metadata, created_at
       FROM core_sales_order_item 
       WHERE sales_order_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    const prescription = order.rows[0].prescription_id
      ? await pool.query(
          `SELECT pupillary_distance, mounting_notes, technical_notes
           FROM prescriptions
           WHERE id = $1`,
          [order.rows[0].prescription_id]
        )
      : { rows: [] };

    const parsedItems = items.rows.map((item) => {
      const metadata = parseJsonField(item.metadata, {});
      return {
        ...item,
        metadata,
        mounting: normalizeMounting({ metadata, mounting: metadata.mounting, lens_details: item.lens_details }),
      };
    });

    const prescriptionMounting = prescription.rows[0]
      ? {
          pupillary_distance: Number(prescription.rows[0].pupillary_distance ?? 0),
          mounting_height: 0,
          vertex_distance: 0,
          pantoscopic_angle: 0,
          frame_wrap: 0,
          mounting_notes: prescription.rows[0].mounting_notes || null,
          technical_notes: prescription.rows[0].technical_notes || null,
        }
      : null;
    
    const supplierOrders = await pool.query(
      `SELECT order_id, status, supplier_id, created_at, received_at, 
              expected_price_cents, actual_price_cents, source_type
       FROM supplier_orders 
       WHERE sales_order_id = $1
       ORDER BY created_at DESC`,
      [id]
    );
    
    res.json({ 
      success: true, 
      data: {
        ...order.rows[0],
        items: parsedItems,
        prescription_mounting: prescriptionMounting,
        supplier_orders: supplierOrders.rows
      }
    });
  } catch (err) {
    console.error('Erreur GET orders/optical/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// DELETE /api/sales-orders/:id - Supprimer une commande
// =======================
router.delete('/sales-orders/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const orderCheck = await client.query(
      `SELECT status FROM core_sales_order 
       WHERE id = $1 AND tenant_id = $2`,
      [id, req.tenantId]
    );
    
    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    
    if (orderCheck.rows[0].status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Impossible de supprimer : la commande a déjà été confirmée (statut: ${orderCheck.rows[0].status})` 
      });
    }
    
    const items = await client.query(
      `SELECT * FROM core_sales_order_item 
       WHERE sales_order_id = $1`,
      [id]
    );
    
    for (const item of items.rows) {
      if (item.item_type === 'frame' || item.line_type === 'product' || item.item_type === 'accessory' || item.line_type === 'product') {
        await client.query(
          `UPDATE products 
           SET reserved_quantity = GREATEST(reserved_quantity - $1, 0)
           WHERE id = $2 AND tenant_id = $3`,
          [item.quantity, item.product_id, req.tenantId]
        );
      }
    }
    
    await client.query(
      `DELETE FROM core_sales_order_item WHERE sales_order_id = $1`,
      [id]
    );
    
    await client.query(
      `DELETE FROM core_sales_order WHERE id = $1 AND tenant_id = $2`,
      [id, req.tenantId]
    );
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: 'Commande supprimée avec succès' 
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erreur suppression commande:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// =======================
// POST /api/orders/create - Créer une commande
// =======================
router.post('/create', async (req, res) => {
  const { customer_name, customer_email, customer_phone, items, client_id, notes } = req.body;
  const dbClient = await pool.connect();
  
  try {
    await dbClient.query('BEGIN');
    
    const hasLenses = items.some(item => item.type === 'lens');
    
    if (!hasLenses) {
      // CAS 1: VENTE DIRECTE
      let total_ht = 0;
      let total_tax = 0;

      for (const item of items) {
        total_ht += item.total_cents;
        total_tax += Math.round(item.total_cents * (item.tva_rate / 100));
      }
      const total_ttc = total_ht + total_tax;

      const invoiceNumber = 'FACT-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      const invoiceId = crypto.randomUUID();

      const invoice = await dbClient.query(
        `INSERT INTO core_invoices 
         (id, invoice_number, tenant_id, client_id, client_name,
          total_ht_cents, total_tva_cents, total_ttc_cents,
          payment_status, payment_method, invoice_date, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE, NOW())
         RETURNING *`,
        [
          invoiceId, invoiceNumber, req.tenantId,
          client_id || null, customer_name || 'Vente directe',
          total_ht, total_tax, total_ttc,
          'paid', req.body.payment_method || 'cash'
        ]
      );
      
      for (const item of items) {
        const tax_amount = Math.round(item.total_cents * (item.tva_rate / 100));
        
        await dbClient.query(
          `INSERT INTO core_invoice_items 
           (id, invoice_id, tenant_id, description, quantity, 
            unit_price_cents, total_ht_cents, tax_rate, tax_amount_cents, total_ttc_cents, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
          [
            crypto.randomUUID(), invoiceId, req.tenantId, item.description,
            item.quantity, item.unit_price_cents, item.total_cents,
            item.tva_rate || 20, tax_amount, item.total_cents + tax_amount
          ]
        );
        
        if (item.product_id && (item.type === 'frame' || item.type === 'accessory')) {
          await dbClient.query(
            `INSERT INTO stock_movements 
             (id, tenant_id, product_id, type, quantity, source_type, source_id, created_at)
             VALUES ($1, $2, $3, 'OUT', $4, 'sale', $5, NOW())`,
            [crypto.randomUUID(), req.tenantId, item.product_id, item.quantity, invoiceId]
          );
        }
      }
      
      await dbClient.query('COMMIT');
      
      res.json({ 
        success: true, 
        data: { 
          type: 'direct_sale',
          invoice: invoice.rows[0],
          total_ttc_dh: total_ttc / 100
        },
        message: 'Vente directe enregistrée avec succès'
      });
      
    } else {
      // ============================================
      // CAS 2: COMMANDE OPTIQUE (avec conservation des métadonnées)
      // ============================================
      const orderNumber = 'SO-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      
      let totalHTCents = 0;
      let totalTVACents = 0;
      for (const item of items) {
        totalHTCents += item.total_cents;
        totalTVACents += Math.round(item.total_cents * (item.tva_rate / 100));
      }
      const totalTTCCents = totalHTCents + totalTVACents;
      
      const orderId = crypto.randomUUID();
      
 const orderResult = await dbClient.query(
  `INSERT INTO core_sales_order 
   (id, order_number, tenant_id, client_id, prescription_id, status, payment_status,
    total_ht_cents, total_tva_cents, total_ttc_cents, order_date, created_at, updated_at)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE, NOW(), NOW())
   RETURNING *`,
  [
    orderId, 
    orderNumber, 
    req.tenantId, 
    client_id || null,
    req.body.prescription_id || null,  // ← Nouveau champ
    'draft',        // ← statut de la commande (à garder)
    'unpaid',       // ← statut de paiement (à garder)
    totalHTCents, 
    totalTVACents, 
    totalTTCCents
  ]
);
      
      for (const item of items) {
        const tax_amount = Math.round(item.total_cents * (item.tva_rate / 100));
        
        // ✅ Récupérer la metadata originale
        let originalMetadata = item.metadata || {};
        let metadata;

        if (item.type === 'lens' || item.type === 'optical_job') {
          // ─── Détecter le nouveau format ───────────────────────────────
          // Nouveau format (LensOrderFormEmbedded v2) :
          //   { eye: 'OD', right_eye: { type, index, coatings, prescription: {...} }, mounting: {...} }
          // Ancien format :
          //   { lens_config: {...}, prescription: {...}, mounting: {...} }
          
          const hasNewFormat = !!(originalMetadata.right_eye?.prescription !== undefined
            || originalMetadata.left_eye?.prescription !== undefined
            || originalMetadata.right_eye?.coatings !== undefined
            || originalMetadata.left_eye?.coatings !== undefined);

          if (hasNewFormat) {
            // ✅ Nouveau format : passer directement sans reconstruction
            // La prescription et les traitements sont déjà dans right_eye/left_eye
            metadata = {
              eye: originalMetadata.eye || 'both',
              right_eye: originalMetadata.right_eye || null,
              left_eye:  originalMetadata.left_eye  || null,
              mounting:  originalMetadata.mounting  || null,
            };
          } else {
            // ⬅️ Ancien format : reconstruire pour compatibilité
            const lensConfig = originalMetadata.lens_config || {
              type:     originalMetadata.lens_type || item.lens_type || 'progressif',
              index:    originalMetadata.index     || item.index     || '1.67',
              material: originalMetadata.material  || item.material  || 'organic',
              coatings: originalMetadata.coatings  || item.coatings  || [],
              tint:     originalMetadata.tint      || { color: 'none', gradient: false, intensity: 0 },
            };
            const prescription = originalMetadata.prescription || {};
            const mounting     = originalMetadata.mounting     || {};
            const eye = originalMetadata.eye || 'both';

            const buildEye = (config) => ({
              ...config,
              prescription,
              description: item.description,
            });

            metadata = {
              eye,
              right_eye: (eye === 'both' || eye === 'OD' || eye === 'right') ? buildEye(lensConfig) : null,
              left_eye:  (eye === 'both' || eye === 'OG' || eye === 'left')  ? buildEye(lensConfig) : null,
              mounting,
            };
          }
        } else {
          // Monture/accessoire : garder la metadata telle quelle
          metadata = originalMetadata;
        }
        
        // Convertir le type pour la contrainte de core_sales_order_item
        let lineType = item.type;
        if (lineType === 'lens') lineType = 'optical_job';
        if (lineType === 'accessory') lineType = 'product';
        if (lineType === 'frame') lineType = 'product';

        await dbClient.query(
          `INSERT INTO core_sales_order_item 
           (id, sales_order_id, line_type, product_id, description, 
            quantity, unit_price_cents, total_cents, tax_rate, tax_amount_cents, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
          [
            crypto.randomUUID(), orderId, lineType, item.product_id || null, item.description,
            item.quantity, item.unit_price_cents, item.total_cents, 
            item.tva_rate || 20, tax_amount, JSON.stringify(metadata)
          ]
        );
        
        if (item.type === 'frame' || item.type === 'accessory') {
          await dbClient.query(
            `UPDATE products SET reserved_quantity = COALESCE(reserved_quantity, 0) + $1 
             WHERE id = $2 AND tenant_id = $3`,
            [item.quantity, item.product_id, req.tenantId]
          );
        }
      }
      
      await dbClient.query('COMMIT');
      
      res.json({ 
        success: true, 
        data: { 
          type: 'optical',
          order: orderResult.rows[0]
        },
        message: 'Commande optique créée en brouillon'
      });
    }
    
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Erreur création commande:', err);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// =======================
// POST /api/orders/deliver/:id - Livrer une commande
// =======================
router.post('/deliver/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { payment_method, payment_amount_cents } = req.body;
  const tenantId = req.tenantId;
  const dbClient = await pool.connect();
  
  try {
    await dbClient.query('BEGIN');
    
    // 1. Récupérer la commande avec le nom du client
    const orderResult = await dbClient.query(
      `SELECT cso.*, 
              COALESCE(cl.first_name || ' ' || cl.last_name, 'Client') as customer_name
       FROM core_sales_order cso
       LEFT JOIN clients cl ON cl.id = cso.client_id
       WHERE cso.id = $1 AND cso.tenant_id = $2`,
      [id, tenantId]
    );
    
    if (orderResult.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    
    const orderData = orderResult.rows[0];
    
    // 2. Vérifier statut
    if (orderData.status === 'delivered') {
      await dbClient.query('ROLLBACK');
      return res.status(409).json({ error: 'Commande déjà livrée' });
    }
    if (orderData.status !== 'ready') {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'Commande non prête à être livrée' });
    }
    
    // 3. Vérifier si facture existe déjà
    const existingInvoice = await getExistingInvoiceByOrder(dbClient, id);
    if (existingInvoice.exists) {
      await dbClient.query('ROLLBACK');
      return res.status(409).json({ 
        error: `Facture déjà existante: ${existingInvoice.invoice_number}` 
      });
    }
    
    // 4. Récupérer les items
    const itemsResult = await dbClient.query(
      `SELECT * FROM core_sales_order_item WHERE sales_order_id = $1`,
      [id]
    );
    
    const lensItems = itemsResult.rows.filter(item =>
      item.line_type === 'optical_job' || item.item_type === 'lens'
    );

    // Utiliser les totaux de la commande (déjà calculés et fiables)
    const totalHTCents  = orderData.total_ht_cents;
    const totalTVACents = orderData.total_tva_cents;
    const totalTTCCents = orderData.total_ttc_cents;
    
    // 5. Générer numéro de facture séquentiel (dans la transaction)
    const invoiceNumber = await getNextInvoiceNumber(dbClient, tenantId);
    const invoiceId = crypto.randomUUID();
    
    console.log(`📝 Facture: ${invoiceNumber} | HT: ${totalHTCents/100} | TVA: ${totalTVACents/100} | TTC: ${totalTTCCents/100}`);
    
    // 6. Créer la facture
    await dbClient.query(
      `INSERT INTO core_invoices 
       (id, invoice_number, tenant_id, client_id, client_name, order_id,
        total_ht_cents, total_tva_cents, total_ttc_cents,
        payment_status, payment_method, invoice_date, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'paid', $10, CURRENT_DATE, NOW())`,
      [
        invoiceId, invoiceNumber, tenantId,
        orderData.client_id, orderData.customer_name, id,
        totalHTCents, totalTVACents, totalTTCCents,
        payment_method || 'cash'
      ]
    );
    
    // 7. Paiement
    await dbClient.query(
      `INSERT INTO core_payments 
       (id, tenant_id, invoice_id, amount_cents, payment_method, payment_date, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [crypto.randomUUID(), tenantId, invoiceId, payment_amount_cents || totalTTCCents, payment_method || 'cash']
    );
    
    // 8. Mettre à jour statut commande
    await dbClient.query(
      `UPDATE core_sales_order 
       SET status = 'delivered', payment_status = 'paid', paid_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    
    // 9. Créer les jobs optiques
    const { cost: totalCostPrice, supplier_id: supplierId } = await getLensCostPrice(id, dbClient);
    const costPricePerLens = lensItems.length > 0 ? Math.round(totalCostPrice / lensItems.length) : 0;

    for (const lens of lensItems) {
      let rightConfig = {}, leftConfig = {};
      const meta = typeof lens.metadata === 'string' ? JSON.parse(lens.metadata || '{}') : (lens.metadata || {});
      rightConfig = meta.right_eye || meta.right_eye_config || {};
      leftConfig  = meta.left_eye  || meta.left_eye_config  || {};
      
      const jobNumber = `JOB-${orderData.order_number}-${lens.id.substring(0, 8)}`;
      console.log(`👓 Job: ${jobNumber} | Vente: ${lens.total_cents/100} DH | Achat: ${costPricePerLens/100} DH`);
      
      await dbClient.query(
        `INSERT INTO core_optical_job 
         (id, job_number, tenant_id, client_id, sales_order_id,
          right_lens_config, left_lens_config,
          selling_price_cents, cost_price_cents, supplier_id, job_status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'delivered', NOW())
         ON CONFLICT (id) DO UPDATE SET
           cost_price_cents = EXCLUDED.cost_price_cents,
           supplier_id = EXCLUDED.supplier_id,
           job_status = 'delivered',
           updated_at = NOW()`,
        [
          crypto.randomUUID(), jobNumber, tenantId, orderData.client_id, id,
          JSON.stringify(rightConfig), JSON.stringify(leftConfig),
          lens.total_cents, costPricePerLens, supplierId
        ]
      );
    }
    
    await dbClient.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: 'Commande livrée avec succès',
      data: {
        invoice_number: invoiceNumber,
        invoice_id: invoiceId,
        total_ht: totalHTCents / 100,
        total_tva: totalTVACents / 100,
        total_ttc: totalTTCCents / 100,
        optical_jobs_created: lensItems.length
      }
    });
    
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Erreur livraison:', err);
    if (err.code === '23505') {
      if (err.constraint?.includes('invoice_per_order') || err.detail?.includes('order_id')) {
        return res.status(409).json({ error: 'Une facture existe déjà pour cette commande' });
      }
      if (err.constraint?.includes('invoice_number')) {
        return res.status(500).json({ error: 'Erreur numéro de facture. Réessayez.' });
      }
    }
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});


// =======================
// PUT /api/orders/sales-orders/:id/status - Mettre à jour le statut
// =======================
router.put('/sales-orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  const validStatuses = ['draft', 'pending', 'in_production', 'ready', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }
  
  try {
    const result = await pool.query(
      `UPDATE core_sales_order 
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [status, id, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    
    await pool.query(
      `UPDATE core_sales_order 
       SET status = $1, updated_at = NOW()
       WHERE legacy_order_id = $2 AND legacy_source = 'sales_orders'`,
      [status, id]
    );
    
    res.json({ 
      success: true, 
      data: result.rows[0],
      message: `Statut mis à jour: ${status}`
    });
  } catch (err) {
    console.error('Erreur mise à jour statut:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
