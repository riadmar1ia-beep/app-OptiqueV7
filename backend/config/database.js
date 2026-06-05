const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'ERP_OptiqueV7',
  port: process.env.DB_PORT || 5432,
  
  // Options supplémentaires
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Gestion des erreurs du pool
pool.on('error', (err) => {
  console.error('❌ Erreur inattendue sur le pool PostgreSQL:', err);
});

module.exports = pool;