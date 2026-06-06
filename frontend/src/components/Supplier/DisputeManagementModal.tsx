import React, { useState, useEffect } from 'react';
import {
  Modal, Form, Input, Button, Space, Tag, Card, Row, Col,
  Typography, Divider, Alert, Timeline, message,
  Descriptions, Popconfirm, Tabs, Badge, InputNumber, Statistic
} from 'antd';
import {
  WarningOutlined, CheckCircleOutlined, TruckOutlined,
  FileTextOutlined, DeleteOutlined, ClockCircleOutlined,
  MailOutlined, PhoneOutlined, DollarOutlined
} from '@ant-design/icons';
import { orderService } from '../../services/api';
import OrderHistoryModal from './OrderHistoryModal';

const { Text } = Typography;

interface DisputeManagementModalProps {
  visible: boolean;
  orderId: string;
  orderDetails: any;
  onClose: () => void;
  onRefresh: () => void;
}

const DisputeManagementModal: React.FC<DisputeManagementModalProps> = ({
  visible,
  orderId,
  orderDetails,
  onClose,
  onRefresh
}) => {
  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [activeTab, setActiveTab] = useState('details');
  const [historyVisible, setHistoryVisible] = useState(false);
  
  const [creditNoteNumber, setCreditNoteNumber] = useState('');
  const [creditNoteAmount, setCreditNoteAmount] = useState<number | null>(null);
  const [creditNoteDate, setCreditNoteDate] = useState('');

  useEffect(() => {
    if (visible && orderId) {
      fetchIssues();
      if (orderDetails?.credit_note_number) {
        setCreditNoteNumber(orderDetails.credit_note_number);
        setCreditNoteAmount(orderDetails.credit_note_amount_cents ? orderDetails.credit_note_amount_cents / 100 : null);
        setCreditNoteDate(orderDetails.credit_note_date?.split('T')[0] || '');
      }
    }
  }, [visible, orderId, orderDetails]);

  const fetchIssues = async () => {
    try {
      const response = await orderService.getOrderIssues(orderId);
      setIssues(response.data.data || []);
    } catch (error) {
      console.error('Erreur chargement des litiges:', error);
    }
  };

  const handleRequestCreditNote = async () => {
    if (!creditNoteNumber) {
      message.error('Veuillez saisir le numéro de l\'avoir');
      return;
    }
    if (!creditNoteAmount || creditNoteAmount <= 0) {
      message.error('Veuillez saisir un montant valide');
      return;
    }

    const invoiceAmount = orderDetails?.supplier_invoice_amount || 0;
    if (creditNoteAmount > invoiceAmount) {
      message.error(`Le montant de l'avoir (${creditNoteAmount} DH) ne peut pas dépasser le montant de la facture (${invoiceAmount} DH)`);
      return;
    }

    setLoading(true);
    try {
      await orderService.requestCreditNote(orderId, {
        credit_note_number: creditNoteNumber,
        amount_dh: creditNoteAmount,
        credit_note_date: creditNoteDate,
        notes: notes
      });
      
      const remaining = invoiceAmount - creditNoteAmount;
      
      if (remaining === 0) {
        message.success(`✅ Avoir ${creditNoteNumber} enregistré - Solde = 0 DH`);
      } else if (remaining > 0) {
        message.warning(`⚠️ Avoir partiel - Solde restant : ${remaining} DH`);
      }
      
      onRefresh();
      onClose();
    } catch (error: any) {
      console.error('Erreur:', error);
      message.error(error.response?.data?.error || 'Erreur lors de la demande d\'avoir');
    } finally {
      setLoading(false);
    }
  };

  const handleValidateAfterCreditNote = async () => {
    const invoiceAmount = orderDetails?.supplier_invoice_amount || 0;
    const creditAmount = creditNoteAmount || 0;
    const remaining = invoiceAmount - creditAmount;
    
    if (remaining > 0) {
      Modal.warning({
        title: 'Avoir incomplet',
        content: (
          <div>
            <p>Facture : <strong>{invoiceAmount} DH</strong></p>
            <p>Avoir : <strong>{creditAmount} DH</strong></p>
            <p style={{ color: '#ff4d4f' }}>Solde restant : <strong>{remaining} DH</strong></p>
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
          <p>Montant : {creditAmount} DH</p>
          <p style={{ color: '#52c41a' }}>💰 Solde final = 0 DH - Rien à payer</p>
        </div>
      ),
      okText: 'Oui, valider',
      cancelText: 'Annuler',
      onOk: async () => {
        setLoading(true);
        try {
          await orderService.updateSupplierOrderStatus(orderId, 'validated');
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

  const handleResolveDispute = async () => {
    setLoading(true);
    try {
      await orderService.resolveDispute(orderId, `Litige résolu - ${notes || 'Pièces reçues conformes'}`);
      await orderService.updateSupplierOrderStatus(orderId, 'validated');
      message.success('✅ Litige résolu - Commande validée');
      onRefresh();
      onClose();
    } catch (error) {
      message.error('❌ Erreur lors de la résolution');
    } finally {
      setLoading(false);
    }
  };

  const handleReturnToSupplier = async () => {
    setLoading(true);
    try {
      await orderService.updateSupplierOrderStatus(orderId, 'replacement_pending');
      await orderService.resolveDispute(orderId, `Retour au fournisseur - ${notes || 'Aucune note'}`);
      message.success('Commande marquée en attente de remplacement');
      onRefresh();
      onClose();
    } catch (error) {
      message.error('Erreur lors du retour');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    setLoading(true);
    try {
      await orderService.updateSupplierOrderStatus(orderId, 'cancelled');
      message.warning('Commande annulée définitivement');
      onRefresh();
      onClose();
    } catch (error) {
      message.error('Erreur lors de l\'annulation');
    } finally {
      setLoading(false);
    }
  };

  const getIssueIcon = (issueType: string) => {
    const icons: any = {
      cracked: '🔴',
      wrong_power: '⚠️',
      wrong_index: '⚠️',
      wrong_coating: '⚠️',
      wrong_axis: '⚠️',
      scratched: '🔴',
      missing: '🔴',
      wrong_color: '🎨',
      damaged_frame: '🔴'
    };
    return icons[issueType] || '⚠️';
  };

  const getIssueLabel = (issueType: string) => {
    const labels: any = {
      cracked: 'Verre cassé',
      wrong_power: 'Mauvaise puissance',
      wrong_index: 'Mauvais indice',
      wrong_coating: 'Mauvais traitement',
      wrong_axis: 'Mauvais axe',
      scratched: 'Rayé',
      missing: 'Manquant',
      wrong_color: 'Mauvaise couleur',
      damaged_frame: 'Monture endommagée'
    };
    return labels[issueType] || issueType;
  };

  const invoiceAmount = orderDetails?.supplier_invoice_amount || 0;
  const creditAmount = creditNoteAmount || 0;
  const remainingAmount = invoiceAmount - creditAmount;
  const isCreditNoteComplete = remainingAmount === 0 && creditNoteNumber && creditAmount > 0;

  const isDisputeActive = orderDetails?.status === 'dispute';
  const isReplacementPending = orderDetails?.status === 'replacement_pending';

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
              description={`Litige ouvert le ${orderDetails?.quality_control_at ? new Date(orderDetails.quality_control_at).toLocaleString('fr-FR') : 'récemment'}`}
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

          {invoiceAmount > 0 && (
            <Card size="small" title="💰 Situation comptable" style={{ marginBottom: 16, background: '#f6ffed' }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Statistic
                    title="Facture originale"
                    value={invoiceAmount}
                    suffix="DH"
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="Avoir émis"
                    value={creditAmount}
                    suffix="DH"
                    valueStyle={{ color: creditAmount > 0 ? '#52c41a' : '#faad14' }}
                  />
                </Col>
              </Row>
              <Divider style={{ margin: '12px 0' }} />
              <div style={{ textAlign: 'center' }}>
                {remainingAmount === 0 && creditAmount > 0 ? (
                  <div>
                    <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 14, padding: '4px 12px' }}>
                      ✅ Rien à payer - Solde = 0 DH
                    </Tag>
                  </div>
                ) : remainingAmount > 0 ? (
                  <div>
                    <Tag color="warning" icon={<WarningOutlined />} style={{ fontSize: 14, padding: '4px 12px' }}>
                      ⚠️ Solde restant : {remainingAmount} DH
                    </Tag>
                  </div>
                ) : (
                  <Text type="secondary">Aucun avoir enregistré</Text>
                )}
              </div>
            </Card>
          )}

          <Card size="small" title="🔴 Problèmes constatés" style={{ marginBottom: 16 }}>
            {issues.length === 0 ? (
              <Alert type="info" showIcon message="Aucun problème enregistré" />
            ) : (
              issues.map((issue, index) => (
                <Card key={index} size="small" style={{ marginBottom: 8, background: '#fff2f0' }}>
                  <Row>
                    <Col span={6}>
                      <Tag color="red" icon={<WarningOutlined />}>
                        {getIssueIcon(issue.issue_type)} {getIssueLabel(issue.issue_type)}
                      </Tag>
                    </Col>
                    <Col span={12}>
                      <Text>{issue.description}</Text>
                    </Col>
                    <Col span={6}>
                      <Text type="secondary">Qté: {issue.quantity || 1}</Text>
                      <br />
                      <Tag color={issue.status === 'open' ? 'orange' : 'green'}>
                        {issue.status === 'open' ? 'En attente' : 'Résolu'}
                      </Tag>
                    </Col>
                  </Row>
                </Card>
              ))
            )}
          </Card>
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
                  <Form.Item label="Montant HT (DH)" required>
                    <InputNumber
                      min={0}
                      max={invoiceAmount}
                      step={10}
                      style={{ width: '100%' }}
                      value={creditNoteAmount}
                      onChange={(v) => setCreditNoteAmount(v)}
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
                    />
                  </Form.Item>
                </Col>
              </Row>
              
              {invoiceAmount > 0 && (
                <div style={{ marginBottom: 16, padding: '8px', background: '#f5f5f5', borderRadius: 6 }}>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Text type="secondary">Facture originale :</Text>
                      <Text strong style={{ display: 'block', color: '#1890ff' }}>
                        {invoiceAmount} DH
                      </Text>
                    </Col>
                    <Col span={12}>
                      <Text type="secondary">Solde après avoir :</Text>
                      <Text strong style={{ display: 'block', color: remainingAmount === 0 ? '#52c41a' : '#ff4d4f' }}>
                        {remainingAmount} DH
                      </Text>
                    </Col>
                  </Row>
                </div>
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
              <Button type="link" icon={<PhoneOutlined />} href={`tel:${orderDetails?.supplier_phone}`}>
                {orderDetails?.supplier_phone || 'Non renseigné'}
              </Button>
            </Descriptions.Item>
            <Descriptions.Item label="Email">
              <Button type="link" icon={<MailOutlined />} href={`mailto:${orderDetails?.supplier_email}`}>
                {orderDetails?.supplier_email || 'Non renseigné'}
              </Button>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )
    }
  ];

  return (
    <Modal
      title={
        <Space>
          <WarningOutlined style={{ color: '#ff4d4f' }} />
          <span>Gestion du litige</span>
          <Badge count={issues.length} color="red" />
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={850}
      destroyOnHidden
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />

      <Divider />

      <div style={{ textAlign: 'right', display: 'flex', justifyContent: 'space-between' }}>
        <Button onClick={() => setHistoryVisible(true)} icon={<FileTextOutlined />}>
          Voir l'historique
        </Button>
        <Button onClick={onClose}>
          Fermer
        </Button>
      </div>

      <OrderHistoryModal
        visible={historyVisible}
        orderId={orderId}
        onClose={() => setHistoryVisible(false)}
      />
    </Modal>
  );
};

export default DisputeManagementModal;