import React, { useState, useEffect } from 'react';
import {
  Modal, Form, Card, Select, Descriptions, Button, Tag, Row, Col,
  InputNumber, Alert, Divider, Space, Typography, message, Popconfirm
} from 'antd';

import { EyeOutlined, DeleteOutlined, PlusOutlined, WarningOutlined } from '@ant-design/icons';
import { clientService, productService, globalOrderService } from '../../../services/api';
import LensOrderFormEmbedded from '../../Lenses/LensOrderFormEmbedded';
import axios from 'axios';
import { pdf } from '@react-pdf/renderer';

const { Option } = Select;
const { Text, Title } = Typography;

interface OrderItem {
  id?: string;
  type: 'frame' | 'lens' | 'accessory';
  product_id?: string | null;
  description: string;
  quantity: number;
  max_quantity?: number;
  unit_price_cents: number;
  total_cents: number;
  tva_rate: number;
  tax_amount_cents: number;
  total_ttc_cents: number;
  metadata?: any;
}

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  insurance_rate?: number;
  insurance_company?: string;
}

interface Product {
  id: string;
  reference: string;
  name: string;
  price_cents: number;
  tva_rate: number;
  description: string;
  stock_quantity?: number;
  reserved_quantity?: number;
  min_stock?: number;
  type?: string;
  category?: string;
  frame_color?: string;
  frame_type?: string;
  frame_brand?: string;
  frame_model?: string;
  accessory_type?: string;
  consumable?: boolean;
  supplier_id?: string;
  location?: string;
  purchase_price_cents?: number;
  is_active?: boolean;
  is_featured?: boolean;
  gender?: string;
  shape?: string;
  material?: string;
  size_code?: string;
  lens_width?: number;
  bridge_width?: number;
  temple_length?: number;
  lens_height?: number;
  base_curve?: string;
  rim_type?: string;
  compatible_with?: string;
}

interface NewOrderModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const NewOrderModal: React.FC<NewOrderModalProps> = ({ open, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchResults, setSearchResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [hasValidPrescription, setHasValidPrescription] = useState(false);
  const [lensModalVisible, setLensModalVisible] = useState(false);
  const [activePrescription, setActivePrescription] = useState<any>(null);
  const [pendingClientChange, setPendingClientChange] = useState<string | null>(null); // client à changer si panier non vide

  // Charger les clients et produits au montage
  useEffect(() => {
    if (open) {
     console.log('🟢 Modal ouvert - Chargement des données...');
      fetchClients();
      fetchProducts();
    }
  }, [open]);


useEffect(() => {
  console.log('📦 products state mis à jour:', products.length);
}, [products]);

const fetchClients = async () => {
  try {
    console.log('🔄 Chargement des clients...');
    const response = await clientService.getAll();
    console.log('📡 Réponse API:', response);
    console.log('📋 Clients reçus:', response.data.data);
    console.log('📊 Nombre de clients:', response.data.data.length);
    setClients(response.data.data);
  } catch (error) {
    console.error('❌ Erreur chargement clients:', error);
    message.error('Erreur lors du chargement des clients');
  }
};

const fetchProducts = async () => {
  try {
    const token = localStorage.getItem('accessToken');
    const response = await fetch('http://localhost:3001/api/products', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Tenant-Id': 'default-shop'
      }
    });
    const data = await response.json();
    console.log('📦 Produits chargés (fetch):', data.data.length);
    setProducts(data.data);
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
};

  // Recalcul automatique des totaux
  useEffect(() => {
    const updatedItems = orderItems.map(item => ({
      ...item,
      total_cents: item.unit_price_cents * item.quantity,
      tax_amount_cents: Math.round((item.unit_price_cents * item.quantity) * (item.tva_rate / 100)),
      total_ttc_cents: Math.round((item.unit_price_cents * item.quantity) * (1 + item.tva_rate / 100))
    }));
    
    if (JSON.stringify(updatedItems) !== JSON.stringify(orderItems)) {
      setOrderItems(updatedItems);
    }
  }, [orderItems.map(i => `${i.unit_price_cents}-${i.quantity}-${i.tva_rate}`).join()]);

const handleClientSearch = (value: string) => {
  console.log('🔍 Recherche:', value);
  
  if (!value || value.length < 2) {
    setSearchResults([]);
    return;
  }
  
  const searchTerm = value.toLowerCase().trim();
  
  const results = clients.filter(client => {
    const fullName = `${client.first_name || ''} ${client.last_name || ''}`.toLowerCase();
    const firstName = (client.first_name || '').toLowerCase();
    const lastName = (client.last_name || '').toLowerCase();
    const phone = (client.phone || '').toLowerCase();
    const email = (client.email || '').toLowerCase();
    
    return fullName.includes(searchTerm) ||
           firstName.includes(searchTerm) ||
           lastName.includes(searchTerm) ||
           phone.includes(searchTerm) ||
           email.includes(searchTerm);
  });
  
  console.log('📋 Résultats trouvés:', results.length);
  setSearchResults(results.slice(0, 10));
};

  const applyClientSelection = async (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    setSelectedClient(client);
    setActivePrescription(null);
    setHasValidPrescription(false);
    try {
      const response = await clientService.getPrescriptions(client.id);
      const prescriptions = response.data.data || [];
      const validPrescriptions = prescriptions
        .filter((p: any) => new Date(p.expiry_date) > new Date())
        .sort((a: any, b: any) => new Date(b.date_of_issue).getTime() - new Date(a.date_of_issue).getTime());
      
      if (validPrescriptions.length > 0) {
        const latest = validPrescriptions[0];
        setActivePrescription(latest);
        setHasValidPrescription(true);
        message.success(`✅ Ordonnance valide chargée — Dr. ${latest.doctor_name || 'inconnu'}`);
      } else {
        setHasValidPrescription(false);
        message.warning(`⚠️ Aucune ordonnance valide pour ${client.first_name} ${client.last_name}`);
      }
    } catch (error) {
      setHasValidPrescription(false);
    }
  };

  const handleClientSelect = async (value: string) => {
    // Si panier non vide → demander confirmation avant de changer
    if (orderItems.length > 0) {
      setPendingClientChange(value);
      return; // la Modal de confirmation prendra le relais
    }
    await applyClientSelection(value);
  };

  const handleConfirmClientChange = async () => {
    if (!pendingClientChange) return;
    setOrderItems([]);
    await applyClientSelection(pendingClientChange);
    setPendingClientChange(null);
    message.info('Panier vidé — nouveau client sélectionné');
  };

  const checkPrescription = async () => {
    if (!selectedClient) return;
    try {
      const response = await clientService.getPrescriptions(selectedClient.id);
      const prescriptions = response.data.data;
      const hasValid = prescriptions.some((p: any) => new Date(p.expiry_date) > new Date());
      setHasValidPrescription(hasValid);
      message.success(hasValid ? '✅ Ordonnance valide trouvée' : '⚠️ Aucune ordonnance valide');
    } catch (error) {
      message.error('Erreur vérification ordonnance');
    }
  };

  const addOrderItem = (type: 'frame' | 'accessory') => {
    setOrderItems([...orderItems, {
      type: type,
      product_id: null,
      description: '',
      quantity: 1,
      max_quantity: 0,
      unit_price_cents: 0,
      total_cents: 0,
      tax_amount_cents: 0,
      total_ttc_cents: 0,
      tva_rate: 20
    }]);
  };

const addLensToOrder = (lensData: any) => {
  console.log('📦 Données reçues du formulaire:', lensData);
  console.log('🔍 Prescription OD:', lensData.right_eye?.prescription);
  console.log('🔍 Prescription OG:', lensData.left_eye?.prescription);
  console.log('🔍 Montage:', lensData.mounting);
  
  const totalCents = lensData.total_price_cents || 0;
  const purchaseCents = lensData.total_purchase_price_cents || 0;

  const odPriceCents = lensData.right_eye?.price
    ? Math.round(Number(lensData.right_eye.price) * 100)
    : Math.round(totalCents / 2);

  const ogPriceCents = lensData.left_eye?.price
    ? Math.round(Number(lensData.left_eye.price) * 100)
    : totalCents - Math.round(totalCents / 2);

  const newItems: OrderItem[] = [];

  // ✅ IMPORTANT: récupérer mounting depuis lensData
  const mounting = lensData.mounting || {};

  if (lensData.right_eye) {
    const od = lensData.right_eye;
    newItems.push({
      type: 'lens',
      product_id: null,
      description: `${od.type || ''} | ${od.index || ''} | ${od.material || ''}`,
      quantity: 1,
      unit_price_cents: odPriceCents,
      total_cents: odPriceCents,
      tax_amount_cents: Math.round(odPriceCents * 0.2),
      total_ttc_cents: Math.round(odPriceCents * 1.2),
      tva_rate: 20,
      metadata: {
        eye: 'OD',
        lens_config: {
          type: od.type,
          index: od.index,
          material: od.material,
          coatings: od.coatings || [],
          tint: od.tint || { color: 'none', gradient: false, intensity: 0 }
        },
        prescription: od.prescription || {  // ← Valeurs par défaut si null
          sphere: 0,
          cylinder: 0,
          axis: null,
          addition: null
        },
        mounting: mounting,
        purchase_price_cents: Math.round(purchaseCents / 2),
      }
    });
  }

  if (lensData.left_eye) {
    const og = lensData.left_eye;
    newItems.push({
      type: 'lens',
      product_id: null,
      description: `${og.type || ''} | ${og.index || ''} | ${og.material || ''}`,
      quantity: 1,
      unit_price_cents: ogPriceCents,
      total_cents: ogPriceCents,
      tax_amount_cents: Math.round(ogPriceCents * 0.2),
      total_ttc_cents: Math.round(ogPriceCents * 1.2),
      tva_rate: 20,
      metadata: {
        eye: 'OG',
        lens_config: {
          type: og.type,
          index: og.index,
          material: og.material,
          coatings: og.coatings || [],
          tint: og.tint || { color: 'none', gradient: false, intensity: 0 }
        },
        prescription: og.prescription || {
          sphere: 0,
          cylinder: 0,
          axis: null,
          addition: null
        },
        mounting: mounting,
        purchase_price_cents: purchaseCents - Math.round(purchaseCents / 2),
      }
    });
  }

  setOrderItems([...orderItems, ...newItems]);
  setLensModalVisible(false);
  message.success('Verres ajoutés à la commande');
};

 const updateOrderItem = (index: number, field: string, value: any) => {
  const newItems = [...orderItems];
  const item = newItems[index];
  
  switch (field) {
    case 'type':
      item.type = value;
      item.product_id = null;
      item.description = '';
      item.unit_price_cents = 0;
      break;
      
    case 'product_id':
      item.product_id = value;
      const product = products.find(p => p.id === value);
      if (product) {
        item.unit_price_cents = product.price_cents;
        item.description = product.name;
        item.tva_rate = product.tva_rate || 20;
        
        // ✅ Récupérer le stock disponible pour ce produit
        const stockDispo = getStockDisponible(product);
        item.max_quantity = stockDispo;  // Stocker la limite
        
        // ✅ Si la quantité actuelle dépasse le stock, ajuster
        if (item.quantity > stockDispo) {
          item.quantity = stockDispo;
          message.warning(`Stock limité à ${stockDispo} pour ${product.name}`);
        }
      }
      break;
      
    case 'quantity':
      const newQuantity = value;
      const currentProduct = products.find(p => p.id === item.product_id);
      if (currentProduct) {
        const maxStock = getStockDisponible(currentProduct);
        if (newQuantity > maxStock) {
          message.error(`Stock insuffisant. Maximum disponible: ${maxStock}`);
          return;  // Ne pas mettre à jour
        }
      }
      item.quantity = newQuantity;
      break;
      
    case 'unit_price_cents':
      item.unit_price_cents = value;
      break;
      
    case 'tva_rate':
      item.tva_rate = value;
      break;
  }
  
  setOrderItems(newItems);
};

const removeOrderItem = (index: number) => {
  setOrderItems(orderItems.filter((_, i) => i !== index));
  message.info('Article supprimé du panier');
};


// ============================================================
// GESTION DU STOCK (basé sur la structure de la table products)
// ============================================================

// Obtenir le stock disponible (physique - réservé)
const getStockDisponible = (product: any): number => {
  const physical = Number(product.stock_quantity) || 0;
  const reserved = Number(product.reserved_quantity) || 0;
  return Math.max(0, physical - reserved);
};

// Obtenir le tag de stock pour l'affichage
const getStockTag = (product: any) => {
  const stock = getStockDisponible(product);
  const minStock = product.min_stock ?? 3;
  
  if (stock === 0) {
    return <Tag color="red" icon={<WarningOutlined />}>Rupture</Tag>;
  }
  if (stock <= minStock) {
    return <Tag color="orange" icon={<WarningOutlined />}>Stock faible: {stock}</Tag>;
  }
  return <Tag color="green">Stock: {stock}</Tag>;
};

// Filtrer les produits par type ET par stock disponible
const getFilteredProducts = (type: string) => {
  console.log(`🔍 Filtrage pour ${type}, ${products.length} produits disponibles`);
  
  if (type === 'frame') {
    const frames = products.filter(p => {
      const hasStock = getStockDisponible(p) > 0;
      const isFrame = p.frame_type !== null && p.frame_type !== undefined && p.frame_type !== '';
      console.log(`  ${p.name}: isFrame=${isFrame}, hasStock=${hasStock}, stock=${p.stock_quantity}`);
      return isFrame && hasStock;
    });
    console.log(`✅ Montures trouvées: ${frames.length}`);
    return frames;
  }
  
  if (type === 'accessory') {
    const accessories = products.filter(p => {
      const hasStock = getStockDisponible(p) > 0;
      const isAccessory = (p.accessory_type !== null && p.accessory_type !== undefined && p.accessory_type !== '') || p.consumable === true;
      console.log(`  ${p.name}: isAccessory=${isAccessory}, hasStock=${hasStock}, stock=${p.stock_quantity}`);
      return isAccessory && hasStock;
    });
    console.log(`✅ Accessoires trouvés: ${accessories.length}`);
    return accessories;
  }
  
// Juste avant le return, ajoute :
console.log('=== DIAGNOSTIC FINAL ===');
console.log('Produits en mémoire:', products.length);
const frames = getFilteredProducts('frame');
console.log('Montures filtrées:', frames.length);
console.log('Détail des montures:', frames.map(f => ({ name: f.name, stock: f.stock_quantity })));

  return [];
};


  const totalHT = orderItems.reduce((sum, item) => sum + item.total_cents, 0);
  const totalTVA = orderItems.reduce((sum, item) => sum + item.tax_amount_cents, 0);
  const totalTTC = orderItems.reduce((sum, item) => sum + item.total_ttc_cents, 0);

  // Fonction d'impression
  const printDocument = async (type: 'quote' | 'invoice', id: string) => {
  try {
    // Appeler la nouvelle route API
    const endpoint = type === 'quote' ? 'quote-data' : 'invoice-data';
    const response = await axios.get(`/api/documents/${endpoint}/${id}`, {
      headers: { 'X-Tenant-Id': localStorage.getItem('tenantId') || 'default-shop' }
    });
    
    const { data, settings } = response.data;
    
    // Générer le PDF avec react-pdf
    let pdfComponent;
    if (type === 'quote') {
      const QuotePDF = (await import('../../Documents/PDF/QuotePDF')).default;
      pdfComponent = <QuotePDF data={data} settings={settings} />;
    } else {
      const InvoicePDF = (await import('../../Documents/PDF/InvoicePDF')).default;
      pdfComponent = <InvoicePDF data={data} settings={settings} />;
    }
    
    const blob = await pdf(pdfComponent).toBlob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error(`Erreur génération ${type}:`, error);
    message.warning(`Le ${type === 'quote' ? 'devis' : 'ticket'} sera disponible dans la liste des commandes`);
  }
};

  const handleCreateOrder = async () => {
    if (!selectedClient) {
      message.error('Veuillez sélectionner un client');
      return;
    }
    if (orderItems.length === 0) {
      message.error('Ajoutez au moins un article');
      return;
    }

    const hasLenses = orderItems.some(item => item.type === 'lens');
    if (hasLenses && !hasValidPrescription) {
      message.error('⚠️ Des verres sont dans le panier mais aucune ordonnance valide n\'est associée au client.');
      return;
    }

    try {
      const orderData = {
        customer_name: `${selectedClient.first_name} ${selectedClient.last_name}`,
        customer_email: selectedClient.email,
        customer_phone: selectedClient.phone,
        client_id: selectedClient.id,
        notes: '',
        items: orderItems.map(item => ({
          type: item.type,
          product_id: item.product_id,
          description: item.description,
          quantity: item.quantity,
          unit_price_cents: item.unit_price_cents,
          total_cents: item.total_cents,
          tva_rate: item.tva_rate,
          metadata: item.metadata
        }))
      };
      
      const response = await globalOrderService.create(orderData);
      
      if (response.data.data.type === 'direct_sale') {
        message.success(`Vente directe enregistrée - Total: ${response.data.data.total_ttc_dh} DH`);
        
        // ✅ IMPRESSION DU TICKET/FACTURE pour vente directe
        if (response.data.data.invoice?.id) {
          await printDocument('invoice', response.data.data.invoice.id);
        }
        
      } else {
        message.success(`Commande optique ${response.data.data.order.order_number} créée en brouillon`);
        
        // ✅ IMPRESSION DU DEVIS pour commande optique
        if (response.data.data.order?.id) {
          await printDocument('quote', response.data.data.order.id);
        }
      }
      
      // Réinitialiser le formulaire
      setOrderItems([]);
      setSelectedClient(null);
      setHasValidPrescription(false);
      form.resetFields();
      onSuccess();
      onClose();
      
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Erreur lors de la création');
    }
  };

  return (
    <>
      <Modal
        title="Nouvelle commande"
        open={open}
        onCancel={() => {
          setOrderItems([]);
          setSelectedClient(null);
          setHasValidPrescription(false);
          form.resetFields();
          onClose();
        }}
        footer={null}
        width={1200}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          {/* Sélection client */}
          <Card size="small" title="👤 Sélection du client" style={{ marginBottom: 16 }}>
            <Form.Item label="Rechercher un client" required>
              <Select
                showSearch
                placeholder="Rechercher par nom, téléphone ou email"
                style={{ width: '100%' }}
                onSearch={handleClientSearch}
                onSelect={handleClientSelect}
                filterOption={false}
                size="large"
                 notFoundContent="Aucun client trouvé"
                options={searchResults.map(client => ({
                  value: client.id,
                  label: `${client.first_name} ${client.last_name} - ${client.phone}`
                }))}
              />
            </Form.Item>

            {selectedClient && (
              <>
                <Descriptions size="small" bordered column={{ xs: 1, sm: 2, md: 3 }}>
                  <Descriptions.Item label="Nom complet">{selectedClient.first_name} {selectedClient.last_name}</Descriptions.Item>
                  <Descriptions.Item label="Téléphone">{selectedClient.phone}</Descriptions.Item>
                  <Descriptions.Item label="Email">{selectedClient.email || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Mutuelle">{selectedClient.insurance_company || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Taux prise en charge">{selectedClient.insurance_rate ? `${selectedClient.insurance_rate}%` : '-'}</Descriptions.Item>
                </Descriptions>

                {/* Aperçu ordonnance */}
                {activePrescription ? (
                  <div style={{
                    marginTop: 12, padding: '12px 16px',
                    background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text strong style={{ color: '#52c41a' }}>
                        📋 Ordonnance valide — Dr. {activePrescription.doctor_name || 'inconnu'}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Du {activePrescription.date_of_issue ? new Date(activePrescription.date_of_issue).toLocaleDateString('fr-FR') : '-'}
                        {' '}au {activePrescription.expiry_date ? new Date(activePrescription.expiry_date).toLocaleDateString('fr-FR') : '-'}
                      </Text>
                    </div>
                    <Row gutter={16}>
                      <Col span={12}>
                        <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 6, border: '1px solid #d9f7be' }}>
                          <Text strong style={{ color: '#1890ff' }}>👁 Œil Droit (OD)</Text>
                          <div style={{ marginTop: 4, fontSize: 12 }}>
                            {activePrescription.od_sphere != null && <div>SPH: <b>{Number(activePrescription.od_sphere) >= 0 ? '+' : ''}{Number(activePrescription.od_sphere).toFixed(2)}</b></div>}
                            {activePrescription.od_cylinder != null && <div>CYL: <b>{Number(activePrescription.od_cylinder).toFixed(2)}</b></div>}
                            {activePrescription.od_axis != null && <div>AXE: <b>{Number(activePrescription.od_axis)}°</b></div>}
                            {activePrescription.od_addition != null && <div>ADD: <b>+{Number(activePrescription.od_addition).toFixed(2)}</b></div>}
                          </div>
                        </div>
                      </Col>
                      <Col span={12}>
                        <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 6, border: '1px solid #d9f7be' }}>
                          <Text strong style={{ color: '#52c41a' }}>👁 Œil Gauche (OG)</Text>
                          <div style={{ marginTop: 4, fontSize: 12 }}>
                            {activePrescription.og_sphere != null && <div>SPH: <b>{Number(activePrescription.og_sphere) >= 0 ? '+' : ''}{Number(activePrescription.og_sphere).toFixed(2)}</b></div>}
                            {activePrescription.og_cylinder != null && <div>CYL: <b>{Number(activePrescription.og_cylinder).toFixed(2)}</b></div>}
                            {activePrescription.og_axis != null && <div>AXE: <b>{Number(activePrescription.og_axis)}°</b></div>}
                            {activePrescription.og_addition != null && <div>ADD: <b>+{Number(activePrescription.og_addition).toFixed(2)}</b></div>}
                          </div>
                        </div>
                      </Col>
                      {activePrescription.pupillary_distance && (
                        <Col span={24} style={{ marginTop: 8 }}>
                          <Text style={{ fontSize: 12 }}>Distance pupillaire: <b>{activePrescription.pupillary_distance} mm</b></Text>
                        </Col>
                      )}
                    </Row>
                    <div style={{ marginTop: 8, fontSize: 11, color: '#666' }}>
                      ✅ Ces valeurs seront pré-remplies automatiquement dans le formulaire verres
                    </div>
                  </div>
                ) : (
                  <div style={{
                    marginTop: 12, padding: '8px 16px',
                    background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 8,
                    display: 'flex', alignItems: 'center', gap: 8
                  }}>
                    <span>⚠️</span>
                    <Text style={{ color: '#d46b08' }}>
                      Aucune ordonnance valide pour ce client. Vous pouvez quand même commander des verres.
                    </Text>
                  </div>
                )}
              </>
            )}

            {/* Modal confirmation changement client avec panier non vide */}
            <Modal
              title="⚠️ Changer de client ?"
              open={!!pendingClientChange}
              onOk={handleConfirmClientChange}
              onCancel={() => setPendingClientChange(null)}
              okText="Oui, vider le panier et changer"
              cancelText="Non, garder le client actuel"
              okButtonProps={{ danger: true }}
            >
              <p>
                Vous avez <b>{orderItems.length} article{orderItems.length > 1 ? 's' : ''}</b> dans le panier.
              </p>
              <p>
                Changer de client <b>videra le panier</b>. Voulez-vous continuer ?
              </p>
            </Modal>
          </Card>

          {/* Panier */}
<Card 
  size="small" 
  title="🛒 Articles" 
  style={{ marginTop: 16 }}
  extra={
    <Space>
      <Button 
        size="small" 
        onClick={() => addOrderItem('frame')}
        disabled={getFilteredProducts('frame').length === 0}
        title={getFilteredProducts('frame').length === 0 ? "Aucune monture en stock" : ""}
      >
        ➕ Monture
      </Button>
      <Button 
        size="small" 
        onClick={() => addOrderItem('accessory')}
        disabled={getFilteredProducts('accessory').length === 0}
        title={getFilteredProducts('accessory').length === 0 ? "Aucun accessoire en stock" : ""}
      >
        🔧 Accessoire
      </Button>
      <Button 
        size="small" 
        type="primary" 
        onClick={() => {
          if (!hasValidPrescription) {
            message.error('⚠️ Une ordonnance valide est requise pour commander des verres');
            return;
          }
          setLensModalVisible(true);
        }}
      >
        👓 Verres optiques
      </Button>
    </Space>
  }
>
  {/* En-tête */}
  <Row style={{ marginBottom: 8, fontWeight: 'bold', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
    <Col span={2}>Type</Col>
    <Col span={6}>Produit / Référence</Col>
    <Col span={2}>Qté</Col>
    <Col span={3}>Prix unitaire</Col>
    <Col span={2}>TVA</Col>
    <Col span={3}>Total HT</Col>
    <Col span={3}>Total TTC</Col>
    <Col span={3}>Action</Col>
  </Row>
  
  {/* Lignes du panier */}
  {orderItems.map((item, index) => {
    const filteredProducts = getFilteredProducts(item.type);
    
    return (
      <Row key={index} style={{ marginBottom: 8, alignItems: 'center' }}>
        <Col span={2}>
          <Tag color={item.type === 'frame' ? 'blue' : item.type === 'lens' ? 'green' : 'orange'}>
            {item.type === 'frame' ? 'Monture' : item.type === 'lens' ? 'Verres' : 'Accessoire'}
          </Tag>
        </Col>
        
        <Col span={6}>
          {item.type === 'lens' ? (
            <Text>{item.description}</Text>
          ) : (
            <Select
              placeholder="Sélectionner un produit"
              style={{ width: '100%' }}
              value={item.product_id}
              onChange={(v) => updateOrderItem(index, 'product_id', v)}
              showSearch
              optionFilterProp="children"
              notFoundContent="Aucun produit en stock"
            >
              {filteredProducts.map(p => {
                const stockDispo = getStockDisponible(p);
                return (
                  <Option key={p.id} value={p.id}>
                    <Space direction="vertical" size={0} style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>
                          <strong>{p.name}</strong> ({p.reference})
                        </span>
                        <span style={{ color: '#1890ff' }}>
                          {(p.price_cents / 100).toFixed(2)} DH
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                        <span>
                          {p.frame_brand && <Tag color="blue" style={{ fontSize: 10 }}>{p.frame_brand}</Tag>}
                          {p.frame_color && <span style={{ color: '#666' }}>🎨 {p.frame_color}</span>}
                        </span>
                        {getStockTag(p)}
                      </div>
                    </Space>
                  </Option>
                );
              })}
            </Select>
          )}
        </Col>
        
        <Col span={2}>
          <InputNumber
            min={1}
            max={item.max_quantity || 999}
            value={item.quantity}
            onChange={(v) => updateOrderItem(index, 'quantity', v || 1)}
            style={{ width: '100%' }}
          />
        </Col>
        
        <Col span={3}>
          <InputNumber
            min={0}
            value={item.unit_price_cents / 100}
            onChange={(v) => updateOrderItem(index, 'unit_price_cents', (v || 0) * 100)}
            step={10}
            style={{ width: '100%' }}
            formatter={value => `${value} DH`}
            parser={(value?: string) => Number(value?.replace('DH', '') || 0)}
          />
        </Col>
        
        <Col span={2}>
          <InputNumber
            min={0}
            max={100}
            value={item.tva_rate}
            onChange={(v) => updateOrderItem(index, 'tva_rate', v || 0)}
            step={1}
            style={{ width: '100%' }}
            formatter={value => `${value}%`}
            parser={(value?: string) => Number(value?.replace('%', '') || 0)}
          />
        </Col>
        
        <Col span={3}>
          <Text>{(item.total_cents / 100).toFixed(2)} DH</Text>
        </Col>
        
        <Col span={3}>
          <Text strong style={{ color: '#1890ff' }}>{(item.total_ttc_cents / 100).toFixed(2)} DH</Text>
        </Col>
        
        <Col span={3}>
          <Popconfirm title="Supprimer cet article ?" onConfirm={() => removeOrderItem(index)}>
            <Button danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Col>
      </Row>
    );
  })}
  
  {orderItems.length === 0 && (
    <Alert title="Aucun article" description="Ajoutez des articles à la commande" type="info" showIcon />
  )}
  
  <Divider style={{ margin: '16px 0' }} />
  
  {/* Totaux */}
  <div style={{ textAlign: 'right', background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
    <Space size="large">
      <Text type="secondary">Total HT :</Text>
      <Text strong>{(totalHT / 100).toFixed(2)} DH</Text>
      
      <Text type="secondary">|</Text>
      
      <Text type="secondary">TVA (totale) :</Text>
      <Text strong>{(totalTVA / 100).toFixed(2)} DH</Text>
      
      <Text type="secondary">|</Text>
      
      <Title level={4} style={{ margin: 0, color: '#1890ff' }}>
        Total TTC : {(totalTTC / 100).toFixed(2)} DH
      </Title>
    </Space>
  </div>
</Card>
          <Form.Item style={{ marginTop: 16 }}>
            <Button 
              type="primary" 
              size="large" 
              onClick={handleCreateOrder} 
              block 
              disabled={!selectedClient || orderItems.length === 0}
            >
              {orderItems.some(item => item.type === 'lens') ? 'Créer la commande (Brouillon)' : 'Vendre directement'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Configuration Verres */}
      <Modal
        title="👓 Configuration des verres optiques"
        open={lensModalVisible}
        onCancel={() => setLensModalVisible(false)}
        footer={null}
        width={1000}
        destroyOnHidden
      >
        <LensOrderFormEmbedded 
          onConfirm={(lensData: any) => {
            addLensToOrder(lensData);
            setLensModalVisible(false);
          }}
          onCancel={() => setLensModalVisible(false)}
          initialPrescription={activePrescription ? {
            od: {
              sphere:   activePrescription.od_sphere   ?? 0,
              cylinder: activePrescription.od_cylinder ?? 0,
              axis:     activePrescription.od_axis     ?? null,
              addition: activePrescription.od_addition ?? null,
            },
            og: {
              sphere:   activePrescription.og_sphere   ?? 0,
              cylinder: activePrescription.og_cylinder ?? 0,
              axis:     activePrescription.og_axis     ?? null,
              addition: activePrescription.og_addition ?? null,
            },
            pupillary_distance: activePrescription.pupillary_distance ?? 0,
          } : null}
          prescriptionLabel={activePrescription
            ? `Dr. ${activePrescription.doctor_name || 'inconnu'} — ${activePrescription.date_of_issue ? new Date(activePrescription.date_of_issue).toLocaleDateString('fr-FR') : ''}`
            : undefined
          }
        />
      </Modal>
    </>
  );
};

export default NewOrderModal;