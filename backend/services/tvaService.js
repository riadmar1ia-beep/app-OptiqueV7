const pool = require('../config/database');

class TVAService {
  // Dates limites TVA marocaines
  static getQuarterDates(year, quarter) {
    const quarters = {
      1: { start: `${year}-01-01`, end: `${year}-03-31`, due: `${year}-04-30` },
      2: { start: `${year}-04-01`, end: `${year}-06-30`, due: `${year}-07-31` },
      3: { start: `${year}-07-01`, end: `${year}-09-30`, due: `${year}-10-31` },
      4: { start: `${year}-10-01`, end: `${year}-12-31`, due: `${year+1}-01-31` }
    };
    return quarters[quarter];
  }

  // Calculer TVA collectée (ventes) pour une période
  static async getCollectedTVA(tenantId, startDate, endDate) {
  const result = await pool.query(`
    SELECT 
      COALESCE(SUM(amount_ht_cents), 0) as total_ht,
      COALESCE(SUM(tax_amount_cents), 0) as total_tva
    FROM sales_invoices 
    WHERE tenant_id = $1 
      AND invoice_date BETWEEN $2 AND $3
      AND payment_status = 'paid'
  `, [tenantId, startDate, endDate]);
  
  return {
    total_ht: parseInt(result.rows[0].total_ht),
    total_tva: parseInt(result.rows[0].total_tva)
  };
}

  // Calculer TVA déductible (achats) pour une période
  static async getDeductibleTVA(tenantId, startDate, endDate) {
    const result = await pool.query(`
      SELECT 
        COALESCE(SUM(amount_ht), 0) as total_ht,
        COALESCE(SUM(amount_tva), 0) as total_tva
      FROM supplier_invoices 
      WHERE tenant_id = $1 
        AND invoice_date BETWEEN $2 AND $3
        AND payment_status = 'paid'
    `, [tenantId, startDate, endDate]);
    
    return {
      total_ht: parseFloat(result.rows[0].total_ht) * 100,
      total_tva: parseFloat(result.rows[0].total_tva) * 100
    };
  }

  // Générer une déclaration TVA
  static async generateDeclaration(year, quarter, tenantId, userId = null) {
  const dates = this.getQuarterDates(year, quarter);
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Vérifier si la déclaration existe déjà
    const existing = await client.query(
      `SELECT id FROM tva_declarations 
       WHERE year = $1 AND quarter = $2 AND tenant_id = $3`,
      [year, quarter, tenantId]
    );
    
    if (existing.rows.length > 0) {
      throw new Error(`Déclaration T${quarter} ${year} déjà existante`);
    }
    
    // Récupérer TVA collectée (ventes)
    const collected = await client.query(`
      SELECT 
        COALESCE(SUM(amount_ht_cents), 0) as total_ht,
        COALESCE(SUM(tax_amount_cents), 0) as total_tva
      FROM sales_invoices 
      WHERE tenant_id = $1 
        AND invoice_date BETWEEN $2 AND $3
        AND payment_status = 'paid'
    `, [tenantId, dates.start, dates.end]);
    
    // Récupérer TVA déductible (achats)
    const deductible = await client.query(`
      SELECT 
        COALESCE(SUM(amount_ht), 0) as total_ht,
        COALESCE(SUM(amount_tva), 0) as total_tva
      FROM supplier_invoices 
      WHERE tenant_id = $1 
        AND invoice_date BETWEEN $2 AND $3
        AND payment_status = 'paid'
    `, [tenantId, dates.start, dates.end]);
    
    const totalCollected = parseInt(collected.rows[0].total_tva);
    const totalDeductible = Math.round(parseFloat(deductible.rows[0].total_tva) * 100);
    const totalHtCollected = parseInt(collected.rows[0].total_ht);
    const totalHtDeductible = Math.round(parseFloat(deductible.rows[0].total_ht) * 100);
    const netDue = totalCollected - totalDeductible;
    
    // Créer la déclaration
    const result = await client.query(`
      INSERT INTO tva_declarations (
        year, quarter, start_date, end_date, due_date,
        total_ht_cents, total_tva_collected_cents, 
        total_tva_deductible_cents, net_tva_due_cents,
        status, tenant_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10, $11)
      RETURNING *
    `, [
      year, quarter, dates.start, dates.end, dates.due,
      totalHtCollected + totalHtDeductible,
      totalCollected,
      totalDeductible,
      netDue,
      tenantId,
      userId
    ]);
    
    await client.query('COMMIT');
    
    return result.rows[0];
    
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

  // Créer une alerte pour la date limite
  static async createDeadlineAlert(declaration, tenantId) {
    const existing = await pool.query(
      `SELECT id FROM alerts 
       WHERE type = 'tva_deadline' 
         AND title LIKE $1 
         AND tenant_id = $2`,
      [`%T${declaration.quarter} ${declaration.year}%`, tenantId]
    );
    
    if (existing.rows.length === 0) {
      await pool.query(`
        INSERT INTO alerts (type, title, message, target_date, tenant_id)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        'tva_deadline',
        `📅 Déclaration TVA T${declaration.quarter} ${declaration.year}`,
        `La déclaration TVA du ${declaration.quarter}ème trimestre ${declaration.year} doit être déposée avant le ${new Date(declaration.due_date).toLocaleDateString('fr-FR')}. Montant dû: ${(declaration.net_tva_due_cents / 100).toFixed(2)} DH`,
        declaration.due_date,
        tenantId
      ]);
    }
  }

  // Valider une déclaration
  static async validateDeclaration(declarationId, tenantId, userId) {
    const result = await pool.query(`
      UPDATE tva_declarations 
      SET status = 'validated', validated_at = NOW(), validated_by = $3
      WHERE id = $1 AND tenant_id = $2 AND status = 'draft'
      RETURNING *
    `, [declarationId, tenantId, userId]);
    
    if (result.rows.length === 0) {
      throw new Error('Déclaration non trouvée ou déjà validée');
    }
    
    return result.rows[0];
  }

  // Récupérer les déclarations
  static async getDeclarations(tenantId, year = null) {
    let query = `
      SELECT d.*, 
             u1.first_name as created_by_name,
             u2.first_name as validated_by_name
      FROM tva_declarations d
      LEFT JOIN users u1 ON u1.id = d.created_by
      LEFT JOIN users u2 ON u2.id = d.validated_by
      WHERE d.tenant_id = $1
    `;
    const params = [tenantId];
    
    if (year) {
      query += ` AND d.year = $2`;
      params.push(year);
    }
    
    query += ` ORDER BY d.year DESC, d.quarter DESC`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  // Récupérer les détails d'une déclaration
  static async getDeclarationDetails(declarationId, tenantId) {
    const declaration = await pool.query(`
      SELECT d.*, 
             u1.first_name as created_by_name,
             u2.first_name as validated_by_name
      FROM tva_declarations d
      LEFT JOIN users u1 ON u1.id = d.created_by
      LEFT JOIN users u2 ON u2.id = d.validated_by
      WHERE d.id = $1 AND d.tenant_id = $2
    `, [declarationId, tenantId]);
    
    if (declaration.rows.length === 0) {
      throw new Error('Déclaration non trouvée');
    }
    
    const items = await pool.query(`
      SELECT * FROM tva_declaration_items 
      WHERE declaration_id = $1 
      ORDER BY document_date DESC
    `, [declarationId]);
    
    return {
      ...declaration.rows[0],
      items: items.rows
    };
  }
}

module.exports = TVAService;