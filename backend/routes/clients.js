// backend/routes/clients.js - Version complète corrigée

const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// =======================
// GET /api/clients - Liste tous les clients
// =======================
router.get('/', async (req, res) => {
  try {
    console.log('========== DEBUG CLIENT ==========');
    console.log('req.tenantId:', req.tenantId);
    console.log('req.userId:', req.userId);
    console.log('req.headers["x-tenant-id"]:', req.headers['x-tenant-id']);
    console.log('===================================');
    
    let tenantId = req.tenantId || req.headers['x-tenant-id'] || 'default-shop';
    console.log('Tenant utilisé:', tenantId);
    
    const result = await pool.query(
      `SELECT * FROM clients 
       WHERE tenant_id = $1 
         AND is_active = true 
         AND phone != '0000000000'
       ORDER BY created_at DESC`,
      [tenantId]
    );
    
    console.log('Clients trouvés:', result.rows.length);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erreur GET clients:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// POST /api/clients - Créer un client
// =======================
router.post('/', async (req, res) => {
  const { first_name, last_name, phone, email } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO clients (tenant_id, first_name, last_name, phone, email) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [req.tenantId, first_name, last_name, phone, email]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur POST client:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/clients/:id/summary - Dashboard client unifié
// ⚠️ DOIT ÊTRE AVANT /:id ⚠️
// =======================
router.get('/:id/summary', async (req, res) => {
  const clientId = req.params.id;
  
  try {
    console.log('📊 Dashboard client - ID:', clientId);
    
    // 1. Infos client
    const clientResult = await pool.query(
      `SELECT id, first_name, last_name, phone, email, insurance_rate, 
              created_at, updated_at
       FROM clients 
       WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
      [clientId, req.tenantId]
    );
    
    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }
    
    const client = clientResult.rows[0];
    
    // 2. Vérifier si la table core_sales_order existe
    let ordersStats = { total_orders: 0, total_spent_cents: 0, last_visit: client.created_at };
    
    try {
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'core_sales_order'
        )
      `);
      
      if (tableCheck.rows[0].exists) {
        const statsResult = await pool.query(
          `SELECT 
             COUNT(*) AS total_orders,
             COALESCE(SUM(total_ttc_cents), 0) AS total_spent_cents,
             MAX(created_at) AS last_visit
           FROM core_sales_order 
           WHERE client_id = $1 AND status != 'cancelled'`,
          [clientId]
        );
        ordersStats = statsResult.rows[0];
      }
    } catch (err) {
      console.log('⚠️ Table core_sales_order inaccessible:', err.message);
    }
    
    // 3. Dernières commandes
    let recentOrders = { rows: [] };
    
    try {
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'core_sales_order'
        )
      `);
      
      if (tableCheck.rows[0].exists) {
        recentOrders = await pool.query(
          `SELECT 
             id,
             order_number,
             created_at,
             status AS order_status,
             payment_status,
             COALESCE(total_ttc_cents, 0) AS total_cents
           FROM core_sales_order 
           WHERE client_id = $1 AND status != 'cancelled'
           ORDER BY created_at DESC
           LIMIT 5`,
          [clientId]
        );
      }
    } catch (err) {
      console.log('⚠️ Impossible de charger les commandes:', err.message);
    }
    
    // 4. Détails des commandes récentes (items)
    let orderItems = [];
    if (recentOrders.rows && recentOrders.rows.length > 0) {
      try {
        const orderIds = recentOrders.rows.map(o => o.id);
        const itemsResult = await pool.query(
          `SELECT 
             sales_order_id AS parent_id,
             line_type AS item_type,
             description,
             quantity,
             COALESCE(total_cents, 0) AS total_cents
           FROM core_sales_order_item
           WHERE sales_order_id = ANY($1::uuid[])`,
          [orderIds]
        );
        orderItems = itemsResult.rows;
      } catch (err) {
        console.log('⚠️ Impossible de charger les items:', err.message);
      }
    }
    
    // 5. Ordonnances actives
    let prescriptions = { rows: [] };
    try {
      prescriptions = await pool.query(
        `SELECT 
           id, doctor_name, date_of_issue, expiry_date,
           od_sphere, od_cylinder, od_axis, od_addition,
           og_sphere, og_cylinder, og_axis, og_addition,
           notes
         FROM prescriptions 
         WHERE client_id = $1 AND tenant_id = $2
           AND (expiry_date IS NULL OR expiry_date > NOW())
         ORDER BY date_of_issue DESC`,
        [clientId, req.tenantId]
      );
    } catch (err) {
      console.log('⚠️ Impossible de charger les ordonnances:', err.message);
    }
    
    // 6. Prochaine expiration d'ordonnance
    let nextExpiry = null;
    try {
      const nextExpiryResult = await pool.query(
        `SELECT expiry_date
         FROM prescriptions 
         WHERE client_id = $1 AND tenant_id = $2
           AND expiry_date IS NOT NULL
           AND expiry_date > NOW()
         ORDER BY expiry_date ASC
         LIMIT 1`,
        [clientId, req.tenantId]
      );
      nextExpiry = nextExpiryResult.rows[0]?.expiry_date || null;
    } catch (err) {
      console.log('⚠️ Erreur calcul expiration:', err.message);
    }
    
    res.json({
      success: true,
      data: {
        client,
        stats: {
          total_orders: parseInt(ordersStats.total_orders) || 0,
          total_spent: Math.round((ordersStats.total_spent_cents || 0) / 100),
          last_visit: ordersStats.last_visit || client.created_at,
          active_prescriptions: prescriptions.rows.length || 0
        },
        recent_orders: (recentOrders.rows || []).map(order => ({
          ...order,
          items: orderItems.filter(item => item.parent_id === order.id)
        })),
        prescriptions: prescriptions.rows || [],
        next_expiry: nextExpiry
      }
    });
    
  } catch (err) {
    console.error('❌ Erreur GET client summary:', err);
    // Retourner des données partielles plutôt qu'une erreur 500
    res.status(200).json({
      success: true,
      data: {
        client: null,
        stats: { total_orders: 0, total_spent: 0, last_visit: null, active_prescriptions: 0 },
        recent_orders: [],
        prescriptions: [],
        next_expiry: null
      },
      warning: 'Données partielles chargées'
    });
  }
});

// =======================
// PUT /api/clients/:id - Modifier un client
// =======================
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { first_name, last_name, phone, email, insurance_rate } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE clients 
       SET first_name = $1, last_name = $2, phone = $3, email = $4, 
           insurance_rate = $5, updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7 AND is_active = true
       RETURNING *`,
      [first_name, last_name, phone, email, insurance_rate, id, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur PUT client:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// DELETE /api/clients/:id - Supprimer un client
// =======================
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Vérifier si le client a des commandes
    let hasOrders = false;
    try {
      const checkOrders = await pool.query(
        'SELECT 1 FROM core_sales_order WHERE client_id = $1 LIMIT 1',
        [id]
      );
      hasOrders = checkOrders.rows.length > 0;
    } catch (err) {
      console.log('⚠️ Vérification commandes ignorée:', err.message);
    }
    
    if (hasOrders) {
      return res.status(400).json({ 
        error: '❌ Suppression impossible : ce client a des commandes associées' 
      });
    }
    
    await pool.query(
      'DELETE FROM clients WHERE id = $1 AND tenant_id = $2',
      [id, req.tenantId]
    );
    
    res.json({ 
      success: true, 
      message: 'Client supprimé avec succès' 
    });
  } catch (err) {
    console.error('Erreur DELETE client:', err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// GET /api/clients/:id - Détails client
// ⚠️ DOIT ÊTRE APRÈS /:id/summary ⚠️
// =======================
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT * FROM clients WHERE id = $1 AND tenant_id = $2 AND is_active = true',
      [id, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erreur GET client:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;