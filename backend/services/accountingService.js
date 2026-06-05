const pool = require('../config/database');

class AccountingService {
    
    // Dashboard utilisant les nouvelles vues
    static async getDashboard(tenantId) {
        const client = await pool.connect();
        try {
            // 1. Chiffre d'affaires du mois (depuis v_tva_export_unified)
            const monthlyRevenue = await pool.query(`
                SELECT 
                    COALESCE(SUM(amount_ht_cents), 0) as total_ht,
                    COALESCE(SUM(tax_amount_cents), 0) as total_tva,
                    COUNT(DISTINCT invoice_number) as invoice_count
                FROM v_tva_export_unified
                WHERE tenant_id = $1 
                    AND source_type = 'sale'
                    AND invoice_date >= DATE_TRUNC('month', CURRENT_DATE)
            `, [tenantId]);

            // 2. Chiffre d'affaires de l'année
            const yearlyRevenue = await pool.query(`
                SELECT 
                    COALESCE(SUM(amount_ht_cents), 0) as total_ht,
                    COALESCE(SUM(tax_amount_cents), 0) as total_tva,
                    COUNT(DISTINCT invoice_number) as invoice_count
                FROM v_tva_export_unified
                WHERE tenant_id = $1 
                    AND source_type = 'sale'
                    AND invoice_date >= DATE_TRUNC('year', CURRENT_DATE)
            `, [tenantId]);

            // 3. Créances clients (depuis stock movements)
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

            // 4. Dernières factures (depuis v_tva_export_unified)
            const recentInvoices = await pool.query(`
                SELECT DISTINCT
                    invoice_number,
                    invoice_date,
                    source_type,
                    SUM(amount_ht_cents) / 100 as total_ht_dh,
                    SUM(tax_amount_cents) / 100 as total_tva_dh
                FROM v_tva_export_unified
                WHERE tenant_id = $1 AND source_type = 'sale'
                GROUP BY invoice_number, invoice_date, source_type
                ORDER BY invoice_date DESC
                LIMIT 10
            `, [tenantId]);

            // 5. Stock bas (alertes)
            const lowStock = await pool.query(`
                SELECT 
                    p.id,
                    p.reference,
                    p.name,
                    COALESCE(vs.physical_stock, 0) as current_stock,
                    p.min_stock
                FROM products p
                JOIN v_stock_accurate vs ON vs.product_id = p.id
                WHERE p.tenant_id = $1 
                    AND p.is_active = true
                    AND COALESCE(vs.physical_stock, 0) <= p.min_stock
                LIMIT 5
            `, [tenantId]);

            const totalOutstanding = outstanding.rows.reduce((sum, inv) => sum + Number(inv.remaining_cents), 0);

            return {
                success: true,
                data: {
                    monthly: {
                        total_ht_dh: monthlyRevenue.rows[0].total_ht / 100,
                        total_tva_dh: monthlyRevenue.rows[0].total_tva / 100,
                        invoice_count: parseInt(monthlyRevenue.rows[0].invoice_count)
                    },
                    yearly: {
                        total_ht_dh: yearlyRevenue.rows[0].total_ht / 100,
                        total_tva_dh: yearlyRevenue.rows[0].total_tva / 100,
                        invoice_count: parseInt(yearlyRevenue.rows[0].invoice_count)
                    },
                    outstanding: {
                        total_dh: totalOutstanding / 100,
                        count: outstanding.rows.length,
                        invoices: outstanding.rows.map(inv => ({
                            id: inv.id,
                            invoice_number: inv.invoice_number,
                            invoice_date: inv.invoice_date,
                            customer_name: inv.customer_name || `${inv.first_name} ${inv.last_name}`,
                            remaining_dh: inv.remaining_cents / 100
                        }))
                    },
                    recent_invoices: recentInvoices.rows,
                    low_stock_alerts: lowStock.rows.map(p => ({
                        product_id: p.id,
                        reference: p.reference,
                        name: p.name,
                        current_stock: p.current_stock,
                        min_stock: p.min_stock
                    }))
                }
            };
        } finally {
            client.release();
        }
    }

    // TVA Declaration utilisant la vue unifiée
    static async getTVADeclaration(tenantId, year, quarter) {
        const startDate = `${year}-${(quarter - 1) * 3 + 1}-01`;
        const endDate = quarter === 4 ? `${year}-12-31` : `${year}-${quarter * 3 + 1}-01` + ' - 1 day';
        
        const result = await pool.query(`
            SELECT 
                tax_rate,
                SUM(amount_ht_cents) / 100 as base_ht_dh,
                SUM(tax_amount_cents) / 100 as tva_dh
            FROM v_tva_export_unified
            WHERE tenant_id = $1 
                AND invoice_date BETWEEN $2 AND $3
            GROUP BY tax_rate
            ORDER BY tax_rate DESC
        `, [tenantId, startDate, endDate]);
        
        return result.rows;
    }
}

module.exports = AccountingService;