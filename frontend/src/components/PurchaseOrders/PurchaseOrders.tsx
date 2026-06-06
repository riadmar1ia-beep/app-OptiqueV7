// frontend/src/components/PurchaseOrders/PurchaseOrders.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Tag, Button, Space, Modal, message, Tooltip,
  Row, Col, Alert, Typography, Form, Input,
  InputNumber, Tabs, Descriptions, Statistic, Steps, Badge, Select, Divider
} from 'antd';
import {
  EyeOutlined, SendOutlined, CheckCircleOutlined, DeleteOutlined,
  ShoppingOutlined, ClockCircleOutlined, WarningOutlined,
  TruckOutlined, ShopOutlined, FileTextOutlined, ReloadOutlined,
  ArrowRightOutlined, SafetyCertificateOutlined, ExclamationCircleOutlined,
  DollarOutlined, InboxOutlined, PlusOutlined, MinusCircleOutlined,
  HistoryOutlined
} from '@ant-design/icons';
import { purchaseOrderService, productService, supplierService } from '../../services/api';
import PrintButton from '../Documents/PrintButton';
import QualityControlModal from '../Supplier/QualityControlModal';
import PurchaseDisputeModal from './PurchaseDisputeModal';
import PurchaseOrderHistoryModal from './PurchaseOrderHistoryModal';

const { Text, Title } = Typography;
const { Option } = Select;

// ─── Types ────────────────────────────────────────────────────────────────────

type PurchaseStatus =
  | 'draft'
  | 'sent'
  | 'approved'
  | 'received'
  | 'quality_pending'
  | 'passed'
  | 'dispute'
  | 'replacement_pending'
  | 'replacement_received'
  | 'returned'
  | 'credit_note'
  | 'cancelled';

interface PurchaseOrder {
  order_id: string;
  status: PurchaseStatus;
  created_at: string;
  sent_at?: string;
  approved_at?: string;
  received_at?: string;
  customer_name?: string;
  customer_phone?: string;
  supplier_name?: string;
  expected_price_cents?: number;
  actual_price_cents?: number;
  expected_price_dh?: string;
  actual_price_dh?: string;
  sales_order_number?: string;
  supplier_invoice_number?: string;
  supplier_invoice_date?: string;
  supplier_invoice_amount?: number;
  credit_note_number?: string;
  credit_note_amount_cents?: number;
  credit_note_date?: string;
  quality_control_notes?: string;
  issues_count?: number;
  items?: any[]; 
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<PurchaseStatus, { color: string; label: string; icon: React.ReactNode; step: number }> = {
  draft:              { color: 'default',   label: 'Brouillon',             icon: <FileTextOutlined />, step: 0 },
  sent:               { color: 'blue',      label: 'Envoyé au fournisseur', icon: <SendOutlined />, step: 1 },
  approved:           { color: 'cyan',      label: 'Approuvé',              icon: <CheckCircleOutlined />, step: 2 },
  received:           { color: 'orange',    label: 'Reçu en magasin',       icon: <ShopOutlined />, step: 3 },
  quality_pending:    { color: 'processing',label: 'Contrôle qualité',      icon: <SafetyCertificateOutlined />, step: 4 },
  passed:             { color: 'success',   label: 'Conforme ✓',            icon: <CheckCircleOutlined />, step: 5 },
  dispute:            { color: 'error',     label: 'Litige ouvert',         icon: <ExclamationCircleOutlined />, step: 3 },
  returned:           { color: 'orange',    label: 'Retourné',              icon: <TruckOutlined />, step: 3 },
  replacement_pending:{ color: 'warning',   label: 'Attente remplacement',  icon: <TruckOutlined />, step: 3 },
  replacement_received:{ color: 'processing',label: 'Remplacement reçu',    icon: <InboxOutlined />, step: 3 },
  credit_note:        { color: 'warning',   label: 'Avoir demandé',         icon: <FileTextOutlined />, step: 4 },
  cancelled:          { color: 'error',     label: 'Annulé',                icon: <DeleteOutlined />, step: -1 },
};

function StatusTag({ status }: { status: PurchaseStatus }) {
  const cfg = STATUS_CFG[status];
  if (!cfg) return <Tag>{status ?? '—'}</Tag>;
  return <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>;
}

// ─── Workflow pipeline display ─────────────────────────────────────────────────

const PIPELINE_STEPS = [
  { key: 'draft',   label: 'Brouillon', icon: <FileTextOutlined /> },
  { key: 'sent',    label: 'Envoyé',    icon: <SendOutlined /> },
  { key: 'approved',label: 'Approuvé',  icon: <CheckCircleOutlined /> },
  { key: 'received',label: 'Reçu',      icon: <ShopOutlined /> },
  { key: 'quality', label: 'Contrôle',  icon: <SafetyCertificateOutlined /> },
];

const QUALITY_OUTCOMES = [
  { label: 'Conforme',      color: '#52c41a', icon: '✅' },
  { label: 'Litige',        color: '#ff4d4f', icon: '⚠️' },
  { label: 'Avoir demandé', color: '#fa8c16', icon: '📝' },
];

function WorkflowDiagram() {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #f0f5ff 0%, #f6ffed 100%)',
      borderRadius: 12,
      padding: '14px 20px',
      marginBottom: 20,
      border: '1px solid #d9e8ff',
    }}>
      <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
        Flux de traitement — Achats stock magasin
      </Text>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {PIPELINE_STEPS.map((step, i) => (
          <React.Fragment key={step.key}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#fff', border: '1px solid #d9d9d9',
              borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 500,
            }}>
              {step.icon} {step.label}
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <ArrowRightOutlined style={{ color: '#8c8c8c', fontSize: 11 }} />
            )}
          </React.Fragment>
        ))}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 8 }}>
          {QUALITY_OUTCOMES.map((b) => (
            <div key={b.label} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: '#fff', border: `1px solid ${b.color}44`,
              borderRadius: 20, padding: '4px 14px', fontSize: 12, color: b.color, fontWeight: 500,
            }}>
              {b.icon} {b.label}
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: '#8c8c8c' }}>
        En cas de litige → Attente remplacement → Remplacement reçu → Nouveau contrôle → Conforme
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

interface TabDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  filter: (o: PurchaseOrder) => boolean;
}

const TABS: TabDef[] = [
  {
    key: 'all',
    label: 'Toutes',
    icon: <ReloadOutlined />,
    filter: () => true,
  },
  {
    key: 'pipeline',
    label: 'À traiter',
    icon: <TruckOutlined />,
    filter: (o) => ['draft', 'sent', 'approved'].includes(o.status),
  },
  {
    key: 'reception',
    label: 'Réception / Contrôle',
    icon: <InboxOutlined />,
    filter: (o) => ['received', 'quality_pending', 'replacement_received', 'returned'].includes(o.status),
  },
  {
    key: 'disputes',
    label: 'Litiges',
    icon: <WarningOutlined />,
    filter: (o) => ['dispute', 'replacement_pending'].includes(o.status),
  },
  {
    key: 'credit_notes',
    label: 'Avoirs',
    icon: <FileTextOutlined />,
    filter: (o) => o.status === 'credit_note',
  },
  {
    key: 'completed',
    label: 'Terminées',
    icon: <CheckCircleOutlined />,
    filter: (o) => o.status === 'passed',
  },
];

// ─── Helper ────────────────────────────────────────────────────────────────────

function confirmAction(title: string, content: React.ReactNode): Promise<boolean> {
  return new Promise((resolve) =>
    Modal.confirm({
      title,
      content,
      okText: 'Confirmer',
      cancelText: 'Annuler',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    })
  );
}

// ─── Receive modal ────────────────────────────────────────────────────────────

function ReceiveModal({
  open, onCancel, onFinish,
}: {
  open: boolean;
  onCancel: () => void;
  onFinish: (values: any) => Promise<void>;
}) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [htValue, setHtValue] = useState<number | null>(null);
  const [tvaValue, setTvaValue] = useState<number>(20);

  const calculateTTC = (ht: number | null, tva: number) => {
    if (ht && ht > 0) {
      const ttc = ht * (1 + tva / 100);
      form.setFieldValue('amount_ttc', Math.round(ttc * 100) / 100);
    } else {
      form.setFieldValue('amount_ttc', null);
    }
  };

  const handleHtChange = (value: number | null) => {
    setHtValue(value);
    calculateTTC(value, tvaValue);
  };

  const handleTvaChange = (value: number | null) => {
    const tva = value || 0;
    setTvaValue(tva);
    calculateTTC(htValue, tva);
  };

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try { await onFinish(values); } finally { setLoading(false); }
  };

  return (
    <Modal
      title={<Space><InboxOutlined style={{ color: '#52c41a' }} /> Réception — saisie de facture</Space>}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={520}
      afterClose={() => {
        form.resetFields();
        setHtValue(null);
        setTvaValue(20);
      }}
    >
      <Alert
        title="Renseignez les informations de la facture fournisseur reçue."
        type="info"
        showIcon
        style={{ marginBottom: 20 }}
      />
      <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ amount_tva: 20 }}>
        <Row gutter={12}>
          <Col span={14}>
            <Form.Item name="invoice_number" label="N° Facture" rules={[{ required: true }]}>
              <Input prefix={<FileTextOutlined />} placeholder="FAC-2025-001" />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="invoice_date" label="Date facture" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="amount_ht" label="Montant HT (DH)" rules={[{ required: true }]}>
              <InputNumber 
                min={0} 
                step={10} 
                style={{ width: '100%' }} 
                placeholder="0.00"
                onChange={handleHtChange}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="amount_tva" label="TVA (%)" initialValue={20}>
              <InputNumber 
                min={0} 
                max={100} 
                style={{ width: '100%' }} 
                onChange={handleTvaChange}
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="amount_ttc" label="Montant TTC (DH)" tooltip="Calculé automatiquement">
          <InputNumber 
            min={0} 
            step={10} 
            style={{ width: '100%' }} 
            placeholder="Calculé auto."
            disabled
          />
        </Form.Item>
        <Form.Item name="notes" label="Notes internes">
          <Input.TextArea rows={2} placeholder="Notes optionnelles…" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block size="large" icon={<CheckCircleOutlined />} loading={loading}>
          Valider la réception
        </Button>
      </Form>
    </Modal>
  );
}

// ─── Create order modal ────────────────────────────────────────────────────────

function CreateOrderModal({
  open, onCancel, onFinish, products, suppliers, loading
}: {
  open: boolean;
  onCancel: () => void;
  onFinish: (values: any) => Promise<void>;
  products: any[];
  suppliers: any[];
  loading: boolean;
}) {
  const [form] = Form.useForm();

  return (
    <Modal
      title={<Space><PlusOutlined /> Nouvelle commande d'achat</Space>}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={700}
      afterClose={() => form.resetFields()}
    >
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="supplier_id" label="Fournisseur" rules={[{ required: true }]}>
          <Select placeholder="Sélectionner un fournisseur" showSearch>
            {suppliers.map(s => (
              <Option key={s.id} value={s.id}>{s.name}</Option>
            ))}
          </Select>
        </Form.Item>

        <Form.List name="items">
          {(fields, { add, remove }) => (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text strong>Articles</Text>
                <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => add()}>
                  Ajouter un produit
                </Button>
              </div>
              
              {fields.length === 0 && (
                <Alert
                  title="Aucun article"
                  description="Cliquez sur 'Ajouter un produit' pour commencer"
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
              )}
              
              {fields.map((field, index) => {

                const selectedProductId = form.getFieldValue(['items', field.name, 'product_id']);
                const selectedProduct = products.find(p => p.id === selectedProductId);
                const isFrame = selectedProduct?.frame_color || selectedProduct?.frame_type || 
                                selectedProduct?.reference?.startsWith('MNT') ||
                                selectedProduct?.reference?.startsWith('FRM');
                
                return (
                  <Card 
                    key={field.key} 
                    size="small" 
                    style={{ 
                      marginBottom: 12,
                      borderLeft: isFrame ? '4px solid #1890ff' : '4px solid #52c41a',
                      background: '#fafafa'
                    }}
                  >
                    <Row gutter={12}>
                      <Col span={24}>
                        <Form.Item
                 name={[field.name, 'product_id']}
  label="Produit"
  rules={[{ required: true }]}
                          style={{ marginBottom: 8 }}
                        >
                          <Select 
                            placeholder="Sélectionner un produit" 
                            showSearch 
                            optionFilterProp="children"
                            onChange={(value) => {
                              const product = products.find(p => p.id === value);
                              if (product) {
                                const currentItems = form.getFieldValue('items') || [];
                                currentItems[field.name] = {
                                  ...currentItems[field.name],
                                  product_id: product.id, 
                                  unit_price: product.price_cents / 100,
                                  product_name: product.name,
                                  reference: product.reference,
                                  frame_color: product.frame_color,
                                  frame_brand: product.frame_brand,
                                  frame_model: product.frame_model,
                                  size_code: product.size_code,
                                  material: product.material,
                                  frame_type: product.frame_type,
                                  gender: product.gender,
                                  shape: product.shape,
                                };
                                form.setFieldsValue({ items: currentItems });
                              }
                            }}
                          >
                            {products.map(p => {
                              const isProductFrame = p.frame_color || p.frame_type || p.reference?.startsWith('MNT');
                              return (
                                <Option key={p.id} value={p.id}>
                                  <Space>
                                    {isProductFrame ? '👓' : '📦'}
                                    <span><b>{p.name}</b></span>
                                    <span style={{ color: '#999', fontSize: 12 }}>({p.reference})</span>
                                    {p.frame_color && <span style={{ color: '#1890ff' }}>🎨 {p.frame_color}</span>}
                                    <span style={{ color: '#52c41a' }}>{(p.price_cents / 100).toFixed(2)} DH</span>
                                  </Space>
                                </Option>
                              );
                            })}
                          </Select>
                        </Form.Item>
                      </Col>
                    </Row>
                    
                    {selectedProduct && (
                      <div style={{ 
                        marginBottom: 12, 
                        padding: 10, 
                        background: '#fff', 
                        borderRadius: 8,
                        border: '1px solid #e8e8e8'
                      }}>
                        <Row gutter={16}>
                          <Col span={14}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                              <span style={{ fontSize: 24 }}>{isFrame ? '👓' : '📦'}</span>
                              <div>
                                <Text strong>{selectedProduct.name}</Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: 11 }}>Ref: {selectedProduct.reference}</Text>
                              </div>
                            </div>
                            {isFrame && (
                              <div style={{ marginTop: 4 }}>
                                <Space size={12} wrap>
                                  {selectedProduct.frame_brand && <Tag color="blue">{selectedProduct.frame_brand}</Tag>}
                                  {selectedProduct.frame_model && <Text code style={{ fontSize: 11 }}>{selectedProduct.frame_model}</Text>}
                                  {selectedProduct.frame_color && (
                                    <span>
                                      <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: selectedProduct.frame_color, marginRight: 4, border: '1px solid #ddd' }} />
                                      <Text style={{ fontSize: 12 }}>{selectedProduct.frame_color}</Text>
                                    </span>
                                  )}
                                  {selectedProduct.size_code && <Text type="secondary" style={{ fontSize: 11 }}>📏 {selectedProduct.size_code}</Text>}
                                </Space>
                                <div style={{ marginTop: 6 }}>
                                  <Space size={12} wrap>
                                    {selectedProduct.gender && <Text type="secondary" style={{ fontSize: 11 }}>👤 {selectedProduct.gender === 'homme' ? 'Homme' : selectedProduct.gender === 'femme' ? 'Femme' : 'Unisexe'}</Text>}
                                    {selectedProduct.shape && <Text type="secondary" style={{ fontSize: 11 }}>🔷 {selectedProduct.shape}</Text>}
                                    {selectedProduct.material && <Text type="secondary" style={{ fontSize: 11 }}>🏗️ {selectedProduct.material}</Text>}
                                    {selectedProduct.frame_type && <Text type="secondary" style={{ fontSize: 11 }}>🖼️ {selectedProduct.frame_type === 'full_rim' ? 'Plein bord' : selectedProduct.frame_type === 'semi-rim' ? 'Semi-bord' : selectedProduct.frame_type === 'rimless' ? 'Sans bord' : selectedProduct.frame_type}</Text>}
                                  </Space>
                                </div>
                              </div>
                            )}
                          </Col>
                          <Col span={10}>
                            <Row gutter={8}>
                              <Col span={12}>
                                <Form.Item
  name={[field.name, 'quantity']}
  
  label="Quantité"
  rules={[{ required: true }]} style={{ marginBottom: 8 }}>
                                  <InputNumber min={1} style={{ width: '100%' }} placeholder="Qté" />
                                </Form.Item>
                              </Col>
                              <Col span={12}>
                                <Form.Item
  name={[field.name, 'unit_price']}
 
  label="Prix unitaire (DH)" style={{ marginBottom: 8 }}>
                                  <InputNumber min={0} step={10} style={{ width: '100%' }} placeholder="Prix auto" />
                                </Form.Item>
                              </Col>
                            </Row>
                            <div style={{ textAlign: 'right', marginTop: 4 }}>
                              <Text type="secondary" style={{ fontSize: 12 }}>Total: <Text strong>{(form.getFieldValue(['items', field.name, 'quantity']) || 0) * (form.getFieldValue(['items', field.name, 'unit_price']) || (selectedProduct?.price_cents / 100) || 0)} DH</Text></Text>
                            </div>
                          </Col>
                        </Row>
                      </div>
                    )}
                    
                    <div style={{ textAlign: 'right', marginTop: 8 }}>
                      <Button type="link" danger icon={<MinusCircleOutlined />} onClick={() => remove(field.name)}>Supprimer</Button>
                    </div>
                  </Card>
                );
              })}
            </>
          )}
        </Form.List>

        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} placeholder="Notes optionnelles…" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>Créer la commande</Button>
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

const PurchaseOrders: React.FC = () => {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pipeline');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [receiveOrderId, setReceiveOrderId] = useState('');
  const [detailOrder, setDetailOrder] = useState<PurchaseOrder | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  
  const [qualityControlVisible, setQualityControlVisible] = useState(false);
  const [qualityControlOrderId, setQualityControlOrderId] = useState('');
  const [qualityControlOrderDetails, setQualityControlOrderDetails] = useState<any>(null);
  const [disputeModalVisible, setDisputeModalVisible] = useState(false);
  const [disputeOrderId, setDisputeOrderId] = useState('');
  const [disputeOrderDetails, setDisputeOrderDetails] = useState<any>(null);
  
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyOrderId, setHistoryOrderId] = useState('');
  
  const [creditNotes, setCreditNotes] = useState<any[]>([]);
  const [replacements, setReplacements] = useState<any[]>([]);

  // ── Data ───────────────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await purchaseOrderService.getPurchaseOrders();
      setOrders(res.data.data);
    } catch {
      message.error('Erreur chargement commandes');
    } finally {
      setLoading(false);
    }
  }, []);

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
    console.log('📦 Produits chargés (PurchaseOrders):', data.data.length);
    setProducts(data.data);
  } catch (error) {
    console.error('❌ Erreur chargement produits:', error);
    message.error('Erreur lors du chargement des produits');
  }
};

  const fetchSuppliers = async () => {
    try {
      const res = await supplierService.getAll();
      setSuppliers(res.data.data);
    } catch {
      message.error('Erreur chargement fournisseurs');
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchProducts();
    fetchSuppliers();
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const updateStatus = async (orderId: string, newStatus: PurchaseStatus, label: string) => {
    const ok = await confirmAction(
      `Confirmer : ${label}`,
      `Passer la commande au statut « ${label} » ?`
    );
    if (!ok) return;
    try {
      await purchaseOrderService.updatePurchaseOrderStatus(orderId, newStatus);
      message.success(`✅ ${label}`);
      fetchOrders();
    } catch {
      message.error(`Erreur : ${label}`);
    }
  };

  const loadOrderDetails = async (orderId: string) => {
    setDetailLoading(true);
    try {
      const [orderRes, creditRes, replacementRes] = await Promise.all([
        purchaseOrderService.getPurchaseOrderDetail(orderId),
        purchaseOrderService.getCreditNotes?.(orderId),
        purchaseOrderService.getReplacements?.(orderId)
      ]);
      
      const orderData = orderRes.data.data;
      
      let items = [];
      if (orderData.items) {
        if (typeof orderData.items === 'string') {
          items = JSON.parse(orderData.items);
        } else if (Array.isArray(orderData.items)) {
          items = orderData.items;
        }
      }
      
      const enrichedItems = await Promise.all(items.map(async (item: any) => {
        if (item.product_id) {
          try {
            const productRes = await productService.getById(item.product_id);
            const product = productRes.data.data;
            return {
              ...item,
              name: product.name,
              reference: product.reference,
              product_name: product.name,
              unit_price: item.unit_price_cents ? item.unit_price_cents / 100 : 0
            };
          } catch (error) {
            return {
              ...item,
              name: 'Produit inconnu',
              reference: '-',
              unit_price: item.unit_price_cents ? item.unit_price_cents / 100 : 0
            };
          }
        }
        return {
          ...item,
          name: item.product_name || 'Produit inconnu',
          reference: item.reference || '-',
          unit_price: item.unit_price_cents ? item.unit_price_cents / 100 : 0
        };
      }));
      
      setDetailOrder({
        ...orderData,
        items: enrichedItems
      });
      setCreditNotes(creditRes?.data?.data || []);
      setReplacements(replacementRes?.data?.data || []);
      setDetailVisible(true);
    } catch (error) {
      console.error('Erreur:', error);
      message.error('Erreur chargement détails');
    } finally {
      setDetailLoading(false);
    }
  };

  // Transforme detailOrder → format attendu par PurchaseOrderPDF
  const buildPurchaseOrderPDFData = (order: any) => {
    const items = (order.items || []).map((item: any) => {
      const unitPrice = typeof item.unit_price === 'number' ? item.unit_price
        : item.unit_price_cents ? item.unit_price_cents / 100 : 0;
      const qty = typeof item.quantity === 'number' ? item.quantity : 1;
      return {
        reference: item.reference || item.product_reference || '-',
        description: item.name || item.product_name || item.description || '-',
        quantity: qty,
        unit_price: unitPrice,
        total: typeof item.total === 'number' ? item.total : unitPrice * qty,
      };
    });

    const subtotal = items.reduce((acc: number, i: any) => acc + i.total, 0);
    const taxRate = typeof order.tax_rate === 'number' ? order.tax_rate : 20;
    const taxAmount = subtotal * taxRate / 100;
    const total = subtotal + taxAmount;

    return {
      order_id: order.order_id || '-',
      date: order.created_at ? new Date(order.created_at).toLocaleDateString('fr-FR') : '-',
      supplier_name: order.supplier_name || '-',
      supplier_address: order.supplier_address,
      items,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total,
      notes: order.notes,
    };
  };

  const openHistory = (orderId: string) => {
    setHistoryOrderId(orderId);
    setHistoryVisible(true);
  };

  const handleReceive = async (values: any, isReplacementInvoice: boolean = false) => {
    const ht = values.amount_ht ?? 0;
    const tva = values.amount_tva ?? 20;
    const ttc = values.amount_ttc ?? ht * (1 + tva / 100);
    
    let invoiceNumber = values.invoice_number;
    if (!invoiceNumber && !isReplacementInvoice) {
      invoiceNumber = null;
    }
    
    const ok = await confirmAction(
      isReplacementInvoice ? '📝 Saisie nouvelle facture' : '📦 Confirmer la réception',
      isReplacementInvoice ? (
        <ul style={{ paddingLeft: 16 }}>
          <li><b>Nouvelle N° Facture :</b> {invoiceNumber}</li>
          <li><b>Montant HT :</b> {ht} DH</li>
          <li><b>TVA :</b> {tva}%</li>
          <li><b>Montant TTC :</b> {ttc.toFixed(2)} DH</li>
          <li><b>Type :</b> Facture de remplacement SAV</li>
        </ul>
      ) : (
        <p>Confirmez-vous la réception des nouvelles pièces ?</p>
      )
    );
    if (!ok) return;
    
    try {
      await purchaseOrderService.receivePurchaseOrder(receiveOrderId, {
        invoice_number: invoiceNumber,
        invoice_date: values.invoice_date,
        amount_ht: ht,
        amount_tva: tva,
        amount_ttc: ttc,
        notes: values.notes,
        is_replacement_invoice: isReplacementInvoice
      });
      
      if (isReplacementInvoice) {
        message.success('✅ Nouvelle facture enregistrée');
        message.info(`Facture: ${invoiceNumber}`);
      } else {
        message.success('✅ Nouvelles pièces réceptionnées');
      }
      
      fetchOrders();
      setReceiveModalVisible(false);
    } catch {
      message.error('Erreur lors de la réception');
    }
  };

  const handleCreateOrder = async (values: any) => {
    const items = values.items || [];
    if (items.length === 0) {
      message.warning('Ajoutez au moins un article');
      return;
    }
    
    setCreateLoading(true);
    try {
      await purchaseOrderService.createPurchaseOrder({
        supplier_id: values.supplier_id,
        items: items.map((item: any) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price_cents: (item.unit_price || 0) * 100,
        })),
        notes: values.notes,
      });
      message.success('✅ Commande d\'achat créée');
      setCreateModalVisible(false);
      fetchOrders();
    } catch {
      message.error('Erreur lors de la création');
    } finally {
      setCreateLoading(false);
    }
  };

  const openQualityControl = async (orderId: string) => {
    setQualityControlOrderId(orderId);
    try {
      const res = await purchaseOrderService.getPurchaseOrderDetail(orderId);
      setQualityControlOrderDetails(res.data.data);
      setQualityControlVisible(true);
    } catch {
      message.error('Erreur chargement détails');
    }
  };

  const openDisputeManagement = async (orderId: string) => {
    setDisputeOrderId(orderId);
    try {
      const res = await purchaseOrderService.getPurchaseOrderDetail(orderId);
      setDisputeOrderDetails(res.data.data);
      setDisputeModalVisible(true);
    } catch {
      message.error('Erreur chargement litige');
    }
  };

  const handleValidateQuality = (orderId: string, notes: string) => {
    Modal.confirm({
      title: 'Valider le contrôle qualité',
      content: 'Confirmez-vous que tous les articles sont conformes ?',
      okText: 'Oui, conforme',
      cancelText: 'Annuler',
      onOk: async () => {
        try {
          await purchaseOrderService.updatePurchaseOrderStatus(orderId, 'passed');
          message.success('✅ Commande validée — Conforme');
          fetchOrders();
          setQualityControlVisible(false);
        } catch {
          message.error('Erreur lors de la validation');
        }
      },
    });
  };

  const handleDisputeQuality = (orderId: string, issues: any[], notes: string) => {
    Modal.confirm({
      title: 'Signaler un litige',
      content: (
        <div>
          <p><b>{issues.length}</b> problème(s) à signaler :</p>
          <ul style={{ paddingLeft: 16 }}>
            {issues.map((issue, i) => <li key={i}>{issue.description}</li>)}
          </ul>
        </div>
      ),
      okText: 'Confirmer le litige',
      okButtonProps: { danger: true },
      cancelText: 'Annuler',
      onOk: async () => {
        try {
          await purchaseOrderService.updatePurchaseOrderStatus(orderId, 'dispute');
          message.warning('⚠️ Litige signalé');
          fetchOrders();
          setQualityControlVisible(false);
        } catch {
          message.error('Erreur lors du signalement');
        }
      },
    });
  };

  const handleSimpleReceive = async (orderId: string) => {
    const ok = await confirmAction(
      'Réception des nouvelles pièces',
      'Confirmez-vous la réception des nouvelles pièces de remplacement ?'
    );
    if (!ok) return;
    
    try {
      await purchaseOrderService.updatePurchaseOrderStatus(orderId, 'received');
      message.success('✅ Nouvelles pièces réceptionnées');
      message.info('🔍 Veuillez maintenant effectuer le contrôle qualité');
      fetchOrders();
    } catch {
      message.error('Erreur lors de la réception');
    }
  };

  // ── Prochaine action ──────────────────────────────────────────────────────

  const NextAction = ({ record: r }: { record: PurchaseOrder }) => {
    switch (r.status) {
      case 'draft':
        return (
          <Button size="small" icon={<SendOutlined />}
            onClick={() => updateStatus(r.order_id, 'sent', 'Marquer approuvé')}>
            Marquer approuvé
          </Button>
        );
      case 'sent':
        return (
          <Button type="primary" size="small" icon={<InboxOutlined />}
            onClick={() => { setReceiveOrderId(r.order_id); setReceiveModalVisible(true); }}>
            Réceptionner
          </Button>
        );
      case 'approved':
        return (
          <Button type="primary" size="small" icon={<InboxOutlined />}
            onClick={() => { setReceiveOrderId(r.order_id); setReceiveModalVisible(true); }}>
            Réceptionner
          </Button>
        );
      case 'received':
        return (
          <Button type="primary" size="small" icon={<SafetyCertificateOutlined />}
            onClick={() => updateStatus(r.order_id, 'quality_pending', 'Lancer contrôle qualité')}>
            Lancer contrôle qualité
          </Button>
        );
      case 'quality_pending':
        return (
          <Button type="primary" size="small" icon={<SafetyCertificateOutlined />}
            onClick={() => openQualityControl(r.order_id)}>
            Effectuer le contrôle
          </Button>
        );
      case 'replacement_received':
        return (
          <Button type="primary" size="small" icon={<SafetyCertificateOutlined />}
            onClick={() => openQualityControl(r.order_id)}>
            Re-contrôler
          </Button>
        );
      case 'dispute':
      case 'replacement_pending':
        return (
          <Button danger size="small" icon={<WarningOutlined />}
            onClick={() => openDisputeManagement(r.order_id)}>
            Gérer le litige
          </Button>
        );
      case 'credit_note':
        return (
          <Button type="primary" size="small" icon={<CheckCircleOutlined />}
            onClick={() => updateStatus(r.order_id, 'passed', 'Valider l\'avoir')}>
            Valider l'avoir
          </Button>
        );
      case 'returned':
        return (
          <Button type="primary" size="small" icon={<InboxOutlined />}
            onClick={() => handleSimpleReceive(r.order_id)}>
            Réceptionner les nouvelles pièces
          </Button>
        );
      case 'passed':
        return <Tag color="success" icon={<CheckCircleOutlined />}>Terminée</Tag>;
      case 'cancelled':
        return <Tag color="error" icon={<DeleteOutlined />}>Annulée</Tag>;
      default:
        return <Text type="secondary" style={{ fontSize: 12 }}>{r.status}</Text>;
    }
  };

  // ── Columns ────────────────────────────────────────────────────────────────

  const columns = [
    {
      title: 'Commande',
      key: 'id',
      width: 200,
      render: (_: any, r: PurchaseOrder) => (
        <Space orientation="vertical" size={0}>
          <Text code style={{ fontSize: 11 }}>{r.order_id}</Text>
          {r.sales_order_number && (
            <Text type="secondary" style={{ fontSize: 11 }}>Achat : {r.sales_order_number}</Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Client / Fournisseur',
      key: 'parties',
      width: 200,
      render: (_: any, r: PurchaseOrder) => (
        <Space orientation="vertical" size={0}>
          <Text strong style={{ fontSize: 13 }}>Magasin</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.supplier_name ?? '—'}</Text>
        </Space>
      ),
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      width: 200,
      render: (s: PurchaseStatus) => <StatusTag status={s} />,
    },
    {
      title: 'Litige',
      key: 'litige',
      width: 120,
      render: (_: any, r: PurchaseOrder) => {
        if (r.status === 'dispute') {
          return (
            <Tooltip title={`Litige ouvert - ${r.quality_control_notes || 'En attente de résolution'}`}>
              <Tag color="red" icon={<WarningOutlined />}>
                ⚠️ Litige actif
              </Tag>
            </Tooltip>
          );
        }
        if (r.status === 'replacement_pending') {
          return (
            <Tag color="orange" icon={<TruckOutlined />}>
              📦 Attente remplacement
            </Tag>
          );
        }
        if (r.credit_note_number) {
          return (
            <Tag color="green" icon={<FileTextOutlined />}>
              Avoir: {r.credit_note_number}
            </Tag>
          );
        }
        return <Text type="secondary">—</Text>;
      }
    },
    {
      title: 'Créée le',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 100,
      render: (d: string) => new Date(d).toLocaleDateString('fr-FR'),
    },
    {
      title: 'Prochaine action',
      key: 'next_action',
      width: 220,
      render: (_: any, r: PurchaseOrder) => <NextAction record={r} />,
    },
    {
      title: '',
      key: 'detail',
      width: 100,
      render: (_: any, r: PurchaseOrder) => (
        <Space size={4}>
          <Tooltip title="Voir l'historique">
            <Button size="small" icon={<HistoryOutlined />} onClick={() => openHistory(r.order_id)} />
          </Tooltip>
          <Tooltip title="Voir les détails">
            <Button size="small" icon={<EyeOutlined />} loading={detailLoading}
              onClick={() => loadOrderDetails(r.order_id)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // ── Tabs ───────────────────────────────────────────────────────────────────

  const tabItems = TABS.map((tab) => {
    const count = orders.filter(tab.filter).length;
    return {
      key: tab.key,
      label: (
        <Space size={6}>
          {tab.icon}
          {tab.label}
          {count > 0 && <Badge count={count} size="small" />}
        </Space>
      ),
    };
  });

  const filteredOrders = orders.filter(
    TABS.find((t) => t.key === activeTab)?.filter ?? (() => true)
  );

  const kpis = [
    { title: 'Total commandes', value: orders.length },
    { title: 'À traiter', value: orders.filter(o => ['draft', 'sent', 'approved'].includes(o.status)).length },
    { title: 'Réception / Contrôle', value: orders.filter(o => ['received', 'quality_pending', 'replacement_received', 'returned'].includes(o.status)).length },
    { title: 'Litiges ouverts', value: orders.filter(o => ['dispute', 'replacement_pending'].includes(o.status)).length },
  ];

  return (
    <div style={{ padding: '0 4px' }}>
      {/* KPIs */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {kpis.map((kpi) => (
          <Col xs={12} sm={6} key={kpi.title}>
            <Card size="small" style={{ textAlign: 'center', borderRadius: 10 }}>
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 11 }}>{kpi.title}</Text>}
                value={kpi.value}
                styles={{ content: { fontSize: 22, fontWeight: 600 } }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Workflow */}
      <WorkflowDiagram />

      {/* Table */}
      <Card
        style={{ borderRadius: 12 }}
        extra={
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
              Nouvelle commande
            </Button>
            <Button icon={<ReloadOutlined />} onClick={fetchOrders} loading={loading} size="small">
              Actualiser
            </Button>
          </Space>
        }
      >
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
        <Table
          columns={columns}
          dataSource={filteredOrders}
          rowKey="order_id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 12, showSizeChanger: true, showTotal: (t) => `${t} commande(s)` }}
          style={{ marginTop: 4 }}
        />
      </Card>

      {/* Create modal */}
      <CreateOrderModal
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        onFinish={handleCreateOrder}
        products={products}
        suppliers={suppliers}
        loading={createLoading}
      />

      {/* Receive modal */}
      <ReceiveModal
        open={receiveModalVisible}
        onCancel={() => setReceiveModalVisible(false)}
        onFinish={handleReceive}
      />

      {/* Detail modal */}
      <Modal
        title={<Space><ShoppingOutlined /> Détails commande d'achat {detailOrder && <PrintButton type="purchase_order" data={buildPurchaseOrderPDFData(detailOrder)} buttonText="Imprimer" buttonType="primary" />}</Space>}
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={<Button onClick={() => setDetailVisible(false)}>Fermer</Button>}
        width={900}
      >
        {detailOrder && (
          <Tabs
            defaultActiveKey="info"
            items={[
              {
                key: 'info',
                label: '📋 Informations',
                children: (
                  <div>
                    <Descriptions bordered size="small" column={2}>
                      <Descriptions.Item label="Order ID"><Text code>{detailOrder.order_id}</Text></Descriptions.Item>
                      <Descriptions.Item label="Statut"><StatusTag status={detailOrder.status} /></Descriptions.Item>
                      <Descriptions.Item label="Fournisseur">{detailOrder.supplier_name ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="Date création">{new Date(detailOrder.created_at).toLocaleString()}</Descriptions.Item>
                      <Descriptions.Item label="Prix estimé">{detailOrder.expected_price_dh} DH</Descriptions.Item>
                      <Descriptions.Item label="Prix réel">{detailOrder.actual_price_dh ?? 'En attente'} DH</Descriptions.Item>
                    </Descriptions>
                    
                    {detailOrder.supplier_invoice_number && (
                      <>
                        <Divider />
                        <Descriptions bordered size="small" column={2}>
                          <Descriptions.Item label="N° Facture originale">
                            <Tag color="blue">{detailOrder.supplier_invoice_number}</Tag>
                          </Descriptions.Item>
                          <Descriptions.Item label="Date facture">{detailOrder.supplier_invoice_date}</Descriptions.Item>
                          <Descriptions.Item label="Montant HT">{detailOrder.supplier_invoice_amount} DH</Descriptions.Item>
                        </Descriptions>
                      </>
                    )}
                    
                    <Divider />
                    <Title level={5}>Articles commandés</Title>
                    <Table
                      dataSource={detailOrder.items || []}
                      rowKey="id"
                      pagination={false}
                      size="small"
                      columns={[
                        { title: 'Produit', dataIndex: 'name', key: 'name', render: (text: string, record: any) => record.name || record.product_name || '-' },
                        { title: 'Référence', dataIndex: 'reference', key: 'reference', width: 120 },
                        { title: 'Qté', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'center' },
                        { 
                          title: 'Prix unitaire', key: 'unit_price', width: 120, align: 'right',
                          render: (_: any, r: any) => {
                            const price = r.unit_price_cents ? (r.unit_price_cents / 100).toFixed(2) : (r.unit_price || 0);
                            return `${price} DH`;
                          }
                        },
                        { 
                          title: 'Total', key: 'total', width: 120, align: 'right',
                          render: (_: any, r: any) => {
                            const price = r.unit_price_cents ? (r.unit_price_cents / 100) : (r.unit_price || 0);
                            const total = price * (r.quantity || 1);
                            return `${total.toFixed(2)} DH`;
                          }
                        },
                      ]}
                    />
                  </div>
                )
              },
              {
                key: 'documents',
                label: '📄 Documents',
                children: (
                  <div>
                    <Card size="small" title="📄 Facture originale" style={{ marginBottom: 16 }}>
                      <Descriptions column={1} size="small">
                        <Descriptions.Item label="N° Facture">
                          <Tag color="blue">{detailOrder.supplier_invoice_number || 'Non renseignée'}</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Montant">
                          {detailOrder.supplier_invoice_amount || 0} DH
                        </Descriptions.Item>
                        <Descriptions.Item label="Date">
                          {detailOrder.supplier_invoice_date || '-'}
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>

                    {creditNotes.length > 0 && (
                      <Card size="small" title="📝 Avoir(s) émis" style={{ marginBottom: 16, background: '#fff7e6' }}>
                        {creditNotes.map((cn, i) => (
                          <div key={i} style={{ marginBottom: 12, padding: 8, background: '#fff', borderRadius: 6 }}>
                            <Row gutter={16}>
                              <Col span={8}><Tag color="orange">{cn.credit_note_number}</Tag></Col>
                              <Col span={8}><Text strong>{cn.amount_ht} DH</Text></Col>
                              <Col span={8}><Text type="secondary">{cn.reason}</Text></Col>
                            </Row>
                          </div>
                        ))}
                        <Alert type="warning" showIcon message="Document comptable" description="La facture originale reste inchangée. Cet avoir est un document séparé." />
                      </Card>
                    )}

                    {replacements.length > 0 && (
                      <Card size="small" title="🔄 Remplacement(s) SAV" style={{ background: '#f6ffed' }}>
                        {replacements.map((r, i) => (
                          <div key={i} style={{ marginBottom: 12, padding: 8, background: '#fff', borderRadius: 6 }}>
                            <Row gutter={16}>
                              <Col span={8}><Tag color="green">{r.replacement_number}</Tag></Col>
                              <Col span={8}>{r.received_at ? `Reçu le : ${new Date(r.received_at).toLocaleDateString()}` : <Tag color="orange">En attente</Tag>}</Col>
                              <Col span={8}>{r.new_invoice_number && <Text type="secondary">Facture: {r.new_invoice_number}</Text>}</Col>
                            </Row>
                          </div>
                        ))}
                      </Card>
                    )}
                  </div>
                )
              }
            ]}
          />
        )}
      </Modal>

      {/* Quality control modal */}
      <QualityControlModal
        visible={qualityControlVisible}
        orderId={qualityControlOrderId}
        orderDetails={qualityControlOrderDetails}
        onClose={() => setQualityControlVisible(false)}
        onValidate={handleValidateQuality}
        onDispute={handleDisputeQuality}
      />

      {/* Dispute modal */}
      <PurchaseDisputeModal
        visible={disputeModalVisible}
        orderId={disputeOrderId}
        orderDetails={disputeOrderDetails}
        onClose={() => setDisputeModalVisible(false)}
        onRefresh={fetchOrders}
      />

      {/* History modal */}
      <PurchaseOrderHistoryModal
        visible={historyVisible}
        orderId={historyOrderId}
        onClose={() => setHistoryVisible(false)}
      />
    </div>
  );
};

export default PurchaseOrders;