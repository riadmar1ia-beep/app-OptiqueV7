// frontend/src/components/Products/Products.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Table, Card, Button, Space, Input, message, Tag, Popconfirm, Typography, 
  Modal, Form, Select, InputNumber, Row, Col, Tabs, 
  Badge, Tooltip, Switch, Divider, Slider, Descriptions, Drawer,
  Upload, Image, Progress, Empty, Alert
} from 'antd';
import { 
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, 
  ShoppingCartOutlined, EyeOutlined, UploadOutlined,
  FilterOutlined, ClearOutlined, StarOutlined, DownloadOutlined,
  CloseOutlined, CheckOutlined, WarningOutlined, ReloadOutlined
} from '@ant-design/icons';
import { productService } from '../../services/api';
import type { UploadFile, UploadProps } from 'antd/es/upload/interface';

const { Search } = Input;
const { Text, Title } = Typography;
const { Option } = Select;

// Interface pour un produit
interface Product {
  id: string;
  tenant_id: string;
  reference: string;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  price_cents: number;
  purchase_price_cents: number;
  tax_rate: number;
  tva_rate: number;
  min_stock: number;
  stock_quantity: number;
  reserved_quantity: number;
  location: string;
  frame_type: string;
  gender: string;
  shape: string;
  material: string;
  frame_color: string;
  temple_color: string;
  size_code: string;
  lens_width: number;
  bridge_width: number;
  temple_length: number;
  lens_height: number;
  base_curve: string;
  rim_type: string;
  accessory_type: string;
  consumable: boolean;
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface FilterState {
  search: string;
  frame_type: string | null;
  gender: string | null;
  material: string | null;
  stock_status: string | null;
  price_range: [number, number];
  is_active: boolean | null;
  is_featured: boolean | null;
  product_type: 'all' | 'frame' | 'accessory';
}

const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form] = Form.useForm();
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    frame_type: null,
    gender: null,
    material: null,
    stock_status: null,
    price_range: [0, 20000],
    is_active: true,
    is_featured: null,
    product_type: 'all'
  });
  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

const fetchProducts = async () => {
  setLoading(true);
  try {
    const token = localStorage.getItem('accessToken');
    const response = await fetch('http://localhost:3001/api/products', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Tenant-Id': 'default-shop'
      }
    });
    const data = await response.json();
    console.log('📦 Produits chargés (Products):', data.data.length);
    setProducts(data.data);
  } catch (error) {
    console.error('❌ Erreur chargement produits:', error);
    message.error('Erreur lors du chargement des produits');
  } finally {
    setLoading(false);
  }
};
  const handleCreate = () => {
    setEditingProduct(null);
    form.resetFields();
    form.setFieldsValue({
      tva_rate: 20,
      stock_quantity: 0,
      min_stock: 5,
      is_active: true,
      is_featured: false
    });
    setModalVisible(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    form.setFieldsValue({
      ...product,
      price: product.price_cents / 100,
      purchase_price: (product.purchase_price_cents || 0) / 100
    });
    setModalVisible(true);
  };

  const handleViewDetails = (product: Product) => {
    setSelectedProduct(product);
    setDrawerVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await productService.delete(id);
      message.success('Produit supprimé');
      fetchProducts();
    } catch (error) {
      message.error('Erreur suppression');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const productData = {
        ...values,
        price_cents: Math.round((values.price || 0) * 100),
        purchase_price_cents: Math.round((values.purchase_price || 0) * 100),
        tenant_id: localStorage.getItem('tenantId') || 'default-shop'
      };
      
      if (editingProduct) {
        await productService.update(editingProduct.id, productData);
        message.success('Produit modifié');
      } else {
        await productService.create(productData);
        message.success('Produit créé');
      }
      
      setModalVisible(false);
      fetchProducts();
    } catch (error) {
      message.error('Erreur sauvegarde');
      console.error(error);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await productService.exportProducts();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `produits_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      message.success('Export lancé');
    } catch (error) {
      message.error('Erreur export');
    } finally {
      setExporting(false);
    }
  };

  const getStockStatus = (product: Product) => {
    const stock = product.stock_quantity || 0;
    if (stock <= 0) return { color: 'red', text: 'Rupture', icon: '❌', progress: 0 };
    const minStock = product.min_stock || 5;
    const percentage = Math.min(100, (stock / (minStock * 2)) * 100);
    if (stock <= minStock) return { color: 'orange', text: `Stock faible: ${stock}`, icon: '⚠️', progress: percentage };
    return { color: 'green', text: `${stock} en stock`, icon: '✓', progress: 100 };
  };

  const getProductTypeTag = (product: Product) => {
    if (product.frame_type) {
      const types: Record<string, string> = {
        'full_rim': 'Pleine monture',
        'semi_rimless': 'Semi-monture',
        'rimless': 'Sans monture'
      };
      return <Tag color="blue">{types[product.frame_type] || product.frame_type}</Tag>;
    }
    if (product.accessory_type) {
      const accessoryTypes: Record<string, string> = {
        'case': '📦 Étui',
        'cleaner': '🧴 Nettoyant',
        'clip': '☀️ Clip solaire',
        'strap': '🔗 Cordons'
      };
      return <Tag color="purple">{accessoryTypes[product.accessory_type] || product.accessory_type}</Tag>;
    }
    return <Tag color="default">📌 Produit</Tag>;
  };

const handleFilterChange = (key: keyof FilterState, value: any) => {
  console.log(`🔧 Filtre changé: ${key} =`, value);
  setFilters(prev => ({ ...prev, [key]: value }));
};

  const clearFilters = () => {
    setFilters({
      search: '',
      frame_type: null,
      gender: null,
      material: null,
      stock_status: null,
      price_range: [0, 20000],
      is_active: true,
      is_featured: null,
      product_type: 'all'
    });
  };

  // Filtrage des produits optimisé avec useMemo
  const filteredProducts = useMemo(() => {
  console.log('🔍 FILTRAGE - produits:', products.length);
  console.log('🔍 FILTRAGE - search:', filters.search);
    return products.filter(product => {
      // Filtre par recherche
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchRef = product.reference?.toLowerCase().includes(searchLower);
        const matchName = product.name?.toLowerCase().includes(searchLower);
        const matchSku = product.sku?.toLowerCase().includes(searchLower);
        if (!matchRef && !matchName && !matchSku) return false;
      }
      
      // Filtre type de produit
      if (filters.product_type === 'frame' && !product.frame_type) return false;
      if (filters.product_type === 'accessory' && !product.accessory_type) return false;
      
      // Filtre type de monture
      if (filters.frame_type && product.frame_type !== filters.frame_type) return false;
      
      // Filtre genre
      if (filters.gender && product.gender !== filters.gender) return false;
      
      // Filtre matériau
      if (filters.material && product.material !== filters.material) return false;
      
      // Filtre prix
      const price = product.price_cents / 100;
      if (price < filters.price_range[0] || price > filters.price_range[1]) return false;
      
      // Filtre actif
      if (filters.is_active !== null && product.is_active !== filters.is_active) return false;
      
      // Filtre vedette
      if (filters.is_featured !== null && product.is_featured !== filters.is_featured) return false;
      
      // Filtre stock
      if (filters.stock_status) {
        const stock = product.stock_quantity || 0;
        if (filters.stock_status === 'out_of_stock' && stock > 0) return false;
        if (filters.stock_status === 'low_stock' && (stock > (product.min_stock || 5) || stock === 0)) return false;
        if (filters.stock_status === 'in_stock' && stock === 0) return false;
      }
      
      return true;
    });
  }, [products, filters]);

  // Statistiques
  const stats = useMemo(() => {
    const total = products.length;
    const active = products.filter(p => p.is_active).length;
    const outOfStock = products.filter(p => (p.stock_quantity || 0) === 0).length;
    const lowStock = products.filter(p => (p.stock_quantity || 0) > 0 && (p.stock_quantity || 0) <= (p.min_stock || 5)).length;
    const featured = products.filter(p => p.is_featured).length;
    const frames = products.filter(p => p.frame_type).length;
    const accessories = products.filter(p => p.accessory_type).length;
    
    return { total, active, outOfStock, lowStock, featured, frames, accessories };
  }, [products]);

  const columns = [
    {
      title: 'Référence',
      dataIndex: 'reference',
      key: 'reference',
      width: 120,
      fixed: 'left' as const,
      render: (text: string, record: Product) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{text}</div>
          {record.sku && <div style={{ fontSize: 11, color: '#999' }}>SKU: {record.sku}</div>}
        </div>
      )
    },
    {
      title: 'Nom',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (text: string, record: Product) => (
        <div>
          <div>{text}</div>
          {record.is_featured && <Tag icon={<StarOutlined />} color="gold" style={{ marginTop: 4 }}>En vedette</Tag>}
        </div>
      )
    },
    {
      title: 'Type',
      key: 'type',
      width: 120,
      render: (_: any, record: Product) => getProductTypeTag(record)
    },
    {
      title: 'Caractéristiques',
      key: 'features',
      width: 200,
      render: (_: any, record: Product) => {
        if (record.frame_type) {
          return (
            <Space size={4} wrap>
              {record.material && <Tag>{record.material}</Tag>}
              {record.gender && <Tag>{record.gender === 'homme' ? '👨 Homme' : record.gender === 'femme' ? '👩 Femme' : record.gender}</Tag>}
              {record.shape && <Tag>{record.shape}</Tag>}
              {record.lens_width && <Tag>{record.lens_width}mm</Tag>}
            </Space>
          );
        }
        return <span style={{ color: '#999' }}>-</span>;
      }
    },
    {
      title: 'Prix TTC',
      dataIndex: 'price_cents',
      key: 'price_cents',
      width: 100,
      align: 'right' as const,
      render: (value: number) => (
        <Text strong style={{ color: '#ff4d4f' }}>
          {(value / 100).toFixed(2)} DH
        </Text>
      )
    },
    {
      title: 'Stock',
      key: 'stock',
      width: 150,
      render: (_: any, record: Product) => {
        const status = getStockStatus(record);
        return (
          <div>
            <Tag color={status.color}>{status.icon} {status.text}</Tag>
            {status.progress > 0 && status.progress < 100 && (
              <Progress percent={status.progress} size="small" showInfo={false} style={{ marginTop: 4 }} />
            )}
          </div>
        );
      }
    },
    {
      title: 'Statut',
      key: 'status',
      width: 80,
      render: (_: any, record: Product) => (
        <Badge 
          status={record.is_active ? 'success' : 'default'} 
          text={record.is_active ? 'Actif' : 'Inactif'} 
        />
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: Product) => (
        <Space>
          <Tooltip title="Voir détails">
            <Button icon={<EyeOutlined />} size="small" onClick={() => handleViewDetails(record)} />
          </Tooltip>
          <Tooltip title="Modifier">
            <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm title="Supprimer ce produit ?" onConfirm={() => handleDelete(record.id)} okText="Oui" cancelText="Non">
            <Tooltip title="Supprimer">
              <Button danger icon={<DeleteOutlined />} size="small" />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <Card
      title={
        <Space>
          <ShoppingCartOutlined />
          <span>📦 Gestion des produits</span>
          <Badge count={filteredProducts.length} showZero style={{ backgroundColor: '#52c41a' }} />
        </Space>
      }
      extra={
        <Space>
          {/* Statistiques rapides */}
          <Tooltip title={`${stats.active} actifs / ${stats.total} total`}>
            <Tag color="green">Actifs: {stats.active}</Tag>
          </Tooltip>
          {stats.outOfStock > 0 && (
            <Tooltip title={`${stats.outOfStock} produits en rupture`}>
              <Tag color="red">⚠️ Rupture: {stats.outOfStock}</Tag>
            </Tooltip>
          )}
          {stats.lowStock > 0 && (
            <Tooltip title={`${stats.lowStock} stocks faibles`}>
              <Tag color="orange">Stock faible: {stats.lowStock}</Tag>
            </Tooltip>
          )}
          
          <Tooltip title="Filtres avancés">
            <Button icon={<FilterOutlined />} onClick={() => setShowFilters(!showFilters)} type={showFilters ? 'primary' : 'default'} />
          </Tooltip>
          
          <Tooltip title="Exporter CSV">
            <Button icon={<DownloadOutlined />} onClick={handleExport} loading={exporting} />
          </Tooltip>
          
          <Tooltip title="Actualiser">
            <Button icon={<ReloadOutlined />} onClick={fetchProducts} />
          </Tooltip>
          
<Search
  placeholder="Rechercher..."
  allowClear
  style={{ width: 250 }}
  value={filters.search}
  onChange={(e) => handleFilterChange('search', e.target.value)}
  onSearch={(value) => handleFilterChange('search', value)}
  prefix={<SearchOutlined />}
/>

         
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Nouveau produit
          </Button>
        </Space>
      }
    >
      {/* Filtres avancés */}
      {showFilters && (
        <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
          <Row gutter={[16, 16]}>
            <Col span={4}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>Type</div>
              <Select
                style={{ width: '100%' }}
                placeholder="Tous"
                allowClear
                value={filters.product_type}
                onChange={(value) => handleFilterChange('product_type', value)}
              >
                <Option value="all">Tous</Option>
                <Option value="frame">👓 Montures</Option>
                <Option value="accessory">📎 Accessoires</Option>
              </Select>
            </Col>
            <Col span={4}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>Type monture</div>
              <Select
                style={{ width: '100%' }}
                placeholder="Tous"
                allowClear
                value={filters.frame_type}
                onChange={(value) => handleFilterChange('frame_type', value)}
                disabled={filters.product_type === 'accessory'}
              >
                <Option value="full_rim">Pleine monture</Option>
                <Option value="semi_rimless">Semi-monture</Option>
                <Option value="rimless">Sans monture</Option>
              </Select>
            </Col>
            <Col span={4}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>Genre</div>
              <Select
                style={{ width: '100%' }}
                placeholder="Tous"
                allowClear
                value={filters.gender}
                onChange={(value) => handleFilterChange('gender', value)}
                disabled={filters.product_type === 'accessory'}
              >
                <Option value="homme">👨 Homme</Option>
                <Option value="femme">👩 Femme</Option>
                <Option value="unisex">👥 Unisexe</Option>
                <Option value="enfant">🧒 Enfant</Option>
              </Select>
            </Col>
            <Col span={4}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>Matériau</div>
              <Select
                style={{ width: '100%' }}
                placeholder="Tous"
                allowClear
                value={filters.material}
                onChange={(value) => handleFilterChange('material', value)}
                disabled={filters.product_type === 'accessory'}
              >
                <Option value="acetate">Acétate</Option>
                <Option value="metal">Métal</Option>
                <Option value="titanium">Titane</Option>
                <Option value="plastic">Plastique</Option>
              </Select>
            </Col>
            <Col span={4}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>Statut stock</div>
              <Select
                style={{ width: '100%' }}
                placeholder="Tous"
                allowClear
                value={filters.stock_status}
                onChange={(value) => handleFilterChange('stock_status', value)}
              >
                <Option value="in_stock">✅ En stock</Option>
                <Option value="low_stock">⚠️ Stock faible</Option>
                <Option value="out_of_stock">❌ Rupture</Option>
              </Select>
            </Col>
            <Col span={4}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>Vedette</div>
              <Select
                style={{ width: '100%' }}
                placeholder="Tous"
                allowClear
                value={filters.is_featured}
                onChange={(value) => handleFilterChange('is_featured', value)}
              >
                <Option value={true}>⭐ En vedette</Option>
                <Option value={false}>Standard</Option>
              </Select>
            </Col>
          </Row>
          
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col span={12}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>
                Prix: {filters.price_range[0]} - {filters.price_range[1]} DH
              </div>
              <Slider
                range
                min={0}
                max={20000}
                value={filters.price_range}
                onChange={(value: number[]) => handleFilterChange('price_range', value)}
                tooltip={{ formatter: (value) => `${value} DH` }}
              />
            </Col>
            <Col span={12}>
              <Space style={{ marginTop: 24 }}>
                <Switch
                  checked={filters.is_active === true}
                  onChange={(checked) => handleFilterChange('is_active', checked ? true : null)}
                  checkedChildren="Actifs uniquement"
                  unCheckedChildren="Tous"
                />
                <Button icon={<ClearOutlined />} onClick={clearFilters}>
                  Effacer tous les filtres
                </Button>
              </Space>
            </Col>
          </Row>
          
          {/* Filtres actifs */}
          {(filters.frame_type || filters.gender || filters.material || filters.stock_status || filters.is_featured !== null || filters.product_type !== 'all') && (
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">Filtres actifs :</Text>
              <Space wrap style={{ marginTop: 8 }}>
                {filters.product_type !== 'all' && (
                  <Tag closable onClose={() => handleFilterChange('product_type', 'all')}>
                    Type: {filters.product_type === 'frame' ? 'Montures' : 'Accessoires'}
                  </Tag>
                )}
                {filters.frame_type && (
                  <Tag closable onClose={() => handleFilterChange('frame_type', null)}>
                    Monture: {filters.frame_type}
                  </Tag>
                )}
                {filters.gender && (
                  <Tag closable onClose={() => handleFilterChange('gender', null)}>
                    Genre: {filters.gender}
                  </Tag>
                )}
                {filters.material && (
                  <Tag closable onClose={() => handleFilterChange('material', null)}>
                    Matériau: {filters.material}
                  </Tag>
                )}
                {filters.stock_status && (
                  <Tag closable onClose={() => handleFilterChange('stock_status', null)}>
                    Stock: {filters.stock_status === 'in_stock' ? 'En stock' : filters.stock_status === 'low_stock' ? 'Stock faible' : 'Rupture'}
                  </Tag>
                )}
                {filters.is_featured !== null && (
                  <Tag closable onClose={() => handleFilterChange('is_featured', null)}>
                    {filters.is_featured ? 'En vedette' : 'Standard'}
                  </Tag>
                )}
              </Space>
            </div>
          )}
        </Card>
      )}

      <Table
        columns={columns}
        dataSource={filteredProducts}
        rowKey="id"
        loading={loading}
        pagination={{ 
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `${filteredProducts.length} / ${stats.total} produits affichés`,
          pageSizeOptions: ['10', '20', '50', '100']
        }}
        scroll={{ x: 1200 }}
        bordered
      />
      
      {/* DRAWER pour afficher les détails complets */}
      <Drawer
        title={
          <Space>
            <EyeOutlined />
            <span>Détails du produit</span>
            {selectedProduct?.is_featured && <Tag color="gold">⭐ En vedette</Tag>}
          </Space>
        }
        placement="right"
        width={650}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        extra={
          <Space>
            <Button icon={<EditOutlined />} onClick={() => {
              if (selectedProduct) {
                setDrawerVisible(false);
                handleEdit(selectedProduct);
              }
            }}>
              Modifier
            </Button>
            <Button icon={<CloseOutlined />} onClick={() => setDrawerVisible(false)}>
              Fermer
            </Button>
          </Space>
        }
      >
        {selectedProduct && (
          <>
            {/* En-tête avec statut */}
            <div style={{ marginBottom: 24 }}>
              <Space wrap>
                {getProductTypeTag(selectedProduct)}
                {getStockStatus(selectedProduct).text && (
                  <Tag color={getStockStatus(selectedProduct).color}>
                    {getStockStatus(selectedProduct).icon} {getStockStatus(selectedProduct).text}
                  </Tag>
                )}
                <Badge status={selectedProduct.is_active ? 'success' : 'default'} text={selectedProduct.is_active ? 'Actif' : 'Inactif'} />
              </Space>
            </div>

            {/* Informations générales */}
            <Title level={5}>Informations générales</Title>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Référence">{selectedProduct.reference}</Descriptions.Item>
              {selectedProduct.sku && <Descriptions.Item label="SKU">{selectedProduct.sku}</Descriptions.Item>}
              {selectedProduct.barcode && <Descriptions.Item label="Code-barres">{selectedProduct.barcode}</Descriptions.Item>}
              <Descriptions.Item label="Nom">{selectedProduct.name}</Descriptions.Item>
              <Descriptions.Item label="Description">{selectedProduct.description || '-'}</Descriptions.Item>
            </Descriptions>

            {/* Prix */}
            <Title level={5} style={{ marginTop: 16 }}>Prix</Title>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Prix vente TTC">
                <Text strong style={{ color: '#ff4d4f' }}>{(selectedProduct.price_cents / 100).toFixed(2)} DH</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Prix achat HT">
                {selectedProduct.purchase_price_cents ? `${(selectedProduct.purchase_price_cents / 100).toFixed(2)} DH` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="TVA">{selectedProduct.tva_rate || 20}%</Descriptions.Item>
              {selectedProduct.purchase_price_cents && selectedProduct.price_cents && (
                <Descriptions.Item label="Marge">
                  <Tag color="green">
                    {Math.round(((selectedProduct.price_cents - selectedProduct.purchase_price_cents) / selectedProduct.purchase_price_cents) * 100)}%
                  </Tag>
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* Stock */}
            <Title level={5} style={{ marginTop: 16 }}>Stock & Logistique</Title>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Stock physique">{selectedProduct.stock_quantity || 0}</Descriptions.Item>
              <Descriptions.Item label="Stock minimum">{selectedProduct.min_stock || 0}</Descriptions.Item>
              <Descriptions.Item label="Stock disponible">{(selectedProduct.stock_quantity || 0) - (selectedProduct.reserved_quantity || 0)}</Descriptions.Item>
              <Descriptions.Item label="Réservé">{selectedProduct.reserved_quantity || 0}</Descriptions.Item>
              {selectedProduct.location && <Descriptions.Item label="Emplacement" span={2}>{selectedProduct.location}</Descriptions.Item>}
            </Descriptions>

            {/* Caractéristiques optiques (pour montures) */}
            {selectedProduct.frame_type && (
              <>
                <Title level={5} style={{ marginTop: 16 }}>Caractéristiques optiques</Title>
                <Descriptions bordered column={2} size="small">
                  <Descriptions.Item label="Type de monture">
                    {selectedProduct.frame_type === 'full_rim' ? 'Pleine monture' : 
                     selectedProduct.frame_type === 'semi_rimless' ? 'Semi-monture' : 
                     selectedProduct.frame_type === 'rimless' ? 'Sans monture' : selectedProduct.frame_type}
                  </Descriptions.Item>
                  <Descriptions.Item label="Genre">
                    {selectedProduct.gender === 'homme' ? '👨 Homme' : 
                     selectedProduct.gender === 'femme' ? '👩 Femme' : 
                     selectedProduct.gender === 'unisex' ? '👥 Unisexe' : 
                     selectedProduct.gender === 'enfant' ? '🧒 Enfant' : selectedProduct.gender}
                  </Descriptions.Item>
                  <Descriptions.Item label="Forme">{selectedProduct.shape || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Matériau">{selectedProduct.material || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Couleur monture">{selectedProduct.frame_color || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Couleur branches">{selectedProduct.temple_color || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Largeur verre">{selectedProduct.lens_width ? `${selectedProduct.lens_width} mm` : '-'}</Descriptions.Item>
                  <Descriptions.Item label="Pont">{selectedProduct.bridge_width ? `${selectedProduct.bridge_width} mm` : '-'}</Descriptions.Item>
                  <Descriptions.Item label="Longueur branche">{selectedProduct.temple_length ? `${selectedProduct.temple_length} mm` : '-'}</Descriptions.Item>
                  <Descriptions.Item label="Hauteur verre">{selectedProduct.lens_height ? `${selectedProduct.lens_height} mm` : '-'}</Descriptions.Item>
                  <Descriptions.Item label="Base curve">{selectedProduct.base_curve || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Taille code">{selectedProduct.size_code || '-'}</Descriptions.Item>
                </Descriptions>
              </>
            )}

            {/* Accessoires */}
            {selectedProduct.accessory_type && (
              <>
                <Title level={5} style={{ marginTop: 16 }}>Informations accessoire</Title>
                <Descriptions bordered column={2} size="small">
                  <Descriptions.Item label="Type d'accessoire">
                    {selectedProduct.accessory_type === 'case' ? '📦 Étui' :
                     selectedProduct.accessory_type === 'cleaner' ? '🧴 Nettoyant' :
                     selectedProduct.accessory_type === 'clip' ? '☀️ Clip solaire' : 
                     selectedProduct.accessory_type === 'strap' ? '🔗 Cordons' : selectedProduct.accessory_type}
                  </Descriptions.Item>
                  <Descriptions.Item label="Consommable">
                    {selectedProduct.consumable ? <CheckOutlined style={{ color: 'green' }} /> : <CloseOutlined style={{ color: 'red' }} />}
                  </Descriptions.Item>
                </Descriptions>
              </>
            )}

            {/* Métadonnées */}
            <Title level={5} style={{ marginTop: 16 }}>Métadonnées</Title>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Créé le">{new Date(selectedProduct.created_at).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="Modifié le">{selectedProduct.updated_at ? new Date(selectedProduct.updated_at).toLocaleString() : '-'}</Descriptions.Item>
              <Descriptions.Item label="ID" span={2}>{selectedProduct.id}</Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Drawer>
      
      {/* Modal de création/édition */}
      <Modal
        title={editingProduct ? '✏️ Modifier le produit' : '➕ Nouveau produit'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        width={900}
        okText="Enregistrer"
        cancelText="Annuler"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Tabs defaultActiveKey="general" size="small">
            <Tabs.TabPane tab="📋 Général" key="general">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="reference" label="Référence" rules={[{ required: true, message: 'Référence requise' }]}>
                    <Input placeholder="Ex: MNT-001" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="name" label="Nom du produit" rules={[{ required: true, message: 'Nom requis' }]}>
                    <Input placeholder="Ex: Ray-Ban Wayfarer" />
                  </Form.Item>
                </Col>
              </Row>
              
              <Form.Item name="description" label="Description">
                <Input.TextArea rows={3} placeholder="Description du produit..." />
              </Form.Item>
              
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="price" label="Prix de vente TTC (DH)">
                    <InputNumber style={{ width: '100%' }} min={0} step={10} placeholder="0.00" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="purchase_price" label="Prix d'achat HT (DH)">
                    <InputNumber style={{ width: '100%' }} min={0} step={10} placeholder="0.00" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="tva_rate" label="TVA (%)" initialValue={20}>
                    <InputNumber style={{ width: '100%' }} min={0} max={20} />
                  </Form.Item>
                </Col>
              </Row>
            </Tabs.TabPane>
            
            <Tabs.TabPane tab="👓 Optique" key="optical">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="frame_type" label="Type de monture">
                    <Select placeholder="Sélectionner" allowClear>
                      <Option value="full_rim">Pleine monture</Option>
                      <Option value="semi_rimless">Semi-monture</Option>
                      <Option value="rimless">Sans monture</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="gender" label="Genre">
                    <Select placeholder="Sélectionner" allowClear>
                      <Option value="homme">👨 Homme</Option>
                      <Option value="femme">👩 Femme</Option>
                      <Option value="unisex">👥 Unisexe</Option>
                      <Option value="enfant">🧒 Enfant</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="material" label="Matériau">
                    <Select placeholder="Sélectionner" allowClear>
                      <Option value="acetate">Acétate</Option>
                      <Option value="metal">Métal</Option>
                      <Option value="titanium">Titane</Option>
                      <Option value="plastic">Plastique</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="shape" label="Forme">
                    <Select placeholder="Sélectionner" allowClear>
                      <Option value="wayfarer">Wayfarer</Option>
                      <Option value="round">Ronde</Option>
                      <Option value="square">Carrée</Option>
                      <Option value="cat-eye">Cat Eye</Option>
                      <Option value="aviator">Aviator</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="lens_width" label="Largeur verre (mm)">
                    <InputNumber style={{ width: '100%' }} min={30} max={70} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="bridge_width" label="Pont (mm)">
                    <InputNumber style={{ width: '100%' }} min={10} max={25} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="temple_length" label="Branche (mm)">
                    <InputNumber style={{ width: '100%' }} min={120} max={160} />
                  </Form.Item>
                </Col>
              </Row>
              
              <Form.Item name="frame_color" label="Couleur monture">
                <Input placeholder="Ex: noir, doré, tortoise..." />
              </Form.Item>
            </Tabs.TabPane>
            
            <Tabs.TabPane tab="📦 Stock" key="stock">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="stock_quantity" label="Stock initial" initialValue={0}>
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="min_stock" label="Stock minimum" initialValue={5}>
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
              </Row>
              
              <Form.Item name="location" label="Emplacement">
                <Input placeholder="Ex: Aile A - Rayon 3" />
              </Form.Item>
              
              <Form.Item name="barcode" label="Code-barres">
                <Input placeholder="Scan ou saisie manuelle" />
              </Form.Item>
              
              <Form.Item name="sku" label="SKU">
                <Input placeholder="Stock Keeping Unit" />
              </Form.Item>
            </Tabs.TabPane>
            
            <Tabs.TabPane tab="🎯 Commercial" key="commercial">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="is_featured" label="Produit en vedette" valuePropName="checked">
                    <Switch checkedChildren="⭐ Oui" unCheckedChildren="Non" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="is_active" label="Produit actif" valuePropName="checked" initialValue={true}>
                    <Switch checkedChildren="✅ Actif" unCheckedChildren="❌ Inactif" />
                  </Form.Item>
                </Col>
              </Row>
            </Tabs.TabPane>
          </Tabs>
        </Form>
      </Modal>
    </Card>
  );
};

export default Products;