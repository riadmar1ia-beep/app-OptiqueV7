// backend/src/services/sequence.service.js

async function getNextInvoiceNumber(dbClient, tenantId) {
  const year = new Date().getFullYear();
  const prefix = 'FAC';
  
  const result = await dbClient.query(
    `INSERT INTO document_sequences (tenant_id, document_type, prefix, current_number, year, created_at, updated_at)
     VALUES ($1, 'invoice', $2, 1, $3, NOW(), NOW())
     ON CONFLICT (tenant_id, document_type, year) DO UPDATE
     SET current_number = document_sequences.current_number + 1,
         updated_at = NOW()
     RETURNING current_number`,
    [tenantId, prefix, year]
  );
  
  const nextNum = result.rows[0].current_number;
  return `${prefix}-${year}-${nextNum.toString().padStart(5, '0')}`;
}

async function getExistingInvoiceByOrder(dbClient, orderId) {
  const result = await dbClient.query(
    `SELECT invoice_number FROM core_invoices WHERE order_id = $1 LIMIT 1`,
    [orderId]
  );
  if (result.rows.length > 0) {
    return { exists: true, invoice_number: result.rows[0].invoice_number };
  }
  return { exists: false, invoice_number: null };
}

async function initializeSequenceFromExistingInvoices(dbClient, tenantId) {
  const result = await dbClient.query(
    `SELECT 
       EXTRACT(YEAR FROM invoice_date) as year,
       MAX(CAST(SPLIT_PART(invoice_number, '-', 3) AS INTEGER)) as last_num
     FROM core_invoices
     WHERE tenant_id = $1 AND invoice_number LIKE 'FAC-%'
     GROUP BY EXTRACT(YEAR FROM invoice_date)`,
    [tenantId]
  );
  
  for (const row of result.rows) {
    const year = parseInt(row.year);
    const lastNumber = row.last_num || 0;
    if (lastNumber > 0) {
      await dbClient.query(
        `INSERT INTO document_sequences (tenant_id, document_type, prefix, current_number, year, created_at, updated_at)
         VALUES ($1, 'invoice', 'FAC', $2, $3, NOW(), NOW())
         ON CONFLICT (tenant_id, document_type, year) DO UPDATE
         SET current_number = EXCLUDED.current_number, updated_at = NOW()`,
        [tenantId, lastNumber, year]
      );
      console.log(`✅ Séquence initialisée à ${lastNumber} pour ${year} (${tenantId})`);
    }
  }
}

module.exports = { getNextInvoiceNumber, getExistingInvoiceByOrder, initializeSequenceFromExistingInvoices };
