// frontend/src/components/Clients/ClientsList.tsx
import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Space,
  Popconfirm,
  message,
  Row,
  Col,
  Card,
  Avatar,
  Badge,
  Drawer,
  Tag,
  Tooltip,
  Typography
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
  EyeOutlined,
  SearchOutlined,
  ReloadOutlined,
  PhoneOutlined,
  MailOutlined,
  TrophyOutlined
} from '@ant-design/icons';
import { clientsService } from '../../services/api';
import ClientDashboard from './ClientDashboard';

const { Text, Title } = Typography;

const ClientsList: React.FC = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    try {
      const response = await clientsService.getAll();
      setClients(response.data.data);
    } catch (error) {
      message.error('Erreur chargement clients');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingClient) {
        await clientsService.update(editingClient.id, values);
        message.success('Client modifié avec succès');
      } else {
        await clientsService.create(values);
        message.success('Client ajouté avec succès');
      }
      setModalVisible(false);
      form.resetFields();
      setEditingClient(null);
      loadClients();
    } catch (error) {
      message.error('Erreur lors de la sauvegarde');
      console.error(error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await clientsService.delete(id);
      message.success('Client supprimé avec succès');
      loadClients();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Erreur suppression');
    }
  };

  const openClientDashboard = (client: any) => {
    setSelectedClientId(client.id);
    setDrawerVisible(true);
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  const getRandomColor = (str: string) => {
    const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2'];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const filteredClients = clients.filter((client: any) => {
    const fullName = `${client.first_name} ${client.last_name}`.toLowerCase();
    const phone = client.phone?.toLowerCase() || '';
    const email = client.email?.toLowerCase() || '';
    const search = searchText.toLowerCase();
    return fullName.includes(search) || phone.includes(search) || email.includes(search);
  });

  const columns = [
    {
      title: 'Client',
      key: 'name',
      width: 250,
      render: (_: any, record: any) => (
        <Space>
          <Avatar 
            style={{ 
              backgroundColor: getRandomColor(record.first_name + record.last_name),
              verticalAlign: 'middle' 
            }}
            size="large"
          >
            {getInitials(record.first_name, record.last_name)}
          </Avatar>
          <div>
            <Text strong style={{ fontSize: 15 }}>
              {record.first_name} {record.last_name}
            </Text>
            <br />
            <Space size={8} style={{ marginTop: 2 }}>
              <PhoneOutlined style={{ fontSize: 11, color: '#999' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>{record.phone}</Text>
            </Space>
          </div>
        </Space>
      )
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 200,
      render: (email: string) => email ? (
        <Space>
          <MailOutlined style={{ color: '#999' }} />
          <Text style={{ fontSize: 12 }}>{email}</Text>
        </Space>
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
      )
    },
    {
      title: 'Taux mutuelle',
      dataIndex: 'insurance_rate',
      key: 'insurance_rate',
      width: 120,
      align: 'center' as const,
      render: (rate: number) => rate ? (
        <Tag color="blue" style={{ fontSize: 12 }}>
          {rate}%
        </Tag>
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
      )
    },
    {
      title: 'Inscrit le',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      render: (date: string) => (
        <Text style={{ fontSize: 12 }}>
          {new Date(date).toLocaleDateString('fr-FR')}
        </Text>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      render: (_: any, record: any) => (
        <Space>
          <Tooltip title="Voir le dashboard client">
            <Button
              type="primary"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => openClientDashboard(record)}
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
            >
              Dashboard
            </Button>
          </Tooltip>
          <Tooltip title="Modifier">
            <Button
              type="default"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setEditingClient(record);
                form.setFieldsValue(record);
                setModalVisible(true);
              }}
            />
          </Tooltip>
          <Tooltip title="Supprimer">
            <Popconfirm
              title="Supprimer ce client ?"
              description="Cette action est irréversible si le client n'a pas de commandes."
              onConfirm={() => handleDelete(record.id)}
              okText="Oui, supprimer"
              cancelText="Non"
              okButtonProps={{ danger: true }}
            >
              <Button type="default" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Card 
        style={{ 
          borderRadius: 12,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)'
        }}
      >
        <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
          <Col>
            <Space>
              <Title level={4} style={{ margin: 0 }}>
                👥 Clients
              </Title>
              <Badge count={filteredClients.length} showZero style={{ backgroundColor: '#1890ff' }} />
            </Space>
          </Col>
          <Col>
            <Space>
              <Input
                placeholder="Rechercher un client..."
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ width: 250 }}
                allowClear
              />
              <Button 
                icon={<ReloadOutlined />} 
                onClick={loadClients}
              >
                Actualiser
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingClient(null);
                  form.resetFields();
                  setModalVisible(true);
                }}
              >
                Nouveau client
              </Button>
            </Space>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={filteredClients}
          rowKey="id"
          loading={loading}
          pagination={{ 
            pageSize: 10,
            showTotal: (total, range) => `${range[0]}-${range[1]} sur ${total} clients`,
            showSizeChanger: true,
            showQuickJumper: true
          }}
          locale={{ emptyText: 'Aucun client trouvé' }}
        />
      </Card>

      {/* Modal d'ajout/modification */}
      <Modal
        title={editingClient ? '✏️ Modifier le client' : '➕ Ajouter un client'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setModalVisible(false);
          setEditingClient(null);
          form.resetFields();
        }}
        okText={editingClient ? 'Modifier' : 'Ajouter'}
        cancelText="Annuler"
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item 
            name="first_name" 
            label="Prénom" 
            rules={[{ required: true, message: 'Le prénom est requis' }]}
          >
            <Input placeholder="Ex: Jean" size="large" />
          </Form.Item>
          <Form.Item 
            name="last_name" 
            label="Nom" 
            rules={[{ required: true, message: 'Le nom est requis' }]}
          >
            <Input placeholder="Ex: Dupont" size="large" />
          </Form.Item>
          <Form.Item 
            name="phone" 
            label="Téléphone" 
            rules={[{ required: true, message: 'Le téléphone est requis' }]}
          >
            <Input placeholder="Ex: 0612345678" size="large" />
          </Form.Item>
          <Form.Item 
            name="email" 
            label="Email"
            rules={[{ type: 'email', message: 'Email invalide' }]}
          >
            <Input placeholder="client@example.com" size="large" />
          </Form.Item>
          <Form.Item 
            name="insurance_rate" 
            label="Taux de couverture mutuelle (%)"
            tooltip="Pourcentage pris en charge par la mutuelle"
          >
            <InputNumber 
              min={0} 
              max={100} 
              style={{ width: '100%' }} 
              size="large"
              placeholder="Ex: 70"
              addonAfter="%"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Drawer du dashboard client */}
      <Drawer
        title={
          <Space>
            <UserOutlined />
            <span>Fiche client détaillée</span>
          </Space>
        }
        placement="right"
        width={900}
        open={drawerVisible}
        onClose={() => {
          setDrawerVisible(false);
          setSelectedClientId(null);
        }}
        destroyOnClose
        closable
        extra={
          <Button 
            type="primary" 
            icon={<ReloadOutlined />} 
            onClick={() => {
              if (selectedClientId) {
                // Forcer le rechargement du dashboard
                setSelectedClientId(null);
                setTimeout(() => setSelectedClientId(selectedClientId), 100);
              }
            }}
          >
            Rafraîchir
          </Button>
        }
      >
        {selectedClientId && (
          <ClientDashboard
            clientId={selectedClientId}
            clientName=""
            onClose={() => setDrawerVisible(false)}
            onOrderCreated={() => {
              // Rafraîchir la liste des clients après création de commande
              loadClients();
            }}
          />
        )}
      </Drawer>
    </div>
  );
};

export default ClientsList;