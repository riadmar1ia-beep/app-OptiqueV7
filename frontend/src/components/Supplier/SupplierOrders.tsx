import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Tag, Button, Space, Modal, message, Tooltip,
  Row, Col, Alert, Typography, Form, Input,
  InputNumber, Tabs, Descriptions, Statistic, Steps, Badge
} from 'antd';
import {
  EyeOutlined, SendOutlined, CheckCircleOutlined, DeleteOutlined,
  ShoppingOutlined, WarningOutlined,
  TruckOutlined, ShopOutlined, FileTextOutlined, ReloadOutlined,
  ArrowRightOutlined, SafetyCertificateOutlined, ExclamationCircleOutlined,
  DollarOutlined, InboxOutlined, HistoryOutlined, PrinterOutlined
} from '@ant-design/icons';
import { orderService, documentService } from '../../services/api';
import QualityControlModal from './QualityControlModal';
import DisputeManagementModal from './DisputeManagementModal';
import OrderHistoryModal from './OrderHistoryModal';
import { pdf } from '@react-pdf/renderer';


const { Text } = Typography;

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus =
  | 'shipped'
  | 'approved'
  | 'received'
  | 'quality_pending'
  | 'passed'
  | 'dispute'
  | 'replacement_pending'
  | 'replacement_received'
  | 'credit_note'
  | 'cancelled';

interface SupplierOrder {
  id?: string;
  order_id: string;
  status: OrderStatus;
  created_at: string;
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
}

interface EyeConfig {
  type: string;
  index: string;
  material: string;
  coatings: string[];
  sphere?: number;
  cylinder?: number;
  axis?: number;
  addition?: number;
}

interface OrderDetail extends SupplierOrder {
  customer_email?: string;
  has_right_eye: boolean;
  has_left_eye: boolean;
  right_eye_config: EyeConfig | null;
  left_eye_config: EyeConfig | null;
  client_price_dh?: string;
  client_items?: any[];
}

// ─── Status config ────────────────────────────────────────────────────────────

interface StatusCfg {
  color: string;
  label: string;
  icon: React.ReactNode;
  step: number;
}

const STATUS_CFG: Record<string, StatusCfg> = {
  shipped:              { color: 'blue',       label: 'Envoyé au fournisseur',  icon: <SendOutlined />,                step: 0 },
  approved:             { color: 'cyan',       label: 'Approuvé',               icon: <CheckCircleOutlined />,         step: 1 },
  received:             { color: 'orange',     label: 'Reçu en magasin',        icon: <ShopOutlined />,                step: 2 },
  quality_pending:      { color: 'processing', label: 'Contrôle qualité',       icon: <SafetyCertificateOutlined />,   step: 3 },
  passed:               { color: 'success',    label: 'Conforme ✓',             icon: <CheckCircleOutlined />,         step: 4 },
  dispute:              { color: 'error',      label: 'Litige ouvert',          icon: <ExclamationCircleOutlined />,   step: 3 },
  replacement_pending:  { color: 'warning',    label: 'Attente remplacement',   icon: <TruckOutlined />,               step: 3 },
  replacement_received: { color: 'processing', label: 'Remplacement reçu',      icon: <InboxOutlined />,               step: 3 },
  credit_note:          { color: 'warning',    label: 'Avoir demandé',          icon: <FileTextOutlined />,            step: 4 },
  cancelled:            { color: 'error',      label: 'Annulé',                 icon: <DeleteOutlined />,              step: -1 },
};

function StatusTag({ status }: { status: string }) {
  const cfg = STATUS_CFG[status];
  if (!cfg) return <Tag>{status ?? '—'}</Tag>;
  return <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>;
}

// ─── Workflow pipeline display ─────────────────────────────────────────────────

const PIPELINE_STEPS = [
  { key: 'shipped',         label: 'Envoyé',    icon: <SendOutlined /> },
  { key: 'approved',        label: 'Approuvé',  icon: <CheckCircleOutlined /> },
  { key: 'received',        label: 'Reçu',      icon: <ShopOutlined /> },
  { key: 'quality_pending', label: 'Contrôle',  icon: <SafetyCertificateOutlined /> },
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
        Flux de traitement — Verres personnalisés
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
            {i < PIPELINE_STEPS.length - 1 ? (
              <ArrowRightOutlined style={{ color: '#8c8c8c', fontSize: 11 }} />
            ) : (
              <ArrowRightOutlined style={{ color: '#8c8c8c', fontSize: 11 }} />
            )}
          </React.Fragment>
        ))}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
  filter: (o: SupplierOrder) => boolean;
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
    filter: (o) => ['shipped', 'approved'].includes(o.status),
  },
  {
    key: 'reception',
    label: 'Réception / Contrôle',
    icon: <InboxOutlined />,
    filter: (o) => ['received', 'quality_pending', 'replacement_received'].includes(o.status),
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Order timeline ────────────────────────────────────────────────────────────

function OrderTimeline({ order }: { order: OrderDetail }) {
  const mainSteps = ['shipped', 'approved', 'received', 'quality_pending'];
  const currentStep = mainSteps.indexOf(order.status);
  const isTerminal = ['passed', 'credit_note', 'cancelled'].includes(order.status);
  const isDispute = ['dispute', 'replacement_pending', 'replacement_received'].includes(order.status);

  return (
    <div style={{ marginBottom: 20 }}>
      <Steps
        size="small"
        current={isTerminal ? mainSteps.length : currentStep}
        status={isDispute ? 'error' : undefined}
        items={[
          { title: 'Envoyé',    icon: <SendOutlined /> },
          { title: 'Approuvé',  icon: <CheckCircleOutlined /> },
          { title: 'Reçu',      icon: <ShopOutlined /> },
          { title: 'Contrôle',  icon: <SafetyCertificateOutlined /> },
          {
            title: order.status === 'credit_note' ? 'Avoir' : isDispute ? 'Litige' : 'Conforme',
            icon: order.status === 'credit_note'
              ? <FileTextOutlined />
              : isDispute ? <ExclamationCircleOutlined />
              : <CheckCircleOutlined />,
            status: isDispute ? 'error' : order.status === 'passed' || order.status === 'credit_note' ? 'finish' : 'wait',
          },
        ]}
      />
      {isDispute && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#fff2f0', borderRadius: 8, border: '1px solid #ffccc7' }}>
          <Space>
            <WarningOutlined style={{ color: '#ff4d4f' }} />
            <Text style={{ color: '#cf1322', fontSize: 13 }}>
              {order.status === 'dispute' && 'Litige ouvert — en attente de résolution fournisseur'}
              {order.status === 'replacement_pending' && 'Attente du remplacement par le fournisseur'}
              {order.status === 'replacement_received' && 'Remplacement reçu — contrôle qualité à effectuer'}
            </Text>
          </Space>
        </div>
      )}
    </div>
  );
}

// ─── Receive form modal avec calcul auto TTC ────────────────────────────────

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
            <Form.Item name="invoice_number" label="N° Facture"
              rules={[{ required: true, message: 'Champ obligatoire' }]}>
              <Input prefix={<FileTextOutlined />} placeholder="FAC-2025-001" />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="invoice_date" label="Date facture"
              rules={[{ required: true, message: 'Champ obligatoire' }]}>
              <Input type="date" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="amount_ht" label="Montant HT (DH)"
              rules={[{ required: true, message: 'Champ obligatoire' }]}
              tooltip="Prix d'achat réel hors taxes">
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
            <Form.Item name="amount_tva" label="TVA (%)" initialValue={20}
              tooltip="Taux de TVA applicable">
              <InputNumber
                min={0}
                max={100}
                style={{ width: '100%' }}
                onChange={handleTvaChange}
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="amount_ttc" label="Montant TTC (DH)"
          tooltip="Calculé automatiquement à partir du HT et TVA">
          <InputNumber 
            min={0} 
            step={10} 
            style={{ width: '100%' }} 
            placeholder="Calculé automatiquement"
            disabled
          />
        </Form.Item>
        <Form.Item name="notes" label="Notes internes">
          <Input.TextArea rows={2} placeholder="Notes optionnelles…" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block size="large"
          icon={<CheckCircleOutlined />} loading={loading}>
          Valider la réception
        </Button>
      </Form>
    </Modal>
  );
}

// ─── Eye config ────────────────────────────────────────────────────────────────

function EyeDescription({ config, label }: { config: EyeConfig | null; label: string }) {
  if (!config) return <Alert title={`${label} — Non commandé`} type="info" showIcon />;
  return (
    <Descriptions bordered size="small" column={2}>
      <Descriptions.Item label="Type">{config.type}</Descriptions.Item>
      <Descriptions.Item label="Indice">{config.index}</Descriptions.Item>
      <Descriptions.Item label="Matériau">{config.material}</Descriptions.Item>
      <Descriptions.Item label="Traitements">
        <Space wrap>
          {config.coatings?.length
            ? config.coatings.map((c) => <Tag key={c} color="cyan">{c}</Tag>)
            : <Text type="secondary">Aucun</Text>}
        </Space>
      </Descriptions.Item>
      <Descriptions.Item label="Sphère">{config.sphere ?? 0}</Descriptions.Item>
      <Descriptions.Item label="Cylindre">{config.cylinder ?? 0}</Descriptions.Item>
      <Descriptions.Item label="Axe">{config.axis ?? 0}°</Descriptions.Item>
      {config.addition !== undefined && (
        <Descriptions.Item label="Addition" span={2}>{config.addition}</Descriptions.Item>
      )}
    </Descriptions>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

const SupplierOrders: React.FC = () => {
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  const [detailOrder, setDetailOrder] = useState<OrderDetail | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailEyeTab, setDetailEyeTab] = useState('right');

  const [receiveVisible, setReceiveVisible] = useState(false);
  const [receiveOrderId, setReceiveOrderId] = useState('');

  const [qualityVisible, setQualityVisible] = useState(false);
  const [qualityOrderId, setQualityOrderId] = useState('');
  const [qualityOrderDetails, setQualityOrderDetails] = useState<any>(null);

  const [disputeVisible, setDisputeVisible] = useState(false);
  const [disputeOrderId, setDisputeOrderId] = useState('');
  const [disputeOrderDetails, setDisputeOrderDetails] = useState<any>(null);
  
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyOrderId, setHistoryOrderId] = useState('');

  const [printLoading, setPrintLoading] = useState(false);

  const printLabOrder = async (supplierOrderId: string) => {
    setPrintLoading(true);
    try {
      console.log('🖨️ Impression bon fournisseur pour ID:', supplierOrderId);
      
      const response = await documentService.getSupplierOrderData(supplierOrderId);
      
      const { data, settings } = response.data;
      
      const { default: LabOrderPDF } = await import('../Documents/PDF/LabOrderPDF');
      const pdfComponent = <LabOrderPDF data={data} settings={settings} />;
      
      const blob = await pdf(pdfComponent).toBlob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('❌ Erreur génération bon fournisseur:', error);
      message.error('Erreur lors de la génération du PDF');
    } finally {
      setPrintLoading(false);
    }
  };



  // ── Data ───────────────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await orderService.getSupplierOrders();
      setOrders(res.data.data);
    } catch {
      message.error('Erreur lors du chargement des commandes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const updateStatus = async (orderId: string, newStatus: string, label: string) => {
    const ok = await confirmAction(
      `Confirmer : ${label}`,
      `Passer la commande au statut « ${label} » ?`
    );
    if (!ok) return;
    try {
      await orderService.updateSupplierOrderStatus(orderId, newStatus);
      message.success(`✅ ${label}`);
      fetchOrders();
    } catch {
      message.error(`Erreur : ${label}`);
    }
  };

  const loadOrderDetails = async (orderId: string) => {
    setDetailLoading(true);
    try {
      const res = await orderService.getSupplierOrderDetails(orderId);
      const d = res.data.data;
      const clientTotal = (d.client_items ?? []).reduce(
        (s: number, i: any) => s + (i.client_total_ttc_cents ?? 0), 0
      );
      setDetailOrder({
        ...d,
        client_price_dh: (clientTotal / 100).toFixed(2),
        expected_price_dh: ((d.expected_price_cents ?? 0) / 100).toFixed(2),
        actual_price_dh: ((d.actual_price_cents ?? 0) / 100).toFixed(2),
      });
      setDetailVisible(true);
    } catch {
      message.error('Erreur lors du chargement des détails');
    } finally {
      setDetailLoading(false);
    }
  };

  const openHistory = (orderId: string) => {
    setHistoryOrderId(orderId);
    setHistoryVisible(true);
  };

  const handleReceive = async (values: any) => {
    const ht = values.amount_ht ?? 0;
    const tva = values.amount_tva ?? 20;
    const ttc = values.amount_ttc ?? ht * (1 + tva / 100);
    
    const ok = await confirmAction(
      'Confirmer la réception',
      <ul style={{ paddingLeft: 16 }}>
        <li><b>N° Facture :</b> {values.invoice_number}</li>
        <li><b>Date :</b> {values.invoice_date}</li>
        <li><b>Montant HT :</b> {ht} DH</li>
        <li><b>TVA :</b> {tva}%</li>
        <li><b>Montant TTC :</b> {ttc.toFixed(2)} DH</li>
      </ul>
    );
    if (!ok) return;
    
    try {
      const res = await orderService.receiveOrder(receiveOrderId, {
        invoice_number: values.invoice_number,
        invoice_date: values.invoice_date,
        amount_ht: ht,
        amount_tva: tva,
        amount_ttc: ttc,
        notes: values.notes,
      });
      message.success(res.data.message ?? 'Réception enregistrée');
      fetchOrders();
      setReceiveVisible(false);
    } catch (error: any) {
      console.error('Erreur réception:', error);
      message.error(error.response?.data?.error || 'Erreur lors de la réception');
    }
  };

  const openQualityControl = async (orderId: string) => {
    setQualityOrderId(orderId);
    try {
      const res = await orderService.getSupplierOrderDetails(orderId);
      setQualityOrderDetails(res.data.data);
      setQualityVisible(true);
    } catch {
      message.error('Erreur chargement détails');
    }
  };

  const openDisputeManagement = async (orderId: string) => {
    setDisputeOrderId(orderId);
    try {
      const res = await orderService.getSupplierOrderDetails(orderId);
      setDisputeOrderDetails(res.data.data);
      setDisputeVisible(true);
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
          await orderService.validateOrder(orderId, notes);
          message.success('Commande validée — Conforme ✅');
          fetchOrders();
          setQualityVisible(false);
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
          await orderService.disputeOrder(orderId, issues, notes);
          message.warning('Litige signalé ⚠️');
          fetchOrders();
          setQualityVisible(false);
        } catch {
          message.error('Erreur lors du signalement');
        }
      },
    });
  };

  // ── Prochaine action (CTA principal) ──────────────────────────────────────

  const NextAction = ({ record: r }: { record: SupplierOrder }) => {
    switch (r.status) {
      case 'shipped':
        return (
          <Button size="small" icon={<CheckCircleOutlined />}
            onClick={() => updateStatus(r.order_id, 'approved', 'Marquer approuvé')}>
            Marquer approuvé
          </Button>
        );
      case 'approved':
        return (
          <Button type="primary" size="small" icon={<InboxOutlined />}
            onClick={() => { setReceiveOrderId(r.order_id); setReceiveVisible(true); }}>
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
      case 'passed':
        return <Tag color="success" icon={<CheckCircleOutlined />}>Terminée</Tag>;
      
      case 'credit_note':
        return (
         <Button type="primary" size="small" icon={<CheckCircleOutlined />}
           onClick={() => updateStatus(r.order_id, 'validated', 'Valider l\'avoir')}>
           Valider l'avoir
         </Button>
        );      
      case 'cancelled':
        return <Tag color="error" icon={<DeleteOutlined />}>Annulée</Tag>;
      default:
        return <Text type="secondary" style={{ fontSize: 12 }}>{r.status}</Text>;
    }
  };

  const SecondaryActions = ({ record: r }: { record: SupplierOrder }) => (
  <Space size={4}>
    <Tooltip title="Voir l'historique">
      <Button size="small" icon={<HistoryOutlined />} onClick={() => openHistory(r.order_id)} />
    </Tooltip>
    <Tooltip title="Voir les détails">
      <Button size="small" icon={<EyeOutlined />} loading={detailLoading}
        onClick={() => loadOrderDetails(r.order_id)} />
    </Tooltip>
  </Space>
);

  // ── Columns ────────────────────────────────────────────────────────────────

  const columns = [
    {
      title: 'Commande',
      key: 'id',
      width: 200,
      render: (_: any, r: SupplierOrder) => (
        <Space orientation="vertical" size={0}>
          <Text code style={{ fontSize: 11 }}>{r.order_id}</Text>
          {r.sales_order_number && (
            <Text type="secondary" style={{ fontSize: 11 }}>Client : {r.sales_order_number}</Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Client / Fournisseur',
      key: 'parties',
      width: 200,
      render: (_: any, r: SupplierOrder) => (
        <Space orientation="vertical" size={0}>
          <Text strong style={{ fontSize: 13 }}>{r.customer_name ?? '—'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.supplier_name ?? '—'}</Text>
        </Space>
      ),
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      width: 200,
      render: (s: string) => <StatusTag status={s} />,
    },
    {
      title: 'Litige',
      key: 'litige',
      width: 120,
      render: (_: any, r: SupplierOrder) => {
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
      render: (_: any, r: SupplierOrder) => <NextAction record={r} />,
    },
    {
      title: '',
      key: 'detail',
      width: 120,
      render: (_: any, r: SupplierOrder) => <SecondaryActions record={r} />,
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

  // ── KPIs ───────────────────────────────────────────────────────────────────

  const kpis = [
    { title: 'Total commandes', value: orders.length },
    { title: 'À traiter', value: orders.filter(o => ['shipped','approved'].includes(o.status)).length },
    { title: 'Réception / Contrôle', value: orders.filter(o => ['received','quality_pending','replacement_received'].includes(o.status)).length },
    { title: 'Litiges actifs', value: orders.filter(o => o.status === 'dispute').length },
    { title: 'Attente remplacement', value: orders.filter(o => o.status === 'replacement_pending').length },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

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

      {/* Résumé des litiges actifs */}
      {orders.filter(o => o.status === 'dispute').length > 0 && (
        <Card 
          size="small" 
          style={{ 
            marginBottom: 16, 
            background: '#fff2f0', 
            borderColor: '#ffccc7',
            borderRadius: 8
          }}
        >
          <Space orientation="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <WarningOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
                <Text strong style={{ color: '#cf1322' }}>
                  ⚠️ {orders.filter(o => o.status === 'dispute').length} commande(s) en litige
                </Text>
              </Space>
              <Button 
                size="small" 
                type="link" 
                onClick={() => setActiveTab('disputes')}
                icon={<ArrowRightOutlined />}
              >
                Voir les litiges
              </Button>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
              {orders.filter(o => o.status === 'dispute').slice(0, 3).map(order => (
                <Tag 
                  key={order.order_id} 
                  color="red" 
                  style={{ cursor: 'pointer' }}
                  onClick={() => openDisputeManagement(order.order_id)}
                >
                  {order.order_id.slice(-8)} - {order.customer_name}
                </Tag>
              ))}
              {orders.filter(o => o.status === 'dispute').length > 3 && (
                <Text type="secondary">+{orders.filter(o => o.status === 'dispute').length - 3} autre(s)</Text>
              )}
            </div>
          </Space>
        </Card>
      )}

      {/* Workflow */}
      <WorkflowDiagram />

      {/* Table */}
      <Card
        style={{ borderRadius: 12 }}
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchOrders} loading={loading} size="small">
            Actualiser
          </Button>
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

      {/* Detail modal */}
      <Modal
        title={
          <Space>
            <ShoppingOutlined style={{ color: '#1890ff' }} />
            Détails de la commande fournisseur
            {detailOrder && <StatusTag status={detailOrder.status} />}
            {detailOrder && (
              <Space style={{ marginLeft: 16 }}>
                <Button 
                  size="small" 
                  icon={<HistoryOutlined />}
                  onClick={() => openHistory(detailOrder.order_id)}
                >
                  Historique
                </Button>
                <Button 
                  size="small" 
                  type="primary"
                  icon={<PrinterOutlined />}
                  loading={printLoading}
                  onClick={() => detailOrder.id && printLabOrder(detailOrder.id)}
                >
                  Imprimer le bon
                </Button>
              </Space>
            )}
          </Space>
        }
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={<Button onClick={() => setDetailVisible(false)}>Fermer</Button>}
        width={960}
        styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
      >
        {detailOrder && (
          <div>
            <OrderTimeline order={detailOrder} />
            <Card size="small" title="Informations générales" style={{ marginBottom: 12 }}>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="Order ID"><Text code>{detailOrder.order_id}</Text></Descriptions.Item>
                <Descriptions.Item label="Date">{new Date(detailOrder.created_at).toLocaleString('fr-FR')}</Descriptions.Item>
                <Descriptions.Item label="Client">{detailOrder.customer_name ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Téléphone">{detailOrder.customer_phone ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Fournisseur">{detailOrder.supplier_name ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Commande client">{detailOrder.sales_order_number ?? '—'}</Descriptions.Item>
              </Descriptions>
            </Card>
            {detailOrder.supplier_invoice_number && (
              <Card size="small" title="Facture fournisseur" style={{ marginBottom: 12 }}>
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="N° Facture">{detailOrder.supplier_invoice_number}</Descriptions.Item>
                  <Descriptions.Item label="Date">
                    {detailOrder.supplier_invoice_date
                      ? new Date(detailOrder.supplier_invoice_date).toLocaleDateString('fr-FR')
                      : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Montant HT">{detailOrder.supplier_invoice_amount} DH</Descriptions.Item>
                  <Descriptions.Item label="Montant TTC">{detailOrder.actual_price_dh} DH</Descriptions.Item>
                </Descriptions>
              </Card>
            )}
            <Card size="small" title={<Space><DollarOutlined /> Financier</Space>} style={{ marginBottom: 12 }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title="Prix vente client (TTC)"
                    value={detailOrder.client_price_dh ?? '0.00'}
                    suffix="DH"
                    styles={{ content: { color: '#1890ff', fontSize: 20 } }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Prix achat fournisseur"
                    value={detailOrder.actual_price_cents ? detailOrder.actual_price_dh! : 'En attente'}
                    suffix={detailOrder.actual_price_cents ? 'DH' : ''}
                    styles={{ content: { color: detailOrder.actual_price_cents ? '#52c41a' : '#faad14', fontSize: 20 } }}
                  />
                </Col>
                {detailOrder.actual_price_cents ? (
                  <Col span={8}>
                    <Statistic
                      title="Marge brute"
                      value={(() => {
                        const client = parseFloat(detailOrder.client_price_dh ?? '0');
                        const supplier = parseFloat(detailOrder.actual_price_dh ?? '0');
                        const margin = client - supplier;
                        const pct = supplier > 0 ? ((margin / supplier) * 100).toFixed(1) : 0;
                        return `${margin.toFixed(2)} DH (${pct}%)`;
                      })()}
                      styles={{ content: { color: '#52c41a', fontSize: 18 } }}
                    />
                  </Col>
                ) : null}
              </Row>
            </Card>
            <Card size="small" title="👓 Verres commandés">
              <Tabs
                activeKey={detailEyeTab}
                onChange={setDetailEyeTab}
                items={[
                  {
                    key: 'right',
                    label: <Space><EyeOutlined /> Œil Droit (OD)</Space>,
                    children: <EyeDescription config={detailOrder.right_eye_config} label="Œil droit" />,
                  },
                  {
                    key: 'left',
                    label: <Space><EyeOutlined /> Œil Gauche (OG)</Space>,
                    children: <EyeDescription config={detailOrder.left_eye_config} label="Œil gauche" />,
                  },
                ]}
              />
            </Card>
          </div>
        )}
      </Modal>

      {/* Receive modal */}
      <ReceiveModal
        open={receiveVisible}
        onCancel={() => setReceiveVisible(false)}
        onFinish={handleReceive}
      />

      {/* Quality control modal */}
      <QualityControlModal
        visible={qualityVisible}
        orderId={qualityOrderId}
        orderDetails={qualityOrderDetails}
        onClose={() => setQualityVisible(false)}
        onValidate={handleValidateQuality}
        onDispute={handleDisputeQuality}
      />

      {/* Dispute modal */}
      <DisputeManagementModal
        visible={disputeVisible}
        orderId={disputeOrderId}
        orderDetails={disputeOrderDetails}
        onClose={() => setDisputeVisible(false)}
        onRefresh={fetchOrders}
      />

      {/* Order History Modal */}
      <OrderHistoryModal
        visible={historyVisible}
        orderId={historyOrderId}
        onClose={() => setHistoryVisible(false)}
      />
    </div>
  );
};

export default SupplierOrders;