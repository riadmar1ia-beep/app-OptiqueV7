const pool = require('../config/database');
const TVAService = require('./tvaService');

class AlertService {
  // Vérifier les échéances TVA et créer des alertes
  static async checkTVADeadlines(tenantId) {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    const declarations = await pool.query(`
      SELECT * FROM tva_declarations 
      WHERE tenant_id = $1 
        AND status = 'draft'
        AND due_date BETWEEN $2 AND $3
    `, [tenantId, today, nextWeek]);
    
    for (const decl of declarations.rows) {
      const existing = await pool.query(`
        SELECT id FROM alerts 
        WHERE type = 'tva_deadline' 
          AND title LIKE $1 
          AND tenant_id = $2
          AND is_acknowledged = false
      `, [`%T${decl.quarter} ${decl.year}%`, tenantId]);
      
      if (existing.rows.length === 0) {
        await pool.query(`
          INSERT INTO alerts (type, title, message, target_date, tenant_id)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          'tva_deadline',
          `⚠️ Échéance TVA imminente - T${decl.quarter} ${decl.year}`,
          `La déclaration TVA du ${decl.quarter}ème trimestre ${decl.year} doit être déposée avant le ${new Date(decl.due_date).toLocaleDateString('fr-FR')}. Montant dû: ${(decl.net_tva_due_cents / 100).toFixed(2)} DH`,
          decl.due_date,
          tenantId
        ]);
      }
    }
    
    return declarations.rows;
  }

  // Vérifier les échéances de paiement (factures impayées)
  static async checkPaymentDeadlines(tenantId) {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    const overdueInvoices = await pool.query(`
      SELECT i.id, i.invoice_number, i.invoice_date, i.amount_ttc_cents,
             i.created_at, i.client_id,
             COALESCE(c.first_name || ' ' || c.last_name, i.customer_name) as customer_name,
             (i.amount_ttc_cents - COALESCE(SUM(p.amount_cents), 0)) as remaining_cents
      FROM sales_invoices i
      LEFT JOIN clients c ON c.id = i.client_id
      LEFT JOIN payments p ON p.invoice_id = i.id
      WHERE i.tenant_id = $1 
        AND i.payment_status != 'paid'
        AND i.created_at < $2
      GROUP BY i.id, c.first_name, c.last_name, i.customer_name
      HAVING (i.amount_ttc_cents - COALESCE(SUM(p.amount_cents), 0)) > 0
      ORDER BY i.created_at ASC
      LIMIT 10
    `, [tenantId, nextWeek]);
    
    for (const invoice of overdueInvoices.rows) {
      const existing = await pool.query(`
        SELECT id FROM alerts 
        WHERE type = 'payment_due' 
          AND reference_id = $1 
          AND tenant_id = $2
          AND is_acknowledged = false
      `, [invoice.id, tenantId]);
      
      if (existing.rows.length === 0) {
        await pool.query(`
          INSERT INTO alerts (type, title, message, target_date, reference_id, tenant_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          'payment_due',
          `💰 Facture impayée - ${invoice.invoice_number}`,
          `La facture ${invoice.invoice_number} de ${(invoice.remaining_cents / 100).toFixed(2)} DH est due depuis le ${new Date(invoice.invoice_date).toLocaleDateString('fr-FR')} pour ${invoice.customer_name}`,
          invoice.invoice_date,
          invoice.id,
          tenantId
        ]);
      }
    }
    
    return overdueInvoices.rows;
  }

  // Récupérer les alertes non lues
  static async getUnreadAlerts(tenantId, userId = null) {
    let query = `
      SELECT * FROM alerts 
      WHERE tenant_id = $1 
        AND is_read = false
      ORDER BY created_at DESC
    `;
    const params = [tenantId];
    
    if (userId) {
      query = `
        SELECT * FROM alerts 
        WHERE tenant_id = $1 
          AND is_read = false
          AND (user_id IS NULL OR user_id = $2)
        ORDER BY created_at DESC
      `;
      params.push(userId);
    }
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  // Récupérer toutes les alertes
  static async getAllAlerts(tenantId, limit = 50) {
    const result = await pool.query(`
      SELECT * FROM alerts 
      WHERE tenant_id = $1 
      ORDER BY created_at DESC
      LIMIT $2
    `, [tenantId, limit]);
    
    return result.rows;
  }

  // Marquer une alerte comme lue
  static async markAsRead(alertId, tenantId) {
    const result = await pool.query(`
      UPDATE alerts 
      SET is_read = true 
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `, [alertId, tenantId]);
    
    return result.rows[0];
  }

  // Marquer une alerte comme acquittée
  static async acknowledgeAlert(alertId, tenantId) {
    const result = await pool.query(`
      UPDATE alerts 
      SET is_acknowledged = true, is_read = true
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `, [alertId, tenantId]);
    
    return result.rows[0];
  }

  // Supprimer une alerte
  static async deleteAlert(alertId, tenantId) {
    await pool.query(`
      DELETE FROM alerts 
      WHERE id = $1 AND tenant_id = $2
    `, [alertId, tenantId]);
    
    return true;
  }

  // Lancer toutes les vérifications
  static async runAllChecks(tenantId) {
    const tvaDeadlines = await this.checkTVADeadlines(tenantId);
    const paymentDeadlines = await this.checkPaymentDeadlines(tenantId);
    
    return {
      tva_deadlines: tvaDeadlines.length,
      payment_deadlines: paymentDeadlines.length
    };
  }
}

module.exports = AlertService;