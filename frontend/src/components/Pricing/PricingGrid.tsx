import React, { useState, useEffect } from 'react';
import {
  Table, Card, Button, Space, Modal, Form, Input, InputNumber,
  Select, message, Tag, Popconfirm, Tabs, Divider, Row, Col,
  Typography, Tooltip, Empty, Badge, Alert
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined,
  DollarOutlined, ExperimentOutlined, SaveOutlined,
  ReloadOutlined, SearchOutlined, FilterOutlined
} from '@ant-design/icons';
import { pricingService, coatingService } from '../../services/api';

const { Option } = Select;
const { Title, Text } = Typography;
const { TabPane } = Tabs;

// Interfaces
interface LensPrice {
  id: string;
  lens_type: string;
  index_type: string;
  material: string;
  selling_price_cents: number;
  base_price_cents?: number;
  created_at: string;
  updated_at: string;
}

interface Coating {
  id: string;
  coating_code: string;
  coating_name: string;
  selling_price_cents: number;
  purchase_price_cents?: number;
  tenant_id: string;
}

const PricingGrid: React.FC = () => {
  const [lensPrices, setLensPrices] = useState<LensPrice[]>([]);
  const [coatings, setCoatings] = useState<Coating[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'lenses' | 'coatings'>('lenses');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [form] = Form.useForm();
  const [coatingForm] = Form.useForm();

  // Chargement des données
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [lensRes, coatingRes] = await Promise.all([
        pricingService.getAll(),
        coatingService.getAll()
      ]);
      setLensPrices(lensRes.data.data);
      setCoatings(coatingRes.data.data);
    } catch (error) {
      message.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  // ========================
  // Gestion des verres
  // ========================
  const handleAddLens = () => {
    setEditingItem(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEditLens = (record: LensPrice) => {
    setEditingItem(record);
    form.setFieldsValue({
      lens_type: record.lens_type,
      index_type: record.index_type,
      material: record.material,
      selling_price_cents: record.selling_price_cents / 100
    });
    setModalVisible(true);
  };

  const handleDeleteLens = async (id: string) => {
    try {
      await pricingService.delete(id);
      message.success('Prix verre supprimé avec succès');
      fetchData();
    } catch (error) {
      message.error('Erreur lors de la suppression');
    }
  };

  const handleSaveLens = async (values: any) => {
    try {
      const data = {
        ...values,
        selling_price_cents: values.selling_price_cents * 100
      };
      
      if (editingItem) {
        await pricingService.update(editingItem.id, data);
        message.success('Prix verre mis à jour avec succès');
      } else {
        await pricingService.create(data);
        message.success('Prix verre ajouté avec succès');
      }
      
      setModalVisible(false);
      form.resetFields();
      fetchData();
    } catch (error) {
      message.error('Erreur lors de l\'enregistrement');
    }
  };

  // ========================
  // Gestion des traitements
  // ========================
  const handleAddCoating = () => {
    setEditingItem(null);
    coatingForm.resetFields();
    setModalVisible(true);
  };

  const handleEditCoating = (record: Coating) => {
    setEditingItem(record);
    coatingForm.setFieldsValue({
      coating_code: record.coating_code,
      coating_name: record.coating_name,
      selling_price_cents: record.selling_price_cents / 100
    });
    setModalVisible(true);
  };

  const handleDeleteCoating = async (id: string) => {
    try {
      await coatingService.delete(id);
      message.success('Traitement supprimé avec succès');
      fetchData();
    } catch (error) {
      message.error('Erreur lors de la suppression');
    }
  };

  const handleSaveCoating = async (values: any) => {
    try {
      const data = {
        ...values,
        selling_price_cents: values.selling_price_cents * 100
      };
      
      if (editingItem) {
        await coatingService.update(editingItem.id, data);
        message.success('Traitement mis à jour avec succès');
      } else {
        await coatingService.create(data);
        message.success('Traitement ajouté avec succès');
      }
      
      setModalVisible(false);
      coatingForm.resetFields();
      fetchData();
    } catch (error) {
      message.error('Erreur lors de l\'enregistrement');
    }
  };

  // ========================
  // Colonnes du tableau des verres
  // ========================
  const lensColumns = [
    {
      title: 'Type de verre',
      dataIndex: 'lens_type',
      key: 'lens_type',
      width: 150,
      render: (value: string) => {
        const typeMap: any = {
          unifocal: { color: 'blue', label: 'Unifocal' },
          progressive: { color: 'purple', label: 'Progressif' },
          bifocal: { color: 'orange', label: 'Bifocal' },
          occupational: { color: 'cyan', label: 'Occupational' }
        };
        const type = typeMap[value] || { color: 'default', label: value };
        return <Tag color={type.color}>{type.label}</Tag>;
      }
    },
    {
      title: 'Indice',
      dataIndex: 'index_type',
      key: 'index_type',
      width: 100,
      render: (value: string) => <Tag color="geekblue">{value}</Tag>
    },
    {
      title: 'Matériau',
      dataIndex: 'material',
      key: 'material',
      width: 120,
      render: (value: string) => {
        const materialMap: any = {
          organic: 'Organique',
          mineral: 'Minéral',
          polycarbonate: 'Polycarbonate',
          trivex: 'Trivex'
        };
        return materialMap[value] || value;
      }
    },
    {
      title: '💰 Prix de vente',
      dataIndex: 'selling_price_cents',
      key: 'selling_price_cents',
      width: 150,
      align: 'right' as const,
      render: (value: number) => (
        <Text strong style={{ color: '#1890ff', fontSize: 16 }}>
          {(value / 100).toFixed(2)} DH
        </Text>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: any, record: LensPrice) => (
        <Space>
          <Tooltip title="Modifier">
            <Button icon={<EditOutlined />} onClick={() => handleEditLens(record)} />
          </Tooltip>
          <Popconfirm
            title="Supprimer ce prix ?"
            description="Cette action est irréversible"
            onConfirm={() => handleDeleteLens(record.id)}
            okText="Oui"
            cancelText="Non"
          >
            <Tooltip title="Supprimer">
              <Button danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  // ========================
  // Colonnes du tableau des traitements
  // ========================
  const coatingColumns = [
    {
      title: 'Code',
      dataIndex: 'coating_code',
      key: 'coating_code',
      width: 100,
      render: (value: string) => <Tag color="cyan">{value}</Tag>
    },
    {
      title: 'Nom du traitement',
      dataIndex: 'coating_name',
      key: 'coating_name',
      width: 200,
      render: (value: string) => <Text strong>{value}</Text>
    },
    {
      title: '💰 Prix de vente',
      dataIndex: 'selling_price_cents',
      key: 'selling_price_cents',
      width: 150,
      align: 'right' as const,
      render: (value: number) => (
        <Text strong style={{ color: '#1890ff', fontSize: 16 }}>
          {(value / 100).toFixed(2)} DH
        </Text>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: any, record: Coating) => (
        <Space>
          <Tooltip title="Modifier">
            <Button icon={<EditOutlined />} onClick={() => handleEditCoating(record)} />
          </Tooltip>
          <Popconfirm
            title="Supprimer ce traitement ?"
            description="Cette action est irréversible"
            onConfirm={() => handleDeleteCoating(record.id)}
            okText="Oui"
            cancelText="Non"
          >
            <Tooltip title="Supprimer">
              <Button danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  // ========================
  // Types de verres disponibles
  // ========================
  const lensTypes = [
    { value: 'unifocal', label: 'Unifocal', icon: '🔵' },
    { value: 'progressive', label: 'Progressif', icon: '🟣' },
    { value: 'bifocal', label: 'Bifocal', icon: '🟠' },
    { value: 'occupational', label: 'Occupational', icon: '🔷' }
  ];

  const indexes = [
    { value: '1.5', label: 'Standard (1.5)' },
    { value: '1.6', label: 'Mince (1.6)' },
    { value: '1.67', label: 'Très mince (1.67)' },
    { value: '1.74', label: 'Extrêmement mince (1.74)' }
  ];

  const materials = [
    { value: 'organic', label: 'Organique' },
    { value: 'mineral', label: 'Minéral' },
    { value: 'polycarbonate', label: 'Polycarbonate' },
    { value: 'trivex', label: 'Trivex' }
  ];

  return (
    <div>
      <Card>
        <div style={{ marginBottom: 24 }}>
          <Title level={3} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <DollarOutlined style={{ color: '#1890ff' }} />
            Gestion des prix
          </Title>
          <Text type="secondary">
            Définissez les prix de vente des verres optiques et des traitements
          </Text>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'lenses' | 'coatings')}
          items={[
            {
              key: 'lenses',
              label: (
                <span>
                  <ExperimentOutlined />
                  Verres optiques
                  <Badge count={lensPrices.length} style={{ marginLeft: 8 }} />
                </span>
              ),
              children: (
                <div>
                  <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Text type="secondary">
                        {lensPrices.length} configuration(s) de verres
                      </Text>
                    </div>
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleAddLens}>
                      Ajouter un verre
                    </Button>
                  </div>
                  
                  <Table
                    columns={lensColumns}
                    dataSource={lensPrices}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                    bordered
                  />
                </div>
              )
            },
            {
              key: 'coatings',
              label: (
                <span>
                  <DollarOutlined />
                  Traitements
                  <Badge count={coatings.length} style={{ marginLeft: 8 }} />
                </span>
              ),
              children: (
                <div>
                  <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Text type="secondary">
                        {coatings.length} traitement(s) optique(s)
                      </Text>
                    </div>
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleAddCoating}>
                      Ajouter un traitement
                    </Button>
                  </div>
                  
                  <Table
                    columns={coatingColumns}
                    dataSource={coatings}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                    bordered
                  />
                </div>
              )
            }
          ]}
        />

        <Divider />
        
        <Alert
          title="📌 Information"
          description="Les prix définis ici sont les prix de vente aux clients. Le prix d'achat fournisseur est saisi à la réception de la facture."
          type="info"
          showIcon
        />
      </Card>

      {/* Modal d'ajout/modification des verres */}
      <Modal
        title={
          <Space>
            <ExperimentOutlined />
            {editingItem ? 'Modifier le prix du verre' : 'Ajouter un prix de verre'}
          </Space>
        }
        open={modalVisible && activeTab === 'lenses'}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        footer={null}
        width={600}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSaveLens}>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="lens_type"
                label="Type de verre"
                rules={[{ required: true, message: 'Sélectionnez un type' }]}
              >
                <Select placeholder="Sélectionnez le type de verre" size="large">
                  {lensTypes.map(type => (
                    <Option key={type.value} value={type.value}>
                      {type.icon} {type.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="index_type"
                label="Indice"
                rules={[{ required: true, message: 'Sélectionnez un indice' }]}
              >
                <Select placeholder="Indice" size="large">
                  {indexes.map(idx => (
                    <Option key={idx.value} value={idx.value}>
                      {idx.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="material"
                label="Matériau"
                rules={[{ required: true, message: 'Sélectionnez un matériau' }]}
              >
                <Select placeholder="Matériau" size="large">
                  {materials.map(mat => (
                    <Option key={mat.value} value={mat.value}>
                      {mat.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item
                name="selling_price_cents"
                label="💰 Prix de vente (DH)"
                rules={[{ required: true, message: 'Saisissez le prix de vente' }]}
              >
                <InputNumber
                  min={0}
                  step={10}
                  style={{ width: '100%' }}
                  size="large"
                  placeholder="0.00"
                  formatter={value => `${value} DH`}
                  parser={(value?: string) => {
                    if (!value) return 0;
                    return Number(value.replace('DH', ''));
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Button onClick={() => setModalVisible(false)} style={{ marginRight: 8 }}>
              Annuler
            </Button>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
              {editingItem ? 'Mettre à jour' : 'Ajouter'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal d'ajout/modification des traitements */}
      <Modal
        title={
          <Space>
            <DollarOutlined />
            {editingItem ? 'Modifier le traitement' : 'Ajouter un traitement'}
          </Space>
        }
        open={modalVisible && activeTab === 'coatings'}
        onCancel={() => {
          setModalVisible(false);
          coatingForm.resetFields();
        }}
        footer={null}
        width={600}
        destroyOnHidden
      >
        <Form form={coatingForm} layout="vertical" onFinish={handleSaveCoating}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="coating_code"
                label="Code"
                rules={[{ required: true, message: 'Saisissez un code' }]}
              >
                <Input placeholder="Ex: AR, BLUE, UV..." size="large" />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="coating_name"
                label="Nom du traitement"
                rules={[{ required: true, message: 'Saisissez le nom' }]}
              >
                <Input placeholder="Ex: Antireflet, Anti-lumière bleue..." size="large" />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item
                name="selling_price_cents"
                label="💰 Prix de vente (DH)"
                rules={[{ required: true, message: 'Saisissez le prix de vente' }]}
              >
                <InputNumber
                  min={0}
                  step={5}
                  style={{ width: '100%' }}
                  size="large"
                  placeholder="0.00"
                  formatter={value => `${value} DH`}
                  parser={(value?: string) => {
                    if (!value) return 0;
                    return Number(value.replace('DH', ''));
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Button onClick={() => setModalVisible(false)} style={{ marginRight: 8 }}>
              Annuler
            </Button>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
              {editingItem ? 'Mettre à jour' : 'Ajouter'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PricingGrid;