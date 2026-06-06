// frontend/src/components/PurchaseOrders/PurchaseDisputeModal.tsx
import React, { useState, useEffect } from 'react';
import {
  Modal, Form, Input, Button, Space, Tag, Card, Row, Col,
  Typography, Divider, Alert, message,
  Descriptions, Popconfirm, Tabs, Badge, InputNumber, Statistic
} from 'antd';
import {
  WarningOutlined, CheckCircleOutlined, TruckOutlined,
  FileTextOutlined, DeleteOutlined,
  MailOutlined, PhoneOutlined, DollarOutlined, HistoryOutlined
} from '@ant-design/icons';
import { purchaseOrderService } from '../../services/api';
import PurchaseOrderHistoryModal from './PurchaseOrderHistoryModal';

const { Text } = Typography;

interface PurchaseDisputeModalProps {
  visible: boolean;
  orderId: string;
  orderDetails: any;
  onClose: () => void;
  onRefresh: () => void;
}

const PurchaseDisputeModal: React.FC<PurchaseDisputeModalProps> = ({
  visible,
  orderId,
  orderDetails,
  onClose,
  onRefresh
}) => {
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [activeTab, setActiveTab] = useState('details');
  const [historyVisible, setHistoryVisible] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  
  const isDisputeActive = orderDetails?.status === 'dispute';
  
  const [creditNoteNumber, setCreditNoteNumber] = useState('');
  const [creditNoteAmount, setCreditNoteAmount] = useState<number | null>(null);
  const [creditNoteDate, setCreditNoteDate] = useState('');
  
  // États pour le calcul TTC
  const [amountHt, setAmountHt] = useState<number | null>(null);
  const [tvaRate, setTvaRate] = useState<number>(20);
  const [amountTtc, setAmountTtc] = useState<number | null>(null);

  useEffect(() => {
    if (visible && orderId) {
      if (orderDetails?.credit_note_number) {
        setCreditNoteNumber(orderDetails.credit_note_number);
        setCreditNoteAmount(orderDetails.credit_note_amount_cents ? orderDetails.credit_note_amount_cents / 100 : null);
        setCreditNoteDate(orderDetails.credit_note_date?.split('T')[0] || '');
      }
      fetchEvents();
    }
  }, [visible, orderId, orderDetails]);

  // Calcul automatique du TTC
  useEffect(() => {
    if (amountHt !== null && amountHt > 0 && tvaRate > 0) {
      const ttc = amountHt * (1 + tvaRate / 100);
      setAmountTtc(Math.round(ttc * 100) / 100);
    } else if (amountHt !== null && amountHt > 0) {
      setAmountTtc(amountHt);
    } else {
      setAmountTtc(null);
    }
  }, [amountHt, tvaRate]);

  // Helper pour convertir en nombre
  const toNumber = (value: any): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseFloat(value) || 0;
    return 0;
  };

  // ✅ Récupérer les événements et le résumé financier
  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await purchaseOrderService.getPurchaseOrderEvents(orderId);
      console.log('=== FRONTEND RECEPTION ===');
      console.log('orderId:', orderId);
      console.log('API Response:', res);
      console.log('Events count:', res.data?.data?.length);
      console.log('First event:', res.data?.data?.[0]);
      setEvents(res.data?.data || []);

      // Fetch financial summary
      const summaryRes = await purchaseOrderService.getPurchaseOrderSummary(orderId);
      setSummary(summaryRes.data?.data);
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Enregistrer un avoir (avec calcul TTC)
  const handleRequestCreditNote = async () => {
    if (!creditNoteNumber) {
      message.error('Veuillez saisir le numéro de l\'avoir');
      return;
    }
    if (!amountHt || amountHt <= 0) {
      message.error('Veuillez saisir un montant HT valide');
      return;
    }

    const invoiceAmount = toNumber(summary?.invoice_total);
    if (amountHt > invoiceAmount) {
      message.error(`Le montant HT de l'avoir (${amountHt} DH) ne peut pas dépasser le montant de la facture (${invoiceAmount} DH)`);
      return;
    }

    setLoading(true);
    try {
      await purchaseOrderService.requestPurchaseCreditNote(orderId, {
        credit_note_number: creditNoteNumber,
        amount_ht: amountHt,
        amount_ttc: amountTtc,
        tva_rate: tvaRate,
        credit_note_date: creditNoteDate,
        notes: notes
      });
      
      const remaining = invoiceAmount - amountHt;
      
      if (remaining === 0) {
        message.success(`✅ Avoir ${creditNoteNumber} enregistré - Solde = 0 DH`);
      } else if (remaining > 0) {
        message.warning(`⚠️ Avoir partiel - Solde restant : ${remaining.toFixed(2)} DH`);
      }
      
      // Rafraîchir les données
      await fetchEvents();
      onRefresh();
      onClose();
    } catch (error: any) {
      console.error('Erreur:', error);
      message.error(error.response?.data?.error || 'Erreur lors de la demande d\'avoir');
    } finally {
      setLoading(false);
    }
  };

  // ✅ Valider après avoir complet
  const handleValidateAfterCreditNote = async () => {
    if (!summary) {
      message.error('Résumé financier non chargé');
      return;
    }
    const invoiceAmount = summary.invoice_total ?? 0;
    const creditAmount = amountHt ?? 0;
    const remaining = invoiceAmount - creditAmount;
    
    if (remaining > 0) {
      Modal.warning({
        title: 'Avoir incomplet',
        content: (
          <div>
            <p>Facture : <strong>{invoiceAmount.toFixed(2)} DH</strong></p>
            <p>Avoir : <strong>{creditAmount.toFixed(2)} DH</strong></p>
            <p style={{ color: '#ff4d4f' }}>Solde restant : <strong>{remaining.toFixed(2)} DH</strong></p>
            <Divider />
            <p>Veuillez demander un avoir complémentaire avant validation.</p>
          </div>
        ),
        okText: 'OK',
      });
      return;
    }
    
    Modal.confirm({
      title: 'Valider la commande avec avoir',
      content: (
        <div>
          <p><strong>Avoir n° {creditNoteNumber}</strong></p>
          <p>Montant : {creditAmount.toFixed(2)} DH</p>
          <p style={{ color: '#52c41a' }}>💰 Solde final = 0 DH - Rien à payer</p>
        </div>
      ),
      okText: 'Oui, valider',
      cancelText: 'Annuler',
      onOk: async () => {
        setLoading(true);
        try {
          await purchaseOrderService.updatePurchaseOrderStatus(orderId, 'passed');
          message.success('✅ Commande validée - Avoir appliqué - Rien à payer');
          onRefresh();
          onClose();
        } catch (error) {
          message.error('Erreur lors de la validation');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  // ✅ Résoudre le litige (commande validée)
  const handleResolveDispute = async () => {
    setLoading(true);
    try {
      await purchaseOrderService.updatePurchaseOrderStatus(orderId, 'passed');
      message.success('✅ Litige résolu - Commande validée');
      onRefresh();
      onClose();
    } catch (error) {
      console.error('Erreur:', error);
      message.error('❌ Erreur lors de la résolution');
    } finally {
      setLoading(false);
    }
  };

  // 📦 Retour au fournisseur
  const handleReturnToSupplier = async () => {
    setLoading(true);
    try {
      await purchaseOrderService.updatePurchaseOrderStatus(orderId, 'replacement_pending');
      message.success('📦 Demande de remplacement envoyée au fournisseur');
      onRefresh();
      onClose();
    } catch (error) {
      console.error('Erreur:', error);
      message.error('❌ Erreur lors de la demande de remplacement');
    } finally {
      setLoading(false);
    }
  };

  // ❌ Annuler la commande
  const handleCancelOrder = async () => {
    setLoading(true);
    try {
      await purchaseOrderService.updatePurchaseOrderStatus(orderId, 'cancelled');
      message.warning('Commande annulée définitivement');
      onRefresh();
      onClose();
    } catch (error) {
      console.error('Erreur:', error);
      message.error('Erreur lors de l\'annulation');
    } finally {
      setLoading(false);
    }
  };

  const isReplacementPending = orderDetails?.status === 'replacement_pending';
  const isCreditNoteComplete = summary?.remaining === 0 && summary?.total_credit_ht > 0 && creditNoteNumber && creditNoteAmount;

  const tabItems = [
    {
      key: 'details',
      label: '📋 Détails du litige',
      children: (
        <div>
          {isDisputeActive && (
            <Alert
              type="error"
              icon={<WarningOutlined />}
              message="⚠️ COMMANDE EN LITIGE"
              description="Litige ouvert - En attente de résolution"
              style={{ marginBottom: 16 }}
              showIcon
            />
          )}
          
          {isReplacementPending && (
            <Alert
              type="warning"
              icon={<TruckOutlined />}
              message="📦 ATTENTE REMPLACEMENT"
              description="Le fournisseur a été informé - En attente des pièces de remplacement"
              style={{ marginBottom: 16 }}
              showIcon
            />
          )}

          <Card size="small" style={{ marginBottom: 16 }}>
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="Commande">{orderId}</Descriptions.Item>
              <Descriptions.Item label="Client">{orderDetails?.customer_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Fournisseur">{orderDetails?.supplier_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Statut">
                {isDisputeActive ? (
                  <Tag color="red" icon={<WarningOutlined />}>Litige ouvert</Tag>
                ) : isReplacementPending ? (
                  <Tag color="orange" icon={<TruckOutlined />}>Attente remplacement</Tag>
                ) : (
                  <Tag color="warning">En cours</Tag>
                )}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {summary && summary.invoice_total > 0 && (
            <Card size="small" title="💰 Situation comptable" style={{ marginBottom: 16, background: '#f6ffed' }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title="Facture originale"
                    value={summary.invoice_total?.toFixed(2)}
                    suffix="DH"
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Total avoirs"
                    value={summary.total_credit_ht?.toFixed(2)}
                    suffix="DH"
                    valueStyle={{ color: summary.total_credit_ht > 0 ? '#52c41a' : '#faad14' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Solde restant"
                    value={summary.remaining?.toFixed(2)}
                    suffix="DH"
                    valueStyle={{ color: summary.remaining === 0 ? '#52c41a' : '#ff4d4f' }}
                  />
                </Col>
              </Row>
              <Divider style={{ margin: '12px 0' }} />
              <div style={{ textAlign: 'center' }}>
                {summary.is_settled ? (
                  <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 14, padding: '4px 12px' }}>
                    ✅ Rien à payer - Solde = 0 DH
                  </Tag>
                ) : summary.remaining > 0 ? (
                  <Tag color="warning" icon={<WarningOutlined />} style={{ fontSize: 14, padding: '4px 12px' }}>
                    ⚠️ Solde restant : {summary.remaining?.toFixed(2)} DH
                  </Tag>
                ) : (
                  <Text type="secondary">Aucun avoir enregistré</Text>
                )}
              </div>
            </Card>
          )}
        </div>
      )
    },
 {
  key: 'credit_note',
  label: '📝 Avoir fournisseur',
  children: (
    <div>
      <Alert
        type="info"
        showIcon
        message="Enregistrement d'un avoir"
        description="Renseignez les informations de l'avoir reçu du fournisseur"
        style={{ marginBottom: 16 }}
      />
      
      <Card size="small" style={{ background: '#fafafa' }}>
        <Form layout="vertical">
          <Form.Item label="N° Avoir" required>
            <Input
              placeholder="AV-2025-001"
              value={creditNoteNumber}
              onChange={(e) => setCreditNoteNumber(e.target.value)}
              prefix={<FileTextOutlined />}
            />
          </Form.Item>
          
          <Form.Item label="Date de l'avoir">
            <Input
              type="date"
              value={creditNoteDate}
              onChange={(e) => setCreditNoteDate(e.target.value)}
            />
          </Form.Item>
          
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Montant HT" required>
                <InputNumber
                  min={0}
                  max={summary?.invoice_total}
                  step={10}
                  style={{ width: '100%' }}
                  value={amountHt}
                  onChange={(v) => setAmountHt(v)}
                  placeholder="0.00"
                  formatter={(value) => `${value} DH`}
                  parser={(value) => Number(value?.replace(' DH', '') || 0)}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="TVA (%)">
                <InputNumber
                  min={0}
                  max={100}
                  defaultValue={20}
                  style={{ width: '100%' }}
                  value={tvaRate}
                  onChange={(v) => setTvaRate(v || 0)}
                  placeholder="20"
                  formatter={(value) => `${value}%`}
                  parser={(value) => Number(value?.replace('%', '') || 0)}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Montant TTC">
            <InputNumber
              style={{ width: '100%' }}
              value={amountTtc}
              disabled
              placeholder="Calculé automatiquement"
              formatter={(value) => `${value} DH`}
            />
          </Form.Item>
          
          {/* Aperçu après avoir - CORRIGÉ */}
          {summary && summary.invoice_total > 0 && amountHt && amountHt > 0 && (
            <Card size="small" style={{ background: '#f5f5f5', marginBottom: 12 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Text type="secondary">Facture originale</Text>
                  <div style={{ fontSize: 16, fontWeight: 'bold', color: '#1890ff' }}>
                    {summary.invoice_total.toFixed(2)} DH
                  </div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Solde après avoir</Text>
                  <div style={{ 
                    fontSize: 16, 
                    fontWeight: 'bold', 
                    color: (summary.invoice_total - amountHt) <= 0 ? '#52c41a' : '#ff4d4f' 
                  }}>
                    {Math.max(summary.invoice_total - amountHt, 0).toFixed(2)} DH
                  </div>
                </Col>
              </Row>
              {(summary.invoice_total - amountHt) <= 0 && (
                <div style={{ marginTop: 8 }}>
                  <Tag color="success" icon={<CheckCircleOutlined />}>
                    ✅ Solde entièrement couvert
                  </Tag>
                </div>
              )}
            </Card>
          )}
          
          <Form.Item label="Notes">
            <Input.TextArea
              rows={2}
              placeholder="Motif, référence, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Form.Item>
        </Form>
        
        <Divider />
        
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button
            type="primary"
            icon={<FileTextOutlined />}
            onClick={handleRequestCreditNote}
            loading={loading}
            block
          >
            Enregistrer l'avoir
          </Button>
          
          {isCreditNoteComplete && (
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleValidateAfterCreditNote}
              loading={loading}
              block
              style={{ background: '#52c41a' }}
            >
              ✅ Valider la commande - Rien à payer
            </Button>
          )}
        </Space>
      </Card>
    </div>
  )
},
    {
      key: 'actions',
      label: '⚡ Autres actions',
      children: (
        <div>
          <Alert
            type="info"
            showIcon
            message="Actions alternatives"
            description="Si l'avoir n'est pas la solution adaptée"
            style={{ marginBottom: 16 }}
          />

          <Card size="small" title="✅ Résoudre le litige (sans avoir)" style={{ marginBottom: 16, background: '#f6ffed' }}>
            <Text>Les pièces de remplacement ont été reçues et sont conformes.</Text>
            <Divider />
            <Input.TextArea 
              rows={2} 
              placeholder="Date de réception, remarques, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ marginBottom: 16 }}
            />
            <Button 
              type="primary" 
              icon={<CheckCircleOutlined />} 
              onClick={handleResolveDispute}
              loading={loading}
              block
            >
              Résoudre - Commande validée
            </Button>
          </Card>

          <Card size="small" title="📦 Retour pour remplacement" style={{ marginBottom: 16 }}>
            <Text>Le fournisseur reprend les articles et les remplace.</Text>
            <Divider />
            <Input.TextArea 
              rows={2} 
              placeholder="Raison du retour, numéro de retour, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ marginBottom: 16 }}
            />
            <Button 
              icon={<TruckOutlined />} 
              onClick={handleReturnToSupplier}
              loading={loading}
              block
            >
              Marquer en attente de remplacement
            </Button>
          </Card>

          <Card size="small" title="❌ Annuler la commande" style={{ marginBottom: 16 }}>
            <Text type="danger">Annuler définitivement cette commande.</Text>
            <Divider />
            <Popconfirm
              title="Annulation définitive"
              description="Cette action est irréversible. Confirmez-vous ?"
              onConfirm={handleCancelOrder}
              okText="Oui, annuler"
              cancelText="Non"
              okButtonProps={{ danger: true }}
            >
              <Button 
                danger 
                icon={<DeleteOutlined />} 
                loading={loading}
                block
              >
                Annuler la commande
              </Button>
            </Popconfirm>
          </Card>
        </div>
      )
    },
    {
      key: 'contact',
      label: '📞 Contact fournisseur',
      children: (
        <Card size="small">
          <Descriptions column={1}>
            <Descriptions.Item label="Fournisseur">
              <Text strong>{orderDetails?.supplier_name || '-'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Téléphone">
              {orderDetails?.supplier_phone || 'Non renseigné'}
            </Descriptions.Item>
            <Descriptions.Item label="Email">
              {orderDetails?.supplier_email || 'Non renseigné'}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )
    }
  ];

  return (
    <>
      <Modal
        title={
          <Space>
            <WarningOutlined style={{ color: '#ff4d4f' }} />
            <span>Gestion du litige - Montures/Accessoires</span>
            {orderDetails?.status === 'dispute' && <Badge count="Litige" color="red" />}
            {orderDetails?.status === 'replacement_pending' && <Badge count="Attente remplacement" color="orange" />}
          </Space>
        }
        open={visible}
        onCancel={onClose}
        footer={null}
        width={850}
        destroyOnClose
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />

        <Divider />

        <div style={{ textAlign: 'right', display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={() => setHistoryVisible(true)} icon={<HistoryOutlined />}>
            Voir l'historique
          </Button>
          <Button onClick={onClose}>
            Fermer
          </Button>
        </div>
      </Modal>

      <PurchaseOrderHistoryModal
        visible={historyVisible}
        orderId={orderId}
        onClose={() => setHistoryVisible(false)}
      />
    </>
  );
};

export default PurchaseDisputeModal;