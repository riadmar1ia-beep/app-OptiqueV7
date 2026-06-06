import React, { useState, useEffect } from 'react';
import {
  Modal, Timeline, Tag, Card, Typography,
  Space, Empty, Button, Spin, Divider, Row, Col, Statistic
} from 'antd';

import {
  FileTextOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  TruckOutlined,
  DeleteOutlined,
  HistoryOutlined,
  ClockCircleOutlined,
  EyeOutlined
} from '@ant-design/icons';

import { purchaseOrderService } from '../../services/api';

const { Text } = Typography;

interface Props {
  visible: boolean;
  orderId: string;
  onClose: () => void;
}

const PurchaseOrderHistoryModal: React.FC<Props> = ({
  visible,
  orderId,
  onClose
}) => {

  const [events, setEvents] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && orderId) {
      fetchData();
    }
  }, [visible, orderId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [eventsRes, summaryRes] = await Promise.all([
        purchaseOrderService.getPurchaseOrderEvents(orderId),
        purchaseOrderService.getPurchaseOrderSummary(orderId)
      ]);

      console.log('📜 Événements reçus:', eventsRes.data?.data);
      setEvents(eventsRes.data?.data || []);
      setSummary(summaryRes.data?.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'credit_note_created':
        return <FileTextOutlined style={{ color: '#52c41a' }} />;
      case 'dispute_opened':
        return <WarningOutlined style={{ color: '#ff4d4f' }} />;
      case 'dispute_resolved':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'return_created':
        return <TruckOutlined style={{ color: '#fa8c16' }} />;
      case 'order_cancelled':
        return <DeleteOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return <ClockCircleOutlined />;
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'credit_note_created':
        return 'green';
      case 'dispute_opened':
        return 'red';
      case 'dispute_resolved':
        return 'green';
      case 'return_created':
        return 'orange';
      case 'order_cancelled':
        return 'red';
      default:
        return 'blue';
    }
  };

  const getTitle = (type: string) => {
    switch (type) {
      case 'credit_note_created':
        return 'Avoir enregistré';
      case 'dispute_opened':
        return 'Litige ouvert';
      case 'dispute_resolved':
        return 'Litige résolu';
      case 'return_created':
        return 'Retour fournisseur';
      case 'order_cancelled':
        return 'Commande annulée';
      default:
        return type;
    }
  };

  // ✅ Fonction pour extraire les données de l'événement quel que soit le format

const getEventData = (event: any) => {
  // Priorité à event_data (backend format)
  if (event.event_data) return event.event_data;
  
  // Sinon, regarder dans event.data
  if (event.data) {
    if (typeof event.data === 'string') {
      try {
        return JSON.parse(event.data);
      } catch {
        return {};
      }
    }
    return event.data;
  }
  
  // Fallback: retourner l'event lui-même
  return event;
};

  // ✅ Fonction pour obtenir le montant
  const getAmount = (data: any) => {
    return data.amount_dh || data.amount_ht || 0;
  };

  // ✅ Fonction pour obtenir le numéro d'avoir
  const getCreditNoteNumber = (data: any) => {
    return data.credit_note_number || '';
  };

  return (
    <Modal
      title={
        <Space>
          <HistoryOutlined />
          <span>Historique de la commande</span>
          <Button 
            type="link" 
            icon={<EyeOutlined />} 
            onClick={fetchData} 
            loading={loading}
            size="small"
          >
            Rafraîchir
          </Button>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Fermer</Button>}
      width={800}
      destroyOnClose
    >
      {/* RÉSUMÉ FINANCIER */}
      {summary && summary.invoice_total > 0 && (
        <Card size="small" style={{ marginBottom: 16, background: '#f6ffed' }}>
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
                valueStyle={{ color: '#52c41a' }}
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
              <Tag color="success" icon={<CheckCircleOutlined />}>
                ✅ Rien à payer - Solde = 0 DH
              </Tag>
            ) : (
              <Tag color="warning" icon={<WarningOutlined />}>
                ⚠️ Solde restant : {summary.remaining?.toFixed(2)} DH
              </Tag>
            )}
          </div>
        </Card>
      )}

      {/* CHARGEMENT */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 30 }}>
          <Spin size="large" />
        </div>
      ) : events.length === 0 ? (
        <Empty description="Aucun événement enregistré" />
      ) : (
        <Timeline>
          {events.map((event) => {
            const eventData = getEventData(event);
            const amount = getAmount(eventData);
            const creditNoteNumber = getCreditNoteNumber(eventData);
            
            return (
              <Timeline.Item
                key={event.id}
                dot={getIcon(event.event_type)}
                color={getColor(event.event_type)}
              >
                <Card size="small" style={{ marginBottom: 10 }}>
                  {/* En-tête avec titre et date */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Text strong style={{ fontSize: 14 }}>
                      📝 {getTitle(event.event_type)}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {new Date(event.created_at).toLocaleString('fr-FR')}
                    </Text>
                  </div>

                  {/* Contenu spécifique selon le type d'événement */}
                  <div style={{ marginTop: 8 }}>
                    {event.event_type === 'credit_note_created' && (
                      <div>
                        {eventData.credit_note_number && (
                          <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                            Réf : {eventData.credit_note_number}
                          </Text>
                        )}
                        {(eventData.amount_dh !== undefined ? eventData.amount_dh : eventData.amount_ht) !== undefined && (
                          <Text type="secondary" style={{ display: 'block', marginTop: 2 }}>
                            Montant : {(eventData.amount_dh !== undefined ? eventData.amount_dh : eventData.amount_ht)} DH
                          </Text>
                        )}
                      </div>
                    )}

                    {event.event_type === 'dispute_opened' && (
                      <Text type="danger">Litige signalé au fournisseur</Text>
                    )}

                    {event.event_type === 'dispute_resolved' && (
                      <Text type="success">Litige résolu - Commande validée</Text>
                    )}

                    {event.event_type === 'return_created' && (
                      <Text type="warning">Retour fournisseur créé</Text>
                    )}

                    {event.event_type === 'order_cancelled' && (
                      <Text type="danger">Commande annulée</Text>
                    )}
                  </div>

                  {/* Notes */}
                  {(eventData.notes || event.notes) && (
                    <div style={{ marginTop: 8, padding: 6, background: '#f5f5f5', borderRadius: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {eventData.notes || event.notes}
                      </Text>
                    </div>
                  )}
                </Card>
              </Timeline.Item>
            );
          })}
        </Timeline>
      )}
    </Modal>
  );
};

export default PurchaseOrderHistoryModal;