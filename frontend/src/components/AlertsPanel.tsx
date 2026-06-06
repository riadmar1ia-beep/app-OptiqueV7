import React, { useState, useEffect } from 'react';
import {
  Card, List, Badge, Button, Space, Tag, Typography,
  Spin, Empty, message, Drawer, Modal
} from 'antd';
import {
  BellOutlined, CheckCircleOutlined, DeleteOutlined,
  WarningOutlined, CalendarOutlined, DollarOutlined,
  ReloadOutlined, EyeOutlined
} from '@ant-design/icons';
import { alertsService } from '../services/api';

const { Text, Title } = Typography;

interface Alert {
  id: number;
  type: string;
  title: string;
  message: string;
  target_date: string;
  is_read: boolean;
  is_acknowledged: boolean;
  created_at: string;
}

interface AlertsPanelProps {
  open: boolean;
  onClose: () => void;
}

const AlertsPanel: React.FC<AlertsPanelProps> = ({ open, onClose }) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (open) {
      fetchAlerts();
      fetchUnreadCount();
    }
  }, [open]);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const response = await alertsService.getAll();
      setAlerts(response.data.data);
    } catch (error) {
      console.error('Erreur chargement alertes:', error);
      message.error('Erreur lors du chargement des alertes');
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const response = await alertsService.getUnreadCount();
      setUnreadCount(response.data.data.count);
    } catch (error) {
      console.error('Erreur compteur alertes:', error);
    }
  };

  const markAsRead = async (id: number) => {
    try {
      await alertsService.markAsRead(id);
      setAlerts(alerts.map(a => a.id === id ? { ...a, is_read: true } : a));
      setUnreadCount(Math.max(0, unreadCount - 1));
      message.success('Alerte marquée comme lue');
    } catch (error) {
      message.error('Erreur');
    }
  };

  const acknowledgeAlert = async (id: number) => {
    try {
      await alertsService.acknowledgeAlert(id);
      setAlerts(alerts.map(a => a.id === id ? { ...a, is_acknowledged: true, is_read: true } : a));
      setUnreadCount(Math.max(0, unreadCount - 1));
      message.success('Alerte acquittée');
    } catch (error) {
      message.error('Erreur');
    }
  };

  const deleteAlert = async (id: number) => {
    Modal.confirm({
      title: 'Supprimer l\'alerte',
      content: 'Cette action est irréversible. Confirmez-vous ?',
      onOk: async () => {
        try {
          await alertsService.deleteAlert(id);
          setAlerts(alerts.filter(a => a.id !== id));
          message.success('Alerte supprimée');
        } catch (error) {
          message.error('Erreur lors de la suppression');
        }
      }
    });
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'tva_deadline':
        return <CalendarOutlined style={{ color: '#faad14' }} />;
      case 'payment_due':
        return <DollarOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return <BellOutlined />;
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'tva_deadline':
        return '#faad14';
      case 'payment_due':
        return '#ff4d4f';
      default:
        return '#1890ff';
    }
  };

  return (
    <Drawer
      title={
        <Space>
          <BellOutlined />
          <span>Alertes et notifications</span>
          {unreadCount > 0 && <Badge count={unreadCount} />}
        </Space>
      }
      placement="right"
      width={500}
      open={open}
      onClose={onClose}
      extra={
        <Button icon={<ReloadOutlined />} onClick={fetchAlerts} size="small">
          Actualiser
        </Button>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : alerts.length === 0 ? (
        <Empty description="Aucune alerte" />
      ) : (
        <List
          dataSource={alerts}
          renderItem={(alert) => (
            <List.Item
              style={{
                background: !alert.is_read ? '#f0f5ff' : 'transparent',
                borderRadius: 8,
                marginBottom: 8,
                padding: 12
              }}
              actions={[
                !alert.is_read && (
                  <Button
                    type="link"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => markAsRead(alert.id)}
                  >
                    Marquer lue
                  </Button>
                ),
                !alert.is_acknowledged && (
                  <Button
                    type="link"
                    size="small"
                    icon={<CheckCircleOutlined />}
                    onClick={() => acknowledgeAlert(alert.id)}
                  >
                    Acquitter
                  </Button>
                ),
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => deleteAlert(alert.id)}
                >
                  Supprimer
                </Button>
              ]}
            >
              <List.Item.Meta
                avatar={
                  <Badge dot={!alert.is_read} color={getAlertColor(alert.type)} offset={[-5, 5]}>
                    <div style={{ fontSize: 20 }}>{getAlertIcon(alert.type)}</div>
                  </Badge>
                }
                title={
                  <Space>
                    <Text strong>{alert.title}</Text>
                    {alert.type === 'tva_deadline' && (
                      <Tag color="orange" icon={<WarningOutlined />}>TVA</Tag>
                    )}
                    {alert.type === 'payment_due' && (
                      <Tag color="red" icon={<DollarOutlined />}>Échéance</Tag>
                    )}
                  </Space>
                }
                description={
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {alert.message}
                    </Text>
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {new Date(alert.created_at).toLocaleString('fr-FR')}
                      </Text>
                      {alert.target_date && (
                        <Text type="secondary" style={{ fontSize: 11, marginLeft: 16 }}>
                          📅 Échéance: {new Date(alert.target_date).toLocaleDateString('fr-FR')}
                        </Text>
                      )}
                    </div>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Drawer>
  );
};

export default AlertsPanel;