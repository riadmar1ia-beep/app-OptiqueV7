const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const http = require('http');
require('dotenv').config();

// Import des modules
const pool = require('./config/database');

// Import des routes
const productsRoutes = require('./routes/products');
const clientsRoutes = require('./routes/clients');
const prescriptionsRoutes = require('./routes/prescriptions');
const suppliersRoutes = require('./routes/suppliers');
const supplierOrdersRoutes = require('./routes/supplierOrders');
const purchaseOrdersRoutes = require('./routes/purchaseOrders');
const pricingRoutes = require('./routes/pricing');
const coatingsRoutes = require('./routes/coatings');
const stockRoutes = require('./routes/stock');
const invoicesRoutes = require('./routes/invoices');
const statsRoutes = require('./routes/stats');
const ordersRoutes = require('./routes/orders');
const salesRoutes = require('./routes/sales');
const settingsRoutes = require('./routes/settings');
const documentRoutes = require('./routes/documents');
const accountingRoutes = require('./routes/accounting');
const alertsRoutes = require('./routes/alerts');
const apiV2Routes = require('./routes/api_v2');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// 1. MIDDLEWARE DE BASE
// ============================================
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3001/',
  'http://localhost:3002',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://app.monerp.com'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = origin.replace(/\/$/, '');

    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    console.log('❌ Origin refusée:', origin);

    callback(new Error('Origin non autorisée'));
  },
  credentials: true
}));

app.use(cookieParser());
app.use(express.json());        
app.use(express.urlencoded({ extended: true }));

// ============================================
// 2. MIDDLEWARE DE LOGGING (debug)
// ============================================
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.originalUrl}`);
  next();
});

// ============================================
// 3. ROUTES PUBLIQUES (SANS AUTH)
// ============================================
app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));
app.get('/api/db-test', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ connected: true, message: '✅ Database connected' });
  } catch (err) {
    res.json({ connected: false, message: '❌ DB connection failed', error: err.message });
  }
});

// ROUTE AUTH (publique)
console.log('📌 Chargement de la route /api/auth...');
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);
console.log('✅ Route /api/auth montée');

// ============================================
// 4. MIDDLEWARE D'AUTHENTIFICATION
// ============================================
const authMiddleware = require('./middleware/auth');
console.log('✅ Middleware d\'authentification activé');

// ============================================
// 5. ROUTES PROTÉGÉES (avec permissions RBAC)
// ============================================
const { requirePermission } = require('./middleware/rbac');
const permissionsRoutes = require('./routes/permissions');

// Routes avec permissions spécifiques
app.use('/api/products', authMiddleware, requirePermission('products.read'), productsRoutes);
app.use('/api/clients', authMiddleware, requirePermission('clients.read'), clientsRoutes);
app.use('/api/prescriptions', authMiddleware, requirePermission('prescriptions.read'), prescriptionsRoutes);
app.use('/api/suppliers', authMiddleware, requirePermission('suppliers.read'), suppliersRoutes);
app.use('/api/orders/supplier', authMiddleware, requirePermission('orders.read'), supplierOrdersRoutes);
app.use('/api/supplier-orders', authMiddleware, requirePermission('orders.read'), supplierOrdersRoutes);
app.use('/api/orders/purchase', authMiddleware, requirePermission('orders.read'), purchaseOrdersRoutes);
app.use('/api/pricing', authMiddleware, requirePermission('pricing.read'), pricingRoutes);
app.use('/api/coatings', authMiddleware, requirePermission('pricing.read'), coatingsRoutes);
app.use('/api/stock', authMiddleware, requirePermission('stock.read'), stockRoutes);
app.use('/api', authMiddleware, requirePermission('sales.read'), invoicesRoutes);
app.use('/api/stats', authMiddleware, requirePermission('sales.read'), statsRoutes);
app.use('/api/orders', authMiddleware, requirePermission('orders.read'), ordersRoutes);
app.use('/api/sales', authMiddleware, requirePermission('sales.read'), salesRoutes);
app.use('/api/settings', authMiddleware, requirePermission('settings.read'), settingsRoutes);
app.use('/api/documents', authMiddleware, requirePermission('sales.read'), documentRoutes);
app.use('/api/permissions', authMiddleware, requirePermission('settings.read'), permissionsRoutes);
app.use('/api/accounting', authMiddleware, requirePermission('accounting.read'), accountingRoutes);
app.use('/api/alerts', authMiddleware, requirePermission('accounting.read'), alertsRoutes);
app.use('/api/v2', authMiddleware, apiV2Routes);
// ============================================
// 6. CONFIRMATION DE COMMANDE (protégée)
// ============================================
app.post('/api/orders/confirm/:id', authMiddleware, requirePermission('orders.write'), async (req, res) => {
  const { id } = req.params;
  const { supplier_id } = req.body;
  const dbClient = await pool.connect();
  
  try {
    await dbClient.query('BEGIN');
    
    const orderCheck = await dbClient.query(
      `SELECT so.id, so.status, so.order_type, so.client_id
       FROM core_sales_order so
       WHERE so.id = $1 AND so.tenant_id = $2`,
      [id, req.tenantId]
    );
    
    if (orderCheck.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    
    if (orderCheck.rows[0].order_type !== 'optical') {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'Seules les commandes optiques peuvent être confirmées' });
    }
    
    if (orderCheck.rows[0].status !== 'draft') {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'Commande déjà confirmée ou annulée' });
    }
    
    const clientId = orderCheck.rows[0].client_id;
    
    const allItems = await dbClient.query(
      `SELECT soi.*, 
              p.reference as product_reference, 
              p.name as product_name,
              p.supplier_id as product_supplier_id
       FROM core_sales_order_item soi
       LEFT JOIN products p ON p.id = soi.product_id
       WHERE soi.sales_order_id = $1`,
      [id]
    );
    
    if (allItems.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'Aucun article dans cette commande' });
    }
    
    const itemsBySupplier = new Map();
    
    for (const item of allItems.rows) {
      let itemSupplierId = supplier_id;
      
      if ((item.item_type === 'frame' || item.item_type === 'accessory') && item.product_supplier_id) {
        itemSupplierId = item.product_supplier_id;
      }
      
      if (!itemsBySupplier.has(itemSupplierId)) {
        itemsBySupplier.set(itemSupplierId, {
          supplier_id: itemSupplierId,
          items: [],
          has_lenses: false,
          has_frames: false,
          has_accessories: false,
          total_expected_price: 0
        });
      }
      
      const group = itemsBySupplier.get(itemSupplierId);
      
      let purchasePriceCents;
      if (item.item_type === 'lens') {
        purchasePriceCents = Math.round(item.total_cents * 0.5);
      } else if (item.item_type === 'frame') {
        purchasePriceCents = Math.round(item.total_cents * 0.6);
      } else {
        purchasePriceCents = Math.round(item.total_cents * 0.4);
      }
      
      group.items.push({
        id: item.id,
        item_type: item.item_type,
        product_id: item.product_id,
        reference: item.product_reference || item.description,
        name: item.product_name || item.description,
        quantity: item.quantity,
        unit_price_cents: item.unit_price_cents,
        total_cents: item.total_cents,
        purchase_price_cents: purchasePriceCents,
        metadata: item.metadata || null
      });
      
      group.total_expected_price += purchasePriceCents;
      
      if (item.item_type === 'lens') group.has_lenses = true;
      if (item.item_type === 'frame') group.has_frames = true;
      if (item.item_type === 'accessory') group.has_accessories = true;
    }
    
    let supplierOrderCount = 0;
    
    for (const [supplierId, group] of itemsBySupplier) {
      const supplierOrderId = 'SUP-' + crypto.randomUUID();
      
      let orderType = 'mixed';
      if (group.has_lenses && !group.has_frames && !group.has_accessories) orderType = 'lenses';
      if (!group.has_lenses && group.has_frames && !group.has_accessories) orderType = 'frames';
      if (!group.has_lenses && !group.has_frames && group.has_accessories) orderType = 'accessories';
      
      let rightEyeConfig = null;
      let leftEyeConfig = null;
      let hasRightEye = false;
      let hasLeftEye = false;
      
      if (group.has_lenses) {
        const lensItem = group.items.find(i => i.item_type === 'lens');
        if (lensItem && lensItem.metadata) {
          rightEyeConfig = lensItem.metadata.right_eye || null;
          leftEyeConfig = lensItem.metadata.left_eye || null;
          hasRightEye = !!(lensItem.metadata.right_eye);
          hasLeftEye = !!(lensItem.metadata.left_eye);
        }
      }
      
      const itemsDetails = group.items.map(item => ({
        id: item.id,
        item_type: item.item_type,
        product_id: item.product_id,
        reference: item.reference,
        name: item.name,
        quantity: item.quantity,
        unit_price_cents: item.unit_price_cents,
        total_cents: item.total_cents,
        purchase_price_cents: item.purchase_price_cents
      }));
      
      await dbClient.query(
        `INSERT INTO supplier_orders 
         (tenant_id, order_id, sales_order_id, client_id, supplier_id,
          items, order_type,
          right_eye_config, left_eye_config, has_right_eye, has_left_eye,
          status, expected_price_cents, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
        [
          req.tenantId, 
          supplierOrderId, 
          id, 
          clientId, 
          supplierId,
          JSON.stringify(itemsDetails),
          orderType,
          rightEyeConfig ? JSON.stringify(rightEyeConfig) : null,
          leftEyeConfig ? JSON.stringify(leftEyeConfig) : null,
          hasRightEye,
          hasLeftEye,
          'shipped', 
          group.total_expected_price
        ]
      );
      
      supplierOrderCount++;
    }
    
    await dbClient.query(
      `UPDATE core_sales_order 
       SET status = $1
       WHERE id = $2 AND tenant_id = $3`,
      ['pending', id, req.tenantId]
    );
    
    await dbClient.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: `Commande confirmée. ${supplierOrderCount} commande(s) fournisseur créée(s).`,
      nb_supplier_orders: supplierOrderCount
    });
    
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Erreur confirmation commande:', err);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  } finally {
    dbClient.release();
  }
});

// ============================================
// 7. MIDDLEWARE DE GESTION DES ERREURS JSON
// ============================================
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('\n========== ❌ JSON INVALIDE ==========');
    console.error('URL:', req.originalUrl);
    console.error('METHOD:', req.method);
    console.error('BODY REÇU:', req.rawBody);
    console.error('=====================================\n');

    return res.status(400).json({
      success: false,
      error: 'JSON invalide',
      message: 'Vérifiez le format de vos données'
    });
  }
  next(err);
});

// ============================================
// 8. GLOBAL ERROR HANDLER (TOUT EN BAS)
// ============================================
app.use((err, req, res, next) => {
  console.error('❌ ERREUR GLOBALE:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Erreur interne' : err.message
  });
});

// ============================================
// 9. DÉMARRAGE DU SERVEUR
// ============================================
const server = http.createServer({ maxHeaderSize: 65536 }, app);
server.listen(PORT, () => {
  console.log(`\n🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`🔐 Auth: http://localhost:${PORT}/api/auth/login`);
  console.log(`📦 API ready\n`);
});

// Gestion des erreurs non capturées
process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION:', err);
});

process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
});