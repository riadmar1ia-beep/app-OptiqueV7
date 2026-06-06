// frontend/src/components/Supplier/OrderHistoryModal.tsx

import React, { useState, useEffect } from 'react';
import { Modal, Timeline, Tag, Card, Typography, Space, Empty, Button } from 'antd';
import {
  FileTextOutlined, WarningOutlined, CheckCircleOutlined,
  TruckOutlined, DeleteOutlined, DollarOutlined, EyeOutlined
} from '@ant-design/icons';
import { orderService } from '../../services/api';

const { Text } = Typography;

interface OrderHistoryModalProps {
  visible: boolean;
  orderId: string;
  onClose: () => void;
}

const OrderHistoryModal: React.FC<OrderHistoryModalProps> = ({
  visible,
  orderId,
  onClose
}) => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && orderId) {
      fetchEvents();
    }
  }, [visible, orderId]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await orderService.getOrderEvents(orderId);
      setEvents(res.data.data || []);
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'credit_note':
        return <FileTextOutlined style={{ color: '#52c41a' }} />;
      case 'dispute':
        return <WarningOutlined style={{ color: '#ff4d4f' }} />;
      case 'resolution':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'return':
        return <TruckOutlined style={{ color: '#fa8c16' }} />;
      case 'cancellation':
        return <DeleteOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return <DollarOutlined />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'credit_note':
        return 'green';
      case 'dispute':
        return 'red';
      case 'resolution':
        return 'green';
      case 'return':
        return 'orange';
      case 'cancellation':
        return 'red';
      default:
        return 'blue';
    }
  };

  const formatEventData = (event: any) => {
    if (event.event_type === 'credit_note' && event.event_data) {
      const data = typeof event.event_data === 'string' 
        ? JSON.parse(event.event_data) 
        : event.event_data;
      return (
        <div style={{ marginTop: 8 }}>
          {data.credit_note_number && (
            <Tag color="green">N° {data.credit_note_number}</Tag>
          )}
          {data.amount_dh && (
            <Tag color="blue">{data.amount_dh} DH</Tag>
          )}
          {data.remaining !== undefined && data.remaining === 0 && (
            <Tag color="success">Solde = 0 DH</Tag>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Modal
      title={
        <Space>
          <FileTextOutlined />
          <span>Historique - Commandes Verres</span>
          <Button 
            type="link" 
            icon={<EyeOutlined />} 
            onClick={fetchEvents} 
            loading={loading}
            size="small"
          >
            Rafraîchir
          </Button>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
    >
      {events.length === 0 ? (
        <Empty description="Aucun historique" />
      ) : (
        <Timeline
          items={events.map((event) => ({
            color: getEventColor(event.event_type),
            dot: getEventIcon(event.event_type),
            children: (
              <Card size="small" style={{ marginBottom: 8 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space>
                    <Text strong>
                      {event.event_type === 'credit_note' && '📝 Avoir enregistré'}
                      {event.event_type === 'dispute' && '⚠️ Litige signalé'}
                      {event.event_type === 'resolution' && '✅ Litige résolu'}
                      {event.event_type === 'return' && '📦 Retour fournisseur'}
                      {!['credit_note', 'dispute', 'resolution', 'return'].includes(event.event_type) && event.event_type}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(event.created_at).toLocaleString('fr-FR')}
                    </Text>
                  </Space>
                  
                  {formatEventData(event)}
                  
                  {event.notes && (
                    <Text style={{ fontSize: 13, color: '#666' }}>
                      {event.notes}
                    </Text>
                  )}
                  
                  {event.created_by_name && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Par : {event.created_by_name}
                    </Text>
                  )}
                </Space>
              </Card>
            )
          }))}
        />
      )}
    </Modal>
  );
};

export default OrderHistoryModal;