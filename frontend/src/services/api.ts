// @ts-nocheck
// src/services/api.ts
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // cookies refresh token
});

// ============================================================
// INTERCEPTEUR REQUÊTE : Token JWT + Multi-tenant
// ============================================================
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  console.log('🔑 Token dans intercepteur:', token ? 'Présent' : 'ABSENT');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  config.headers['X-Tenant-Id'] = localStorage.getItem('tenantId') || 'default-shop';
  console.log('📤 Requête vers:', config.url);
  return config;
});

// ============================================
// INTERCEPTEUR RÉPONSE : Rafraîchir token si expiré
// ============================================
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
          return api(originalRequest);
        }).catch(err => Promise.reject(err));
      }
      
      originalRequest._retry = true;
      isRefreshing = true;
      
      try {
        console.log('🔄 Rafraîchissement du token...');
        
        const response = await axios.post(
          `${API_URL}/auth/refresh`,
          {},
          { 
            withCredentials: true,
            headers: { 
              'X-Tenant-Id': localStorage.getItem('tenantId') || 'default-shop',
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (response.data.success && response.data.data?.accessToken) {
          const newToken = response.data.data.accessToken;
          console.log('✅ Nouveau token reçu');
          localStorage.setItem('accessToken', newToken);
          
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          processQueue(null, newToken);
          
          return api(originalRequest);
        } else {
          throw new Error('Pas de token dans la réponse');
        }
      } catch (refreshError) {
        console.error('❌ Refresh échoué:', refreshError);
        processQueue(refreshError, null);
        
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        localStorage.removeItem('tenantId');
        
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    
    return Promise.reject(error);
  }
);

// ============================================================
// AUTH
// ============================================================
export const authService = {
  login:          (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  logout:         () => api.post('/auth/logout'),
  refresh:        () => api.post('/auth/refresh'),
  getMe:          () => api.get('/auth/me'),
  getUsers:       () => api.get('/auth/users'),
  createUser:     (data: any) => api.post('/auth/users', data),
  updateUser:     (id: string, data: any) => api.put(`/auth/users/${id}`, data),
  deleteUser:     (id: string) => api.delete(`/auth/users/${id}`),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/auth/me/password', data),
};

// ============================================================
// SETTINGS
// ============================================================
export const settingsService = {
  getCompanySettings:     () => api.get('/settings/company'),
  updateCompanySettings:  (data: any) => api.put('/settings/company', data),
  generateDocumentNumber: (type: string) => api.post(`/settings/generate-number/${type}`),
};

// ============================================================
// PRODUCTS
// ============================================================
export const productService = {
  getAll: async (params?: any) => {
    console.log('🔧 productService.getAll appelé');
    if (params && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString();
      return api.get('/products?' + queryString);
    }
    return api.get('/products');
  },
  getById:      (id: string)    => api.get(`/products/${id}`),
  create:       (data: any)     => api.post('/products', data),
  update:       (id: string, data: any) => api.put(`/products/${id}`, data),
  delete:       (id: string)    => api.delete(`/products/${id}`),
  getBySku:     (sku: string)     => api.get(`/products/sku/${sku}`),
  getByBarcode: (barcode: string) => api.get(`/products/barcode/${barcode}`),
  getLowStock:  ()                => api.get('/products/low-stock'),
  getFeatured:  ()                => api.get('/products/featured'),
  getByCategory:(category: string)=> api.get(`/products/category/${category}`),
  getAllTags:    ()                => api.get('/products/tags'),
  uploadImage: (productId: string, formData: FormData) =>
    api.post(`/products/${productId}/images`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deleteImage:    (productId: string, imageId: string) =>
    api.delete(`/products/${productId}/images/${imageId}`),
  setPrimaryImage:(productId: string, imageId: string) =>
    api.put(`/products/${productId}/images/${imageId}/primary`),
  addVariant:    (productId: string, data: any) =>
    api.post(`/products/${productId}/variants`, data),
  updateVariant: (productId: string, variantId: string, data: any) =>
    api.put(`/products/${productId}/variants/${variantId}`, data),
  deleteVariant: (productId: string, variantId: string) =>
    api.delete(`/products/${productId}/variants/${variantId}`),
  addTag:    (productId: string, tag: string) =>
    api.post(`/products/${productId}/tags`, { tag }),
  removeTag: (productId: string, tag: string) =>
    api.delete(`/products/${productId}/tags/${encodeURIComponent(tag)}`),
  addRelatedProduct:    (productId: string, relatedId: string, relationType: string) =>
    api.post(`/products/${productId}/related`, { related_product_id: relatedId, relation_type: relationType }),
  removeRelatedProduct: (productId: string, relatedId: string) =>
    api.delete(`/products/${productId}/related/${relatedId}`),
  getRelatedProducts:   (productId: string) =>
    api.get(`/products/${productId}/related`),
  addStockMovement: (productId: string, data: any) =>
    api.post(`/products/${productId}/stock-movement`, data),
  getStockHistory:  (productId: string) =>
    api.get(`/products/${productId}/stock-history`),
  exportProducts: () =>
    api.get('/products/export', { responseType: 'blob' }),
  importProducts: (formData: FormData) =>
    api.post('/products/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// ============================================================
// SALES (ventes directes caisse)
// ============================================================
export const saleService = {
  getAll:       ()              => api.get('/sales'),
  getById:      (id: string)    => api.get(`/sales/${id}`),
  create:       (data: any)     => api.post('/sales', data),
  updateStatus: (id: string, status: string) =>
    api.put(`/sales/${id}/status`, { status }),
  getInvoice:   (id: string)    =>
    api.get(`/sales/${id}/invoice`, { responseType: 'blob' }),
};

// ============================================================
// STATS
// ============================================================
export const statsService = {
  getStats:       () => api.get('/stats'),
  getDashboardStats: () => api.get('/stats/dashboard'),
  getSalesStats:  (period?: string) =>
    api.get(period ? `/stats/sales?period=${period}` : '/stats/sales'),
  getTopProducts: (limit?: number) =>
    api.get(limit ? `/stats/top-products?limit=${limit}` : '/stats/top-products'),
};

// ============================================================
// DOCUMENTS
// ============================================================
export const documentService = {
  getNextDocumentNumber:  (type: string) =>
    api.get(`/documents/next-number/${type}`),
  createInvoice:          (data: any)    => api.post('/documents/invoice', data),
  createCreditNote:       (data: any)    => api.post('/documents/credit-note', data),
  getInvoice:             (invoiceNumber: string) =>
    api.get(`/documents/invoice/${invoiceNumber}`),
  getSupplierOrderData:   (id: string)   =>
    api.get(`/documents/supplier-order-data/${id}`),
  getPurchaseOrderData:   (id: string)   =>
    api.get(`/documents/purchase-order-data/${id}`),
};

// ============================================================
// ORDERS — Supplier Orders (commandes verres fournisseur)
// ============================================================
export const orderService = {
  calculatePrice: (config: any) => api.post('/orders/calculate-price', config),
  getSupplierOrders:       ()            => api.get('/orders/supplier/orders'),
  getSupplierOrderDetails: (id: string)  => api.get(`/orders/supplier/orders/${id}`),
  updateSupplierOrderStatus:(id: string, status: string) =>
    api.put(`/orders/supplier/orders/${id}/status`, { status }),
  exportSupplierOrder:     (id: string)  =>
    api.get(`/orders/supplier/export/${id}`, { responseType: 'blob' }),
  receiveOrder:            (id: string, data?: any) =>
    api.post(`/orders/supplier/orders/${id}/receive`, data || {}),
  deleteOrder:             (id: string)  =>
    api.delete(`/orders/supplier/orders/${id}`),
  validateOrder:   (id: string, notes: string) =>
    api.post(`/orders/supplier/orders/${id}/validate`, { notes }),
  disputeOrder:    (id: string, issues: any[], notes: string) =>
    api.post(`/orders/supplier/orders/${id}/dispute`, { issues, notes }),
  resolveDispute:  (id: string, resolved_notes: string) =>
    api.put(`/orders/supplier/orders/${id}/dispute/resolve`, { resolved_notes }),
  returnOrder:     (id: string, return_notes: string, return_items?: any[]) =>
    api.post(`/orders/supplier/orders/${id}/return`, { return_notes, return_items }),
  getOrderIssues:  (id: string) =>
    api.get(`/orders/supplier/orders/${id}/issues`),
  requestCreditNote: async (id: string, data: any) => {
    const response = await api.post(`/orders/supplier/orders/${id}/credit-note`, data);
    return response.data;
  },
  getOrderEvents:      (id: string) =>
    api.get(`/orders/supplier/orders/${id}/events`),
  validateCreditNote:  (creditNoteId: string) =>
    api.put(`/orders/credit-notes/${creditNoteId}/validate`),
};

// ============================================================
// PRICING
// ============================================================
export const pricingService = {
  getAll:       ()                        => api.get('/pricing'),
  getById:      (id: string)              => api.get(`/pricing/${id}`),
  create:       (data: any)               => api.post('/pricing', data),
  update:       (id: string, data: any)   => api.put(`/pricing/${id}`, data),
  delete:       (id: string)              => api.delete(`/pricing/${id}`),
  getByCategory:(category: string)        => api.get(`/pricing/category/${category}`),
  duplicate:    (id: string)              => api.post(`/pricing/${id}/duplicate`),
};

// ============================================================
// COATINGS
// ============================================================
export const coatingService = {
  getAll:    ()                        => api.get('/coatings'),
  getById:   (id: string)              => api.get(`/coatings/${id}`),
  create:    (data: any)               => api.post('/coatings', data),
  update:    (id: string, data: any)   => api.put(`/coatings/${id}`, data),
  delete:    (id: string)              => api.delete(`/coatings/${id}`),
  getByType: (type: string)            => api.get(`/coatings/type/${type}`),
};

// ============================================================
// CLIENTS
// ============================================================
export const clientService = {
  getAll:      ()                        => api.get('/clients'),
  getById:     (id: string)              => api.get(`/clients/${id}`),
  getSummary:  (id: string)              => api.get(`/clients/${id}/summary`),
  create:      (data: any)               => api.post('/clients', data),
  update:      (id: string, data: any)   => api.put(`/clients/${id}`, data),
  delete:      (id: string)              => api.delete(`/clients/${id}`),
  getLoyaltyPoints: (id: string)         => api.get(`/clients/${id}/loyalty-points`),
  getPrescriptions:  (clientId: string)           => api.get(`/prescriptions/client/${clientId}`),
  createPrescription:(data: any)                  => api.post('/prescriptions', data),
  updatePrescription:(id: string, data: any)      => api.put(`/prescriptions/${id}`, data),
  deletePrescription:(id: string)                 => api.delete(`/prescriptions/${id}`),
};

// ============================================================
// SUPPLIERS
// ============================================================
export const supplierService = {
  getAll:          ()                        => api.get('/suppliers'),
  getById:         (id: string)              => api.get(`/suppliers/${id}`),
  create:          (data: any)               => api.post('/suppliers', data),
  update:          (id: string, data: any)   => api.put(`/suppliers/${id}`, data),
  delete:          (id: string)              => api.delete(`/suppliers/${id}`),
  getActiveSuppliers: ()                     => api.get('/suppliers/active'),
  getSupplierOrders:  (id: string)           => api.get(`/suppliers/${id}/orders`),
  linkToOrder:     (orderId: string, supplierId: string) =>
    api.put(`/orders/supplier/orders/${orderId}/supplier`, { supplier_id: supplierId }),
};

// ============================================================
// GLOBAL ORDERS (commandes client optiques)
// ============================================================
export const globalOrderService = {
  create:       (data: any)      => api.post('/orders/create', data),
  confirm:      (id: string, supplier_id: string) =>
    api.post(`/orders/confirm/${id}`, { supplier_id }),
  deliver:      (id: string, paymentData: any) =>
    api.post(`/orders/deliver/${id}`, paymentData),
  getAll:       ()               => api.get('/orders'),
  getOpticalById:(id: string)    => api.get(`/orders/optical/${id}`),
  delete: (id: string) => api.delete(`/orders/sales-orders/${id}`),
  updateStatus: (id: string, status: string) =>
    api.put(`/orders/sales-orders/${id}/status`, { status }),
  generateInvoice:     (id: string) =>
    api.get(`/orders/${id}/invoice`, { responseType: 'blob' }),
  generateDeliveryNote:(id: string) =>
    api.get(`/orders/${id}/delivery-note`, { responseType: 'blob' }),
  createSupplierOrder: (data: any) => api.post('/supplier-orders', data),
  getSupplierOrdersBySalesOrder: (salesOrderId: string) =>
    api.get(`/supplier-orders/sales-order/${salesOrderId}`),
  getSupplierOrderById: (id: string) => api.get(`/supplier-orders/${id}`),
  generateInvoiceFromOrder: (orderId) => {
    return api.post('/sales-invoices/generate-from-order', { order_id: orderId });
  },
};

// ============================================================
// STOCK
// ============================================================
export const stockService = {
  getProductsStock: () => api.get('/stock/products'),

  getStockMovements: (productId?: string, limit?: number) =>
    api.get('/stock/movements', { params: { product_id: productId, limit } }),

  getReceptionHistory: () =>
    api.get('/stock/reception-history'),

  getProductByBarcode: (barcode: string) =>
    api.get(`/products/barcode/${barcode}`),

  bulkReception: (payload: any) =>
    api.post('/stock/in', payload),

  addIncoming: (payload: any) =>
    api.post('/stock/in', payload),

  getStockByLocation: (location: string) =>
    api.get(`/stock/location/${location}`)
};
// ============================================================
// INVOICES
// ============================================================
export const invoiceService = {
  getAll:       ()              => api.get('/invoices'),
  getById:      (id: string)    => api.get(`/invoices/${id}`),
  getByOrderId: (orderId: string) => api.get(`/invoices/order/${orderId}`),
  downloadPdf:  (id: string)    => api.get(`/invoices/${id}/pdf`, { responseType: 'blob' }),
  sendByEmail:  (id: string, email: string) =>
    api.post(`/invoices/${id}/send`, { email }),
};

// ============================================================
// PURCHASE ORDERS (achats stock magasin)
// ============================================================
export const purchaseOrderService = {
  getPurchaseOrders:       ()             => api.get('/orders/purchase'),
  getPurchaseOrderDetail:  (id: string)   => api.get(`/orders/purchase/${id}`),
  createPurchaseOrder:     (data: any)    => api.post('/orders/purchase', data),
  updatePurchaseOrderStatus:(id: string, status: string) =>
    api.put(`/orders/purchase/${id}/status`, { status }),
  receivePurchaseOrder:    (id: string, data: any) =>
    api.post(`/orders/purchase/${id}/receive`, data),
  deletePurchaseOrder:     (id: string)   => api.delete(`/orders/purchase/${id}`),
  getOrderIssues:          (orderId: string) =>
    api.get(`/orders/purchase/${orderId}/issues`),
  createCreditNote:        (data: any)    =>
    api.post('/orders/purchase/credit-note', data),
  createReplacementDocument:(data: any)   =>
    api.post('/orders/purchase/replacement', data),
  getCreditNotes:          (orderId: string) =>
    api.get(`/orders/purchase/${orderId}/credit-notes`),
  getReplacements:         (orderId: string) =>
    api.get(`/orders/purchase/${orderId}/replacements`),
  getPurchaseOrderEvents:  (orderId: string) =>
    api.get(`/orders/purchase/${orderId}/events`),
  // ✅ CORRECTION : utiliser financial-summary au lieu de summary
  getPurchaseOrderSummary: (orderId: string) =>
    api.get(`/orders/purchase/${orderId}/financial-summary`),
  requestPurchaseCreditNote:(orderId: string, data: any) =>
    api.post(`/orders/purchase/${orderId}/credit-note`, data),
};

// ============================================================
// NOTIFICATIONS
// ============================================================
export const notificationService = {
  getAll:         ()            => api.get('/notifications'),
  markAsRead:     (id: string)  => api.put(`/notifications/${id}/read`),
  markAllAsRead:  ()            => api.put('/notifications/read-all'),
  getUnreadCount: ()            => api.get('/notifications/unread-count'),
  delete:         (id: string)  => api.delete(`/notifications/${id}`),
};

// ============================================================
// REPORTS
// ============================================================
export const reportService = {
  getSalesReport: (startDate: string, endDate: string) =>
    api.get(`/reports/sales?start_date=${startDate}&end_date=${endDate}`),
  getStockReport: () =>
    api.get('/reports/stock', { responseType: 'blob' }),
  getTaxReport:   (year: number, month: number) =>
    api.get(`/reports/tax?year=${year}&month=${month}`),
  exportReport:   (reportType: string, format: 'pdf' | 'excel') =>
    api.get(`/reports/export/${reportType}?format=${format}`, { responseType: 'blob' }),
};

// ============================================================
// DASHBOARD
// ============================================================
export const dashboardService = {
  getKPI:              ()                     => api.get('/dashboard/kpi'),
  getSalesChart:       (days: number = 30)    => api.get(`/dashboard/sales-chart?days=${days}`),
  getTopProducts:      (limit: number = 10)   => api.get(`/dashboard/top-products?limit=${limit}`),
  getRecentActivities: (limit: number = 10)   => api.get(`/dashboard/recent-activities?limit=${limit}`),
};

// ============================================================
// ACCOUNTING SERVICE COMPLET
// ============================================================
export const accountingService = {
  // Plan comptable
  getChartOfAccounts: () =>
    api.get('/accounting/chart-of-accounts'),
  createChartAccount: (data: any) =>
    api.post('/accounting/chart-of-accounts', data),
  updateChartAccount: (id: string, data: any) =>
    api.put(`/accounting/chart-of-accounts/${id}`, data),
  deleteChartAccount: (id: string) =>
    api.delete(`/accounting/chart-of-accounts/${id}`),

  // Dashboard
  getDashboard: () =>
    api.get('/accounting/dashboard'),

  // Revenue
  getRevenue: (startDate: string, endDate: string) =>
    api.get('/accounting/revenue', {
      params: {
        start_date: startDate,
        end_date: endDate
      }
    }),

  // Outstanding invoices
  getOutstanding: () =>
    api.get('/accounting/outstanding'),

  // Journal
  getJournal: (startDate?: string, endDate?: string, limit?: number) =>
    api.get('/accounting/journal', {
      params: {
        start_date: startDate,
        end_date: endDate,
        limit
      }
    }),

  // TVA Declarations
  getTVADeclarations: (year?: number) =>
    api.get('/accounting/tva/declarations', {
      params: { year }
    }),

  getTVADeclarationDetail: (id: number) =>
    api.get(`/accounting/tva/declarations/${id}`),

  generateTVADeclaration: (year: number, quarter: number) =>
    api.post('/accounting/tva/generate', {
      year,
      quarter
    }),

  validateTVADeclaration: (id: number) =>
    api.put(`/accounting/tva/declarations/${id}/validate`),

  // Export PDF
  exportTVADeclaration: (id: number) =>
    api.get(`/accounting/tva-declarations/${id}/export`),

  // Nouvelles méthodes V2 (utilisant les vues unifiées)
  getDashboardV2: () =>
    api.get('/accounting/dashboard/v2'),

  getTVADeclarationV2: (year: number, quarter: number) =>
    api.get(`/accounting/tva/declaration/${year}/${quarter}`),

  getStockAlerts: () =>
    api.get('/accounting/stock/alerts'),

  getSalesChart: (months: number = 12) =>
    api.get(`/accounting/sales/chart?months=${months}`),
};

// ============================================================
// ALERTS
// ============================================================
export const alertsService = {
  getAll:          (unreadOnly = false) =>
    api.get('/alerts', { params: { unread_only: unreadOnly } }),
  getUnreadCount:  ()           => api.get('/alerts/unread/count'),
  markAsRead:      (id: number) => api.put(`/alerts/${id}/read`),
  acknowledgeAlert:(id: number) => api.put(`/alerts/${id}/acknowledge`),
  deleteAlert:     (id: number) => api.delete(`/alerts/${id}`),
  runChecks:       ()           => api.post('/alerts/check'),
};

// ============================================================
// ALIAS de compatibilité (noms utilisés dans App.tsx/composants)
// ============================================================
export const clientsService = clientService;
export const salesService   = saleService;
export const coatingsService = coatingService;

export default api;