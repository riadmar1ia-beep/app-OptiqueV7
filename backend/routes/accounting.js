const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const TVAService = require('../services/tvaService');
const AccountingService = require('../services/accountingService');
const AlertService = require('../services/alertService');
const { requirePermission } = require('../middleware/rbac');

// =======================
// TVA DECLARATIONS
// =======================

// GET /api/accounting/tva/declarations - Liste des déclarations
router.get('/tva/declarations', requirePermission('accounting.read'), async (req, res) => {
  try {
    const { year } = req.query;
    const declarations = await TVAService.getDeclarations(req.tenantId, year);
    res.json({ success: true, data: declarations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/accounting/tva/declarations/:id - Détail d'une déclaration
router.get('/tva/declarations/:id', requirePermission('accounting.read'), async (req, res) => {
  try {
    const declaration = await TVAService.getDeclarationDetails(req.params.id, req.tenantId);
    res.json({ success: true, data: declaration });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/accounting/tva/generate - Générer une déclaration
router.post('/tva/generate', requirePermission('accounting.write'), async (req, res) => {
  try {
    const { year, quarter } = req.body;
    
    if (!year || !quarter) {
      return res.status(400).json({ error: 'Année et trimestre requis' });
    }
    
    const declaration = await TVAService.generateDeclaration(year, quarter, req.tenantId, req.userId);
    res.json({ success: true, data: declaration });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/accounting/tva/declarations/:id/validate - Valider une déclaration
router.put('/tva/declarations/:id/validate', requirePermission('accounting.write'), async (req, res) => {
  try {
    const declaration = await TVAService.validateDeclaration(req.params.id, req.tenantId, req.userId);
    res.json({ success: true, data: declaration });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// =======================
// DASHBOARD COMPTABLE
// =======================

// GET /api/accounting/dashboard - Dashboard comptable (version améliorée)
router.get('/dashboard', requirePermission('accounting.read'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    
    // 1. Chiffre d'affaires du mois
    const monthlyRevenue = await pool.query(`
      SELECT 
        COALESCE(SUM(sii.total_cents), 0) as total_ht,
        COALESCE(SUM(sii.tax_amount_cents), 0) as total_tva,
        COUNT(DISTINCT si.id) as invoice_count
      FROM sales_invoices si
      JOIN sales_invoice_items sii ON sii.invoice_id = si.id
      WHERE si.tenant_id = $1 
        AND si.payment_status != 'cancelled'
        AND si.invoice_date >= DATE_TRUNC('month', CURRENT_DATE)
    `, [tenantId]);

    // 2. Chiffre d'affaires de l'année
    const yearlyRevenue = await pool.query(`
      SELECT 
        COALESCE(SUM(sii.total_cents), 0) as total_ht,
        COALESCE(SUM(sii.tax_amount_cents), 0) as total_tva,
        COUNT(DISTINCT si.id) as invoice_count
      FROM sales_invoices si
      JOIN sales_invoice_items sii ON sii.invoice_id = si.id
      WHERE si.tenant_id = $1 
        AND si.payment_status != 'cancelled'
        AND si.invoice_date >= DATE_TRUNC('year', CURRENT_DATE)
    `, [tenantId]);

    // 3. Créances clients
    const outstanding = await pool.query(`
      SELECT 
        si.id,
        si.invoice_number,
        si.invoice_date,
        si.customer_name,
        c.first_name,
        c.last_name,
        si.amount_ttc_cents,
        COALESCE(p.total_paid, 0) as paid_cents,
        (si.amount_ttc_cents - COALESCE(p.total_paid, 0)) as remaining_cents
      FROM sales_invoices si
      LEFT JOIN clients c ON c.id = si.client_id
      LEFT JOIN (
        SELECT invoice_id, SUM(amount_cents) as total_paid
        FROM payments
        GROUP BY invoice_id
      ) p ON p.invoice_id = si.id
      WHERE si.tenant_id = $1 
        AND si.payment_status != 'paid'
        AND (si.amount_ttc_cents - COALESCE(p.total_paid, 0)) > 0
      ORDER BY si.invoice_date ASC
      LIMIT 10
    `, [tenantId]);

    // 4. Dernières factures
    const recentInvoices = await pool.query(`
      SELECT 
        si.id,
        si.invoice_number,
        si.invoice_date,
        si.customer_name,
        si.amount_ttc_cents / 100 as amount_ttc_dh,
        si.payment_status
      FROM sales_invoices si
      WHERE si.tenant_id = $1
      ORDER BY si.created_at DESC
      LIMIT 10
    `, [tenantId]);

    // 5. Alertes stock bas
    const lowStock = await pool.query(`
      SELECT 
        p.id,
        p.reference,
        p.name,
        COALESCE(sm.stock_quantity, 0) as current_stock,
        p.min_stock
      FROM products p
      LEFT JOIN (
        SELECT 
          product_id,
          SUM(CASE WHEN type = 'IN' THEN quantity ELSE -quantity END) as stock_quantity
        FROM stock_movements
        GROUP BY product_id
      ) sm ON sm.product_id = p.id
      WHERE p.tenant_id = $1 
        AND p.is_active = true
        AND p.min_stock > 0
        AND COALESCE(sm.stock_quantity, 0) <= p.min_stock
      LIMIT 5
    `, [tenantId]);

    const totalOutstanding = outstanding.rows.reduce((sum, inv) => sum + Number(inv.remaining_cents), 0);

    res.json({
      success: true,
      data: {
        monthly: {
          total_ht_dh: monthlyRevenue.rows[0].total_ht / 100,
          total_tva_dh: monthlyRevenue.rows[0].total_tva / 100,
          total_ttc_dh: (monthlyRevenue.rows[0].total_ht + monthlyRevenue.rows[0].total_tva) / 100,
          invoice_count: parseInt(monthlyRevenue.rows[0].invoice_count)
        },
        yearly: {
          total_ht_dh: yearlyRevenue.rows[0].total_ht / 100,
          total_tva_dh: yearlyRevenue.rows[0].total_tva / 100,
          total_ttc_dh: (yearlyRevenue.rows[0].total_ht + yearlyRevenue.rows[0].total_tva) / 100,
          invoice_count: parseInt(yearlyRevenue.rows[0].invoice_count)
        },
        outstanding: {
          total_dh: totalOutstanding / 100,
          count: outstanding.rows.length,
          invoices: outstanding.rows.map(inv => ({
            id: inv.id,
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            customer_name: inv.customer_name || `${inv.first_name || ''} ${inv.last_name || ''}`.trim(),
            remaining_dh: inv.remaining_cents / 100
          }))
        },
        recent_invoices: recentInvoices.rows,
        low_stock_alerts: lowStock.rows.map(p => ({
          id: p.id,
          reference: p.reference,
          name: p.name,
          current_stock: parseInt(p.current_stock),
          min_stock: p.min_stock
        }))
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/accounting/revenue - Chiffre d'affaires
router.get('/revenue', requirePermission('accounting.read'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Dates start_date et end_date requises' });
    }
    
    const revenue = await pool.query(`
      SELECT 
        DATE_TRUNC('month', si.invoice_date) as month,
        COALESCE(SUM(sii.total_cents), 0) / 100 as total_ht_dh,
        COALESCE(SUM(sii.tax_amount_cents), 0) / 100 as total_tva_dh,
        COUNT(DISTINCT si.id) as invoice_count
      FROM sales_invoices si
      JOIN sales_invoice_items sii ON sii.invoice_id = si.id
      WHERE si.tenant_id = $1 
        AND si.invoice_date BETWEEN $2 AND $3
        AND si.payment_status != 'cancelled'
      GROUP BY DATE_TRUNC('month', si.invoice_date)
      ORDER BY month DESC
    `, [req.tenantId, start_date, end_date]);
    
    res.json({ success: true, data: revenue.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/accounting/outstanding - Créances clients
router.get('/outstanding', requirePermission('accounting.read'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        si.id,
        si.invoice_number,
        si.invoice_date,
        si.customer_name,
        c.first_name,
        c.last_name,
        si.amount_ttc_cents / 100 as amount_ttc_dh,
        COALESCE(p.total_paid, 0) / 100 as paid_dh,
        (si.amount_ttc_cents - COALESCE(p.total_paid, 0)) / 100 as remaining_dh,
        EXTRACT(DAY FROM (CURRENT_DATE - si.invoice_date)) as days_overdue
      FROM sales_invoices si
      LEFT JOIN clients c ON c.id = si.client_id
      LEFT JOIN (
        SELECT invoice_id, SUM(amount_cents) as total_paid
        FROM payments
        GROUP BY invoice_id
      ) p ON p.invoice_id = si.id
      WHERE si.tenant_id = $1 
        AND si.payment_status != 'paid'
        AND (si.amount_ttc_cents - COALESCE(p.total_paid, 0)) > 0
      ORDER BY si.invoice_date ASC
    `, [req.tenantId]);
    
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// JOURNAL COMPTABLE
// =======================

// GET /api/accounting/journal - Journal comptable
router.get('/journal', requirePermission('accounting.read'), async (req, res) => {
  try {
    const { start_date, end_date, limit = 100 } = req.query;
    
    let query = `
      SELECT * FROM accounting_journal 
      WHERE tenant_id = $1 
    `;
    const params = [req.tenantId];
    let paramIndex = 2;
    
    if (start_date && end_date) {
      query += ` AND entry_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(start_date, end_date);
      paramIndex += 2;
    }
    
    query += ` ORDER BY entry_date DESC, id DESC LIMIT $${paramIndex}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// EXPORT TVA
// =======================

// GET /api/accounting/tva-declarations/:id/export
router.get('/tva-declarations/:id/export', requirePermission('accounting.read'), async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId || 'default-shop';

    // 1. Récupérer la déclaration TVA
    const declarationResult = await pool.query(`
      SELECT id, year, quarter, start_date, end_date, due_date,
             total_ht_cents, total_tva_collected_cents, 
             total_tva_deductible_cents, net_tva_due_cents
      FROM tva_declarations
      WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);
    
    if (declarationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Déclaration non trouvée' });
    }
    
    const declaration = declarationResult.rows[0];

    // 2. Ventes par taux (utilise la vue unifiée si elle existe, sinon requête directe)
    let salesResult;
    try {
      salesResult = await pool.query(`
        SELECT 
          tax_rate as taux,
          SUM(amount_ht_cents) as total_ht,
          SUM(tax_amount_cents) as total_tva
        FROM v_tva_export_unified
        WHERE tenant_id = $1 
          AND source_type = 'sale'
          AND invoice_date BETWEEN $2 AND $3
        GROUP BY tax_rate
        ORDER BY tax_rate DESC
      `, [tenantId, declaration.start_date, declaration.end_date]);
    } catch (err) {
      // Fallback si la vue n'existe pas
      salesResult = await pool.query(`
        SELECT 
          COALESCE(sii.tax_rate, 20) as taux,
          SUM(sii.total_cents) as total_ht,
          SUM(COALESCE(sii.tax_amount_cents, 0)) as total_tva
        FROM sales_invoices si
        JOIN sales_invoice_items sii ON sii.invoice_id = si.id
        WHERE si.tenant_id = $1 
          AND si.invoice_date BETWEEN $2 AND $3
          AND si.payment_status != 'cancelled'
        GROUP BY sii.tax_rate
        ORDER BY sii.tax_rate DESC
      `, [tenantId, declaration.start_date, declaration.end_date]);
    }

    // 3. Achats par taux
    const purchasesResult = await pool.query(`
      SELECT 
        20 as taux,
        COALESCE(SUM(amount_ht * 100), 0) as total_ht,
        COALESCE(SUM(amount_tva * 100), 0) as total_tva
      FROM supplier_invoices
      WHERE tenant_id = $1 
        AND invoice_date BETWEEN $2 AND $3
        AND payment_status != 'cancelled'
    `, [tenantId, declaration.start_date, declaration.end_date]);

    // 4. Infos entreprise
    const companyResult = await pool.query(`
      SELECT company_name, address, phone, email, rc, if_number, patente, ice, logo_url
      FROM company_settings
      WHERE tenant_id = $1 LIMIT 1
    `, [tenantId]);

    const company = companyResult.rows[0] || {
      company_name: 'MARZOUK OPTIQUE',
      address: 'N40 Rue 6, Haj Fatah – Casablanca',
      phone: '05 22 90 00 42',
      email: 'contact@optiquev7.ma',
      rc: '397194',
      if_number: '40416741',
      patente: '36265648',
      ice: '000819745000054'
    };

    // 5. Formater les données avec tous les taux (20,14,10,7,0)
    const allRates = [20, 14, 10, 7, 0];
    
    const salesByRate = allRates.map(rate => {
      const found = salesResult.rows.find(r => parseFloat(r.taux) === rate);
      return {
        taux: rate,
        base_ht: found ? Math.round(Number(found.total_ht) / 100) : 0,
        tva: found ? Math.round(Number(found.total_tva) / 100) : 0
      };
    });
    
    const purchasesByRate = allRates.map(rate => {
      const found = purchasesResult.rows.find(r => parseFloat(r.taux) === rate);
      return {
        taux: rate,
        base_ht: found ? Math.round(Number(found.total_ht) / 100) : 0,
        tva: found ? Math.round(Number(found.total_tva) / 100) : 0
      };
    });
    
    const totalHT = Math.round(Number(declaration.total_ht_cents) / 100);
    const totalTVACollected = Math.round(Number(declaration.total_tva_collected_cents) / 100);
    const totalTVADeductible = Math.round(Number(declaration.total_tva_deductible_cents) / 100);
    const netAPayer = Math.round(Number(declaration.net_tva_due_cents) / 100);
    
    const pdfData = {
      declaration: {
        ...declaration,
        total_ht_cents: Number(declaration.total_ht_cents),
        total_tva_collected_cents: Number(declaration.total_tva_collected_cents),
        total_tva_deductible_cents: Number(declaration.total_tva_deductible_cents),
        net_tva_due_cents: Number(declaration.net_tva_due_cents)
      },
      company,
      salesByRate,
      purchasesByRate,
      totalHT,
      totalTVACollected,
      totalTVADeductible,
      netAPayer,
      quarterNames: { 1: '1er Trimestre', 2: '2ème Trimestre', 3: '3ème Trimestre', 4: '4ème Trimestre' },
      generatedAt: new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })
    };

    res.json(pdfData);

  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =======================
// PLAN COMPTABLE
// =======================

// GET /api/accounting/chart-of-accounts - Liste des comptes
router.get('/chart-of-accounts', requirePermission('accounting.read'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    
    const query = `
      SELECT 
        id,
        account_number,
        account_name,
        class,
        type,
        parent_id,
        is_active,
        created_at
      FROM plan_comptable
      WHERE tenant_id = $1
      ORDER BY account_number
    `;
    
    const result = await pool.query(query, [tenantId]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/accounting/chart-of-accounts - Créer un compte
router.post('/chart-of-accounts', requirePermission('accounting.write'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { account_number, account_name, class: accountClass, type, parent_id } = req.body;
    
    const query = `
      INSERT INTO plan_comptable (
        account_number, account_name, class, type, parent_id, is_active, tenant_id
      ) VALUES ($1, $2, $3, $4, $5, true, $6)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      account_number, account_name, accountClass, type, parent_id, tenantId
    ]);
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/accounting/chart-of-accounts/:id - Modifier un compte
router.put('/chart-of-accounts/:id', requirePermission('accounting.write'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { account_number, account_name, class: accountClass, type, parent_id, is_active } = req.body;
    
    const query = `
      UPDATE plan_comptable 
      SET account_number = $1, account_name = $2, class = $3, 
          type = $4, parent_id = $5, is_active = $6
      WHERE id = $7 AND tenant_id = $8
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      account_number, account_name, accountClass, type, parent_id, is_active, id, tenantId
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Compte non trouvé' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/accounting/chart-of-accounts/:id - Supprimer un compte
router.delete('/chart-of-accounts/:id', requirePermission('accounting.write'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    
    const query = `
      DELETE FROM plan_comptable 
      WHERE id = $1 AND tenant_id = $2
      RETURNING id
    `;
    
    const result = await pool.query(query, [id, tenantId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Compte non trouvé' });
    }
    
    res.json({ success: true, message: 'Compte supprimé' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/tva/declaration - Nouvelle route TVA utilisant le core propre
router.get('/v2/tva/declaration', requirePermission('accounting.read'), async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { year, quarter } = req.query;
        
        // Calculer les dates du trimestre
        const startDate = `${year}-${(quarter - 1) * 3 + 1}-01`;
        let endDate;
        if (quarter === 4) {
            endDate = `${year}-12-31`;
        } else {
            const nextQuarterStart = new Date(parseInt(year), quarter * 3, 1);
            endDate = new Date(nextQuarterStart - 1).toISOString().split('T')[0];
        }
        
        // Utiliser core_optical_job pour les achats de verres
        const result = await pool.query(`
            WITH sales_tva AS (
                SELECT 
                    'sale' as type,
                    20 as tax_rate,
                    SUM(total_ht_cents) as total_ht,
                    SUM(total_tva_cents) as total_tva
                FROM core_sales_order
                WHERE tenant_id = $1 
                    AND order_date BETWEEN $2 AND $3
                    AND status != 'cancelled'
            ),
            purchase_tva AS (
                SELECT 
                    'purchase' as type,
                    20 as tax_rate,
                    SUM(cost_price_cents * 100) as total_ht,
                    SUM(cost_price_cents * 20) as total_tva
                FROM core_optical_job
                WHERE tenant_id = $1 
                    AND ordered_at BETWEEN $2 AND $3
                    AND job_status != 'cancelled'
            )
            SELECT * FROM sales_tva
            UNION ALL
            SELECT * FROM purchase_tva
        `, [tenantId, startDate, endDate]);
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// EXPORT TVA V2 - Utilise le nouveau core propre
// ============================================

router.get('/v2/tva/export', requirePermission('accounting.read'), async (req, res) => {
  try {
    const tenantId = req.tenantId || 'default-shop';
    const { year, quarter } = req.query;
    
    if (!year || !quarter) {
      return res.status(400).json({ error: 'year et quarter sont requis' });
    }
    
    // Calculer les dates du trimestre
    const startDate = `${year}-${(parseInt(quarter) - 1) * 3 + 1}-01`;
    let endDate;
    if (parseInt(quarter) == 4) {
      endDate = `${year}-12-31`;
    } else {
      const lastDay = new Date(parseInt(year), parseInt(quarter) * 3, 0);
      endDate = `${year}-${parseInt(quarter) * 3}-${lastDay.getDate()}`;
    }
    
    console.log(`📊 Export TVA V2 - Période: ${startDate} au ${endDate}`);
    
    // 1. Ventes (depuis core_sales_order)
    const salesResult = await pool.query(`
      SELECT 
        20 as tax_rate,
        COALESCE(SUM(total_ht_cents), 0) as total_ht,
        COALESCE(SUM(total_tva_cents), 0) as total_tva
      FROM core_sales_order
      WHERE tenant_id = $1 
        AND order_date BETWEEN $2 AND $3
        AND status != 'cancelled'
    `, [tenantId, startDate, endDate]);
    
    // 2. Achats de verres (depuis core_optical_job)
    const purchasesResult = await pool.query(`
      SELECT 
        20 as tax_rate,
        COALESCE(SUM(cost_price_cents * 100), 0) as total_ht,
        COALESCE(SUM(cost_price_cents * 20), 0) as total_tva
      FROM core_optical_job
      WHERE tenant_id = $1 
        AND ordered_at BETWEEN $2 AND $3
        AND job_status != 'cancelled'
    `, [tenantId, startDate, endDate]);
    
    // 3. Infos entreprise
    const companyResult = await pool.query(`
      SELECT company_name, address, phone, email, rc, if_number, patente, ice, logo_url
      FROM company_settings
      WHERE tenant_id = $1 LIMIT 1
    `, [tenantId]);
    
    const company = companyResult.rows[0] || {
      company_name: 'MARZOUK OPTIQUE',
      address: 'N40 Rue 6, Haj Fatah – Casablanca',
      phone: '05 22 90 00 42',
      email: 'contact@optiquev7.ma',
      rc: '397194',
      if_number: '40416741',
      patente: '36265648',
      ice: '000819745000054'
    };
    
    // 4. Formater les données avec tous les taux (20,14,10,7,0)
    const allRates = [20, 14, 10, 7, 0];
    
    const salesByRate = allRates.map(rate => {
      const found = salesResult.rows.find(r => parseFloat(r.tax_rate) === rate);
      return {
        taux: rate,
        base_ht: found ? Math.round(Number(found.total_ht) / 100) : 0,
        tva: found ? Math.round(Number(found.total_tva) / 100) : 0
      };
    });
    
    const purchasesByRate = allRates.map(rate => {
      const found = purchasesResult.rows.find(r => parseFloat(r.tax_rate) === rate);
      return {
        taux: rate,
        base_ht: found ? Math.round(Number(found.total_ht) / 100) : 0,
        tva: found ? Math.round(Number(found.total_tva) / 100) : 0
      };
    });
    
    const totalHT = salesByRate.reduce((sum, r) => sum + r.base_ht, 0);
    const totalTVACollected = salesByRate.reduce((sum, r) => sum + r.tva, 0);
    const totalTVADeductible = purchasesByRate.reduce((sum, r) => sum + r.tva, 0);
    const netAPayer = totalTVACollected - totalTVADeductible;
    
    // Date limite selon trimestre
    let dueDate;
    if (parseInt(quarter) == 1) dueDate = `${year}-04-30`;
    else if (parseInt(quarter) == 2) dueDate = `${year}-07-31`;
    else if (parseInt(quarter) == 3) dueDate = `${year}-10-31`;
    else dueDate = `${parseInt(year) + 1}-01-31`;
    
    const pdfData = {
      declaration: {
        year: parseInt(year),
        quarter: parseInt(quarter),
        start_date: startDate,
        end_date: endDate,
        due_date: dueDate
      },
      company,
      salesByRate,
      purchasesByRate,
      totalHT,
      totalTVACollected,
      totalTVADeductible,
      netAPayer,
      quarterNames: { 
        1: '1er Trimestre', 
        2: '2ème Trimestre', 
        3: '3ème Trimestre', 
        4: '4ème Trimestre' 
      },
      generatedAt: new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })
    };
    
    res.json(pdfData);
    
  } catch (error) {
    console.error('❌ Erreur export TVA V2:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;