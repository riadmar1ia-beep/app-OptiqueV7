// backend/routes/api_v2.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET /api/v2/orders - Liste des commandes (nouveau core)
router.get('/orders', async (req, res) => {
    try {
        const tenantId = req.headers['x-tenant-id'];
        
        const result = await pool.query(`
            SELECT * FROM v_sales_orders_unified 
            WHERE tenant_id = $1 
            ORDER BY created_at DESC
        `, [tenantId]);
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/v2/orders/:id - Détail d'une commande
router.get('/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.headers['x-tenant-id'];
        
        const result = await pool.query(`
            SELECT * FROM v_sales_orders_unified 
            WHERE id = $1 AND tenant_id = $2
        `, [id, tenantId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Commande non trouvée' });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/v2/optical/jobs - Liste des jobs optiques
router.get('/optical/jobs', async (req, res) => {
    try {
        const tenantId = req.headers['x-tenant-id'];
        
        const result = await pool.query(`
            SELECT * FROM v_optical_jobs_unified 
            WHERE tenant_id = $1 
            ORDER BY created_at DESC
        `, [tenantId]);
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/v2/optical/jobs/:id - Détail d'un job optique
router.get('/optical/jobs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.headers['x-tenant-id'];
        
        const result = await pool.query(`
            SELECT * FROM v_optical_jobs_unified 
            WHERE id = $1 AND tenant_id = $2
        `, [id, tenantId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Job optique non trouvé' });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;