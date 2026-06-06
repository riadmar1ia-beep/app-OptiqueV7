// frontend/src/components/SalesOrders/components/OrderDetailModal.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Descriptions, Divider, Table, Tag, Typography, Space, Button, Tabs, Alert, message } from 'antd';
import { ShoppingOutlined, FileTextOutlined, TruckOutlined, CheckCircleOutlined, PrinterOutlined } from '@ant-design/icons';
import { globalOrderService } from '../../../services/api';
import PrintButton from '../../Documents/PrintButton';
import { getStatusTag, getPaymentStatusTag } from '../utils/statusUtils';
import api from '../../../services/api';

const { Text } = Typography;

interface OrderDetailModalProps {
  open: boolean;
  order: any;
  onClose: () => void;
}

// Mapping des traitements
const treatmentNames: Record<string, string> = {
  AR: 'Anti-reflet',
  BLUE: 'Anti-lumière bleue',
  UV: 'Protection UV',
  SCRATCH: 'Anti-rayure',
  FOG: 'Anti-buée',
  PHOTO: 'Photochromique'
};

const OrderDetailModal: React.FC<OrderDetailModalProps> = ({ open, order, onClose }) => {
  const [orderDetailItems, setOrderDetailItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [supplierOrder, setSupplierOrder] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('items');
  
  // États pour la facture
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);

  const deliveredStatuses = ['Livrée', 'livrée', 'delivered', 'completed', 'shipped', 'Delivered', 'Completed'];
  const hasInvoice = order && (
    deliveredStatuses.includes(order.status) ||
    order.status?.toLowerCase().includes('livr') ||
    order.status?.toLowerCase() === 'delivered'
  );

  // Fonction pour formater les items avec séparation des yeux et métadonnées
  const formatOrderItems = useCallback((items: any[]) => {
    const formatted: any[] = [];
    
    for (const item of items) {
      if (item.item_type === 'optical_job' || item.line_type === 'optical_job') {
        let metadata = item.metadata;
        if (metadata && typeof metadata === 'string') {
          try { metadata = JSON.parse(metadata); } catch(e) { metadata = {}; }
        }
        metadata = metadata || {};

        const eye = metadata.eye || 'both';
        // Détecter format : nouveau (right_eye.prescription) ou ancien (lens_config + prescription)
        const hasNewFormat = !!(metadata.right_eye || metadata.left_eye);

        const buildFromEyeData = (eyeData: any, mountingData: any, eyeLabel: string) => ({
          ...item,
          id: `${item.id}-${eyeLabel}`,
          item_type: 'lens',
          eye_label: eyeLabel,
          description: eyeData
            ? `${eyeData.type || ''} | ${eyeData.index || ''} | ${eyeData.material || ''}`
            : item.description,
          lens_details: eyeData ? {
            type:            eyeData.type,
            index:           eyeData.index,
            material:        eyeData.material,
            coatings:        eyeData.coatings        || [],
            coatings_detail: eyeData.coatings_detail || [],
            tint:            eyeData.tint            || {},
          } : {},
          prescription: eyeData?.prescription || null,
          mounting:     mountingData || {},
          quantity:     1,
          unit_price_cents: item.unit_price_cents,
          total_cents:      item.total_cents,
        });

        const buildFromLegacy = (eyeLabel: string) => {
          const lensConfig   = metadata.lens_config   || {};
          const prescription = metadata.prescription  || null;
          const mountingData = metadata.mounting      || {};
          return {
            ...item,
            id: `${item.id}-${eyeLabel}`,
            item_type: 'lens',
            eye_label: eyeLabel,
            description: `${lensConfig.type || ''} | ${lensConfig.index || ''} | ${lensConfig.material || ''}`,
            lens_details: {
              type:     lensConfig.type,
              index:    lensConfig.index,
              material: lensConfig.material,
              coatings: lensConfig.coatings || [],
              tint:     lensConfig.tint     || {},
            },
            prescription,
            mounting: mountingData,
            quantity: 1,
            unit_price_cents: item.unit_price_cents,
            total_cents:      item.total_cents,
          };
        };

        if (hasNewFormat) {
          if (eye === 'OD' || eye === 'right') {
            formatted.push(buildFromEyeData(metadata.right_eye, metadata.mounting, 'OD'));
          } else if (eye === 'OG' || eye === 'left') {
            formatted.push(buildFromEyeData(metadata.left_eye, metadata.mounting, 'OG'));
          } else {
            // both
            if (metadata.right_eye) formatted.push(buildFromEyeData(metadata.right_eye, metadata.mounting, 'OD'));
            if (metadata.left_eye)  formatted.push(buildFromEyeData(metadata.left_eye,  metadata.mounting, 'OG'));
          }
        } else {
          if (eye === 'both') {
            formatted.push(buildFromLegacy('OD'));
            formatted.push(buildFromLegacy('OG'));
          } else {
            formatted.push(buildFromLegacy(eye === 'OD' ? 'OD' : 'OG'));
          }
        }
      } else {
        formatted.push({
          ...item,
          item_type: item.item_type || item.line_type || 'product',
          eye_label: null,
          lens_details: null,
          prescription: null,
          mounting: null,
        });
      }
    }
    return formatted;
  }, []);

  const fetchOrderDetails = useCallback(async () => {
    if (!order) return;
    setLoading(true);
    try {
      const response = await globalOrderService.getOpticalById(order.id);
      const items = response.data.data.items || [];
      console.log('📦 Items bruts:', items);
      
      const formattedItems = formatOrderItems(items);
      console.log('✅ Items formatés:', formattedItems.length);
      setOrderDetailItems(formattedItems);
    } catch (error) {
      console.error('Erreur chargement détails:', error);
    } finally {
      setLoading(false);
    }
  }, [order, formatOrderItems]);

  const fetchSupplierOrder = useCallback(async () => {
    try {
      const response = await globalOrderService.getSupplierOrdersBySalesOrder(order?.id);
      if (response.data?.data?.length > 0) {
        setSupplierOrder(response.data.data[0]);
      }
    } catch (error) {
      console.error('Erreur chargement commande fournisseur:', error);
    }
  }, [order]);

  // Construire les données de facture
  const buildInvoiceDataFromOrder = useCallback((invoiceNumber: string) => {
  if (!orderDetailItems || orderDetailItems.length === 0) {
    console.warn('⚠️ Aucun item trouvé pour la facture');
    return false;
  }
  
  // ============================================
  // Récupérer les verres avec leurs métadonnées
  // ============================================
  const lensItems = orderDetailItems.filter((item: any) => 
    item.item_type === 'lens' || item.item_type === 'optical_job'
  );
  
  let right_eye = null;
  let left_eye = null;
  
  for (const item of lensItems) {
    const metadata = item.metadata || {};
    const lensConfig = metadata.lens_config || {};
    const coatings = lensConfig.coatings || item.lens_details?.coatings || [];
    const tint = lensConfig.tint || item.lens_details?.tint || { color: 'none', gradient: false, intensity: 0 };
    
    const eyeData = {
      type: lensConfig.type || item.lens_details?.type,
      index: lensConfig.index || item.lens_details?.index,
      material: lensConfig.material || item.lens_details?.material,
      coatings: coatings,
      tint: tint
    };
    
    if (item.eye_label === 'OD') right_eye = eyeData;
    if (item.eye_label === 'OG') left_eye = eyeData;
  }
  
  // ============================================
  // Calculer les totaux
  // ============================================
  let totalHT = 0;
  const invoiceItems: any[] = [];
  
  orderDetailItems.forEach((item: any) => {
    const quantity = item.quantity || 1;
    let priceHT = 0;
    if (item.unit_price_cents) {
      priceHT = item.unit_price_cents / 100;
    } else if (item.unit_price) {
      priceHT = item.unit_price;
    } else if (item.price) {
      priceHT = item.price;
    }
    
    const totalItemHT = priceHT * quantity;
    totalHT += totalItemHT;
    
    invoiceItems.push({
      reference: item.item_type === 'lens' ? 'VERRE' : (item.product_reference || item.reference || 'REF'),
      description: item.description || item.name || 'Article',
      quantity: quantity,
      unit_price: priceHT,
      total: totalItemHT
    });
  });
  
  // ============================================
  // Mettre à jour le state avec les verres
  // ============================================
  setInvoiceData({
    number: invoiceNumber,
    date: new Date(order.created_at).toLocaleDateString('fr-FR'),
    client_name: order.customer_name,
    client_address: order.customer_address || '',
    client_phone: order.customer_phone || '',
    client_email: order.customer_email || '',
    items: invoiceItems,
    right_eye: right_eye,    // ← AJOUT
    left_eye: left_eye,      // ← AJOUT
    subtotal: totalHT,
    tax_rate: 20,
    tax_amount: totalHT * 0.2,
    total: totalHT * 1.2,
    payment_method: order.payment_method || 'Espèces',
    notes: ''
  });
  
  return true;
}, [order, orderDetailItems]);

  // Fallback: générer un numéro via localStorage
  const buildInvoiceDataFromLocalStorage = useCallback(() => {
    if (!orderDetailItems || orderDetailItems.length === 0) {
      console.warn('⚠️ Pas d’items → facture impossible');
      return;
    }
    
    let totalHT = 0;
    const invoiceItems: any[] = [];
    orderDetailItems.forEach((item: any) => {
      const quantity = item.quantity || 1;
      let priceHT = 0;
      if (item.unit_price_cents) {
        priceHT = item.unit_price_cents / 100;
      } else if (item.unit_price) {
        priceHT = item.unit_price;
      }
      const totalItemHT = priceHT * quantity;
      totalHT += totalItemHT;
      invoiceItems.push({
        reference: item.item_type === 'lens' ? 'VERRE' : (item.product_reference || 'REF'),
        description: item.description || item.name || '',
        quantity: quantity,
        unit_price: priceHT,
        total: totalItemHT
      });
    });

    const storageKey = `invoice_number_${order.id}`;
    let invoiceNumber = localStorage.getItem(storageKey);
    
    if (!invoiceNumber) {
      const year = new Date().getFullYear();
      const lastKey = `last_invoice_sequence_${year}`;
      let lastSeq = parseInt(localStorage.getItem(lastKey) || '0');
      const nextSeq = lastSeq + 1;
      const sequentialNumber = nextSeq.toString().padStart(5, '0');
      invoiceNumber = `FAC-${year}-${sequentialNumber}`;
      
      localStorage.setItem(lastKey, nextSeq.toString());
      localStorage.setItem(storageKey, invoiceNumber);
    }
    
    setInvoiceData({
      number: invoiceNumber,
      date: new Date(order.created_at).toLocaleDateString('fr-FR'),
      client_name: order.customer_name,
      client_address: '',
      client_phone: order.customer_phone || '',
      client_email: order.customer_email || '',
      items: invoiceItems,
      subtotal: totalHT,
      tax_rate: 20,
      tax_amount: totalHT * 0.2,
      total: totalHT * 1.2,
      payment_method: order.payment_method || 'Espèces',
      notes: ''
    });
  }, [order, orderDetailItems]);

  // Charger ou générer la facture
  const loadOrGenerateInvoice = useCallback(async () => {
    if (isGeneratingInvoice) return;
    if (invoiceData) return;
    if (!order) return;
    if (!orderDetailItems || orderDetailItems.length === 0) {
      message.warning('Chargement des articles en cours...');
      return;
    }
    
    if (order.invoice_number) {
      buildInvoiceDataFromOrder(order.invoice_number);
      return;
    }
    
    setIsGeneratingInvoice(true);
    try {
      const response = await api.post('/sales-invoices/generate-from-order', { 
        order_id: order.id 
      });
      
      const result = response.data;
      
      if (result.success) {
        order.invoice_number = result.invoice_number;
        buildInvoiceDataFromOrder(result.invoice_number);
        message.success(`Facture ${result.invoice_number} générée avec succès`);
      } else {
        message.error('Erreur lors de la génération de la facture');
        buildInvoiceDataFromLocalStorage();
      }
    } catch (error: any) {
      console.error('❌ Erreur génération:', error);
      message.warning('Utilisation du mode local');
      buildInvoiceDataFromLocalStorage();
    } finally {
      setIsGeneratingInvoice(false);
    }
  }, [order, invoiceData, isGeneratingInvoice, orderDetailItems, buildInvoiceDataFromOrder, buildInvoiceDataFromLocalStorage]);

  // Chargement initial
  useEffect(() => {
    if (open && order) {
      setInvoiceData(null);
      fetchOrderDetails();
      fetchSupplierOrder();
    }
  }, [open, order, fetchOrderDetails, fetchSupplierOrder]);

  // Déclencher la génération de facture
  useEffect(() => {
    if (open && hasInvoice && orderDetailItems.length > 0 && !invoiceData && !isGeneratingInvoice) {
      loadOrGenerateInvoice();
    }
  }, [open, hasInvoice, orderDetailItems, invoiceData, isGeneratingInvoice, loadOrGenerateInvoice]);

  // Colonnes du tableau
  const columns = [
    {
      title: 'Type',
      dataIndex: 'item_type',
      key: 'item_type',
      width: 100,
      render: (type: string) => {
        const typeMap: any = {
          frame: { color: 'blue', label: '🕶️ Monture' },
          lens: { color: 'green', label: '👓 Verres' },
          optical_job: { color: 'green', label: '👓 Verres' },
          accessory: { color: 'orange', label: '🔧 Accessoire' }
        };
        const t = typeMap[type] || { color: 'default', label: type };
        return <Tag color={t.color}>{t.label}</Tag>;
      }
    },
    {
      title: 'Œil',
      dataIndex: 'eye_label',
      key: 'eye_label',
      width: 60,
      render: (v: string) => v ? <Tag color="blue">{v}</Tag> : <Text type="secondary">-</Text>
    },

 {
  title: 'Détails prescription',
  key: 'prescription_details',
  width: 250,
  render: (_: any, record: any) => {
    if (record.item_type !== 'lens') return <Text type="secondary">-</Text>;
    
    const p = record.prescription;
    
    // Aucune prescription si null ou tous les champs sont null/undefined
    if (!p || (p.sphere == null && p.cylinder == null && p.axis == null && p.addition == null)) {
      return <Text type="secondary">Aucune prescription</Text>;
    }

    const fmt = (v: any) => {
      const n = Number(v);
      return isNaN(n) ? null : (n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2));
    };

    return (
      <div style={{ fontSize: 12 }}>
        {p.sphere   != null && <div><Text strong>SPH:</Text> {fmt(p.sphere)}</div>}
        {p.cylinder != null && <div><Text strong>CYL:</Text> {fmt(p.cylinder)}</div>}
        {p.axis     != null && <div><Text strong>AXE:</Text> {Number(p.axis)}°</div>}
        {p.addition != null && <div><Text strong>ADD:</Text> +{Number(p.addition).toFixed(2)}</div>}
        {p.prism    != null && p.prism !== 0 && (
          <div><Text strong>Prisme:</Text> {p.prism} Δ</div>
        )}
        {p.prism_base && (
          <div><Text strong>Base:</Text> {
            p.prism_base === 'up' ? 'Haut' : p.prism_base === 'down' ? 'Bas' :
            p.prism_base === 'in' ? 'Interne' : 'Externe'
          }</div>
        )}
      </div>
    );
  }
},
{
  title: 'Détails verres',
  key: 'lens_details',
  width: 280,
  render: (_: any, record: any) => {
    if (record.item_type !== 'lens') {
      return <Text type="secondary">-</Text>;
    }
    
    // ✅ Récupérer les données de la bonne source
    const lens = record.lens_details || {};  // Pour les infos de base
    const metadata = record.metadata || {};   // Pour la teinte et plus
    
    // ✅ Extraire la teinte depuis metadata (bon endroit)
    const tint = metadata.lens_config?.tint || 
                 metadata.right_eye?.tint || 
                 metadata.left_eye?.tint || 
                 metadata.tint || 
                 {};
    
    // ✅ Extraire les traitements depuis metadata
    const coatings = metadata.lens_config?.coatings || 
                     metadata.right_eye?.coatings || 
                     metadata.left_eye?.coatings || 
                     metadata.coatings || 
                     [];
    
    return (
      <div style={{ fontSize: 12 }}>
        <div><Text strong>Type:</Text> {lens.type || metadata.lens_config?.type || '-'}</div>
        <div><Text strong>Indice:</Text> {lens.index || metadata.lens_config?.index || '-'}</div>
        <div><Text strong>Matériau:</Text> {lens.material || metadata.lens_config?.material || '-'}</div>
        
        {/* ✅ Affichage de la teinte */}
        {tint.color && tint.color !== 'none' && (
          <div style={{ marginTop: 4 }}>
            <Text strong>Teinte:</Text>
            <Tag color="cyan" style={{ marginLeft: 8 }}>
              {tint.color === 'gray' ? 'Gris' : 
               tint.color === 'brown' ? 'Brun' : 
               tint.color === 'green' ? 'Vert' : tint.color}
              {tint.gradient && ' dégradé'}
              {tint.intensity > 0 && ` (${tint.intensity}%)`}
            </Tag>
          </div>
        )}
        
        {/* ✅ Affichage des traitements */}
        {coatings.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <Text strong>Traitements:</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {coatings.map((c: string) => (
                <Tag key={c} color="purple" style={{ fontSize: 10 }}>
                  {treatmentNames[c] || c}
                </Tag>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
},
    {
      title: 'Paramètres montage',
      key: 'mounting_details',
      width: 180,
      render: (_: any, record: any) => {
        if (record.item_type !== 'lens') {
          return <Text type="secondary">-</Text>;
        }
        
        const mounting = record.mounting || {};
        
        if (!mounting.pupillary_distance && !mounting.mounting_height && !mounting.vertex_distance) {
          return <Text type="secondary">-</Text>;
        }
        
        return (
          <div style={{ fontSize: 12 }}>
            {mounting.pupillary_distance > 0 && <div><Text strong>PD:</Text> {mounting.pupillary_distance} mm</div>}
            {mounting.mounting_height > 0 && <div><Text strong>Hauteur:</Text> {mounting.mounting_height} mm</div>}
            {mounting.vertex_distance > 0 && <div><Text strong>VD:</Text> {mounting.vertex_distance} mm</div>}
            {mounting.pantoscopic_angle !== 0 && <div><Text strong>Angle:</Text> {mounting.pantoscopic_angle}°</div>}
            {mounting.frame_wrap !== 0 && <div><Text strong>Galbe:</Text> {mounting.frame_wrap}°</div>}
          </div>
        );
      }
    },
    {
      title: 'Qté',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 60,
      align: 'center' as const,
    },
    {
      title: 'Prix HT',
      key: 'unit_price',
      width: 100,
      align: 'right' as const,
      render: (_: any, r: any) => `${((r.unit_price_cents || 0) / 100).toFixed(2)} DH`
    },
    {
      title: 'Total HT',
      key: 'total',
      width: 100,
      align: 'right' as const,
      render: (_: any, r: any) => `${((r.total_cents || 0) / 100).toFixed(2)} DH`
    }
  ];

  // Données pour le devis
  // Dans OrderDetailModal.tsx
const getQuoteData = () => {
  // Récupérer les verres avec leurs métadonnées
  const lensItems = orderDetailItems.filter((item: any) => 
    item.item_type === 'lens' || item.item_type === 'optical_job'
  );
  
  let right_eye = null;
  let left_eye = null;
  
  for (const item of lensItems) {
    const metadata = item.metadata || {};
    const lensConfig = metadata.lens_config || {};
    const coatings = lensConfig.coatings || item.lens_details?.coatings || [];
    const tint = lensConfig.tint || item.lens_details?.tint || { color: 'none', gradient: false, intensity: 0 };
    
    const eyeData = {
      type: lensConfig.type || item.lens_details?.type,
      index: lensConfig.index || item.lens_details?.index,
      material: lensConfig.material || item.lens_details?.material,
      coatings: coatings,
      tint: tint
    };
    
    if (item.eye_label === 'OD') right_eye = eyeData;
    if (item.eye_label === 'OG') left_eye = eyeData;
  }
  
  let totalHT = 0;
  const quoteItems: any[] = [];
  
  orderDetailItems.forEach((item: any) => {
    const quantity = item.quantity || 1;
    const priceHT = (item.unit_price_cents || 0) / 100;
    const totalItemHT = priceHT * quantity;
    totalHT += totalItemHT;
    
    quoteItems.push({
      reference: item.item_type === 'lens' ? 'VERRE' : (item.product_reference || 'REF'),
      description: item.description || item.name || '',
      quantity: quantity,
      unit_price: priceHT,
      total: totalItemHT
    });
  });
  
  return {
    number: order.order_number,
    date: new Date(order.created_at).toLocaleDateString('fr-FR'),
    valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR'),
    client_name: order.customer_name,
    client_address: '',
    client_phone: order.customer_phone || '',
    client_email: order.customer_email || '',
    items: quoteItems,
    right_eye: right_eye,    // ← AJOUTER
    left_eye: left_eye,      // ← AJOUTER
    subtotal: totalHT,
    tax_rate: 20,
    tax_amount: totalHT * 0.2,
    total: totalHT * 1.2,
    notes: 'Devis valable 30 jours - Sous réserve d\'acceptation'
  };
};

  // Données pour le bon de commande fournisseur
  // Dans OrderDetailModal.tsx
const getLabOrderData = () => {
  const lensItems = orderDetailItems.filter((item: any) => 
    item.item_type === 'lens' || item.item_type === 'optical_job'
  );
  
  let right_eye = null;
  let left_eye = null;
  let mounting = null;
  
  for (const item of lensItems) {
    // Récupérer les métadonnées depuis l'item
    const metadata = item.metadata || {};
    const lensConfig = metadata.lens_config || {};
    const prescription = item.prescription || metadata.prescription || {};
    const tint = lensConfig.tint || metadata.tint || { color: 'none', gradient: false, intensity: 0 };
    
    // Construire l'objet eyeData complet avec TOUTES les informations
    const eyeData = {
      type: lensConfig.type || item.lens_details?.type,
      index: lensConfig.index || item.lens_details?.index,
      material: lensConfig.material || item.lens_details?.material,
      coatings: lensConfig.coatings || item.lens_details?.coatings || [],
      coatings_detail: lensConfig.coatings_detail || item.lens_details?.coatings_detail || [],
      tint: tint,
      prescription: {
        sphere: prescription.sphere ?? 0,
        cylinder: prescription.cylinder ?? 0,
        axis: prescription.axis ?? null,
        addition: prescription.addition ?? null,
        prism: prescription.prism ?? null,
        prism_base: prescription.prism_base ?? null
      }
    };
    
    if (item.eye_label === 'OD') {
      right_eye = eyeData;
    }
    if (item.eye_label === 'OG') {
      left_eye = eyeData;
    }
    
    // Récupérer les paramètres de montage
    const itemMounting = metadata.mounting || item.mounting;
    if (itemMounting && !mounting) {
      mounting = {
        pupillary_distance: itemMounting.pupillary_distance || 0,
        mounting_height: itemMounting.mounting_height || 0,
        vertex_distance: itemMounting.vertex_distance || 12,
        pantoscopic_angle: itemMounting.pantoscopic_angle || 0,
        frame_wrap: itemMounting.frame_wrap || 0
      };
    }
  }
  
  console.log('📦 LAB ORDER DATA ENVOYÉ:', JSON.stringify({ right_eye, left_eye, mounting }, null, 2));
  
  return {
    order_number: order.order_number,
    date: new Date(order.created_at).toLocaleDateString('fr-FR'),
    client_name: order.customer_name,
    right_eye: right_eye,
    left_eye: left_eye,
    mounting: mounting,
    supplier_name: supplierOrder?.supplier_name || 'Laboratoire externe',
    notes: order.notes
  };
};

  const tabItems = [
    {
      key: 'items',
      label: <Space><ShoppingOutlined />Articles</Space>,
      children: (
        <Table
          dataSource={orderDetailItems}
          rowKey="id"
          pagination={false}
          size="small"
          columns={columns}
          loading={loading}
          scroll={{ x: 1200 }}
        />
      )
    }
  ];

  // Ajouter l'onglet "Documents" si disponible
  const hasQuoteDoc = order?.status === 'draft' || order?.status === 'pending';
  const hasLabOrderDoc = order?.status === 'pending' && supplierOrder;

  if (hasQuoteDoc || hasLabOrderDoc || hasInvoice) {
    tabItems.push({
      key: 'documents',
      label: <Space><FileTextOutlined />Documents</Space>,
      children: (
        <div>
          <Alert
            title="Documents disponibles"
            description={
              <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
                {hasQuoteDoc && <li>📄 Devis client - Disponible dès la création</li>}
                {hasLabOrderDoc && <li>🏭 Bon de commande fournisseur - Disponible après confirmation</li>}
                {hasInvoice && <li>💰 Facture finale - Disponible après livraison</li>}
              </ul>
            }
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {hasQuoteDoc && (
              <PrintButton
                type="quote"
                data={getQuoteData()}
                buttonText="📄 Devis client"
                buttonType="default"
              />
            )}
            
            {hasLabOrderDoc && (
              <PrintButton
                type="lab_order"
                data={getLabOrderData()}
                buttonText="🏭 Bon fournisseur"
                buttonType="default"
              />
            )}
            
            {hasInvoice && (
              <>
                {invoiceData ? (
                  <PrintButton
                    type="invoice"
                    data={invoiceData}
                    buttonText="💰 Facture finale"
                    buttonType="primary"
                  />
                ) : (
                  <Button 
                    type="primary" 
                    onClick={loadOrGenerateInvoice}
                    loading={isGeneratingInvoice}
                    icon={<PrinterOutlined />}
                    disabled={orderDetailItems.length === 0}
                  >
                    {isGeneratingInvoice 
                      ? "Génération en cours..." 
                      : orderDetailItems.length === 0 
                        ? "Chargement des articles..." 
                        : "💰 Générer la facture"
                    }
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )
    });
  }

  // Ajouter l'onglet "Suivi" si commande fournisseur existe
  if (supplierOrder) {
    tabItems.push({
      key: 'tracking',
      label: <Space><TruckOutlined />Suivi fournisseur</Space>,
      children: (
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="N° commande fournisseur">{supplierOrder.order_id || '-'}</Descriptions.Item>
          <Descriptions.Item label="Fournisseur">{supplierOrder.supplier_name || '-'}</Descriptions.Item>
          <Descriptions.Item label="Statut">{supplierOrder.logistic_status || 'En attente'}</Descriptions.Item>
          <Descriptions.Item label="Date création">{new Date(supplierOrder.created_at).toLocaleDateString()}</Descriptions.Item>
          {supplierOrder.sent_at && <Descriptions.Item label="Date envoi">{new Date(supplierOrder.sent_at).toLocaleDateString()}</Descriptions.Item>}
          {supplierOrder.received_at && <Descriptions.Item label="Date réception">{new Date(supplierOrder.received_at).toLocaleDateString()}</Descriptions.Item>}
        </Descriptions>
      )
    });
  }

  if (!order) return null;

  return (
    <Modal
      title={
        <Space>
          <ShoppingOutlined />
          Détails de la commande {order.order_number}
          {order.status === 'delivered' && <Tag color="green" icon={<CheckCircleOutlined />}>Livrée</Tag>}
          {order.status === 'pending' && <Tag color="blue" icon={<TruckOutlined />}>En attente fournisseur</Tag>}
          {order.status === 'draft' && <Tag color="default">Brouillon</Tag>}
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Fermer</Button>}
      width={1400}
    >
      <Descriptions bordered size="small" column={2}>
        <Descriptions.Item label="Client">{order.customer_name}</Descriptions.Item>
        <Descriptions.Item label="Téléphone">{order.customer_phone}</Descriptions.Item>
        <Descriptions.Item label="Email">{order.customer_email || '-'}</Descriptions.Item>
        <Descriptions.Item label="Statut">{getStatusTag(order.status)}</Descriptions.Item>
        <Descriptions.Item label="Paiement">{getPaymentStatusTag(order.payment_status)}</Descriptions.Item>
        <Descriptions.Item label="Date">{new Date(order.created_at).toLocaleString()}</Descriptions.Item>
      </Descriptions>

      <Divider />

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
    </Modal>
  );
};

export default OrderDetailModal;