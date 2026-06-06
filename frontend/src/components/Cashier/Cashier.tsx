// frontend/src/components/Cashier/Cashier.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal, Form, Input, Select, InputNumber, Button, Table,
  message, Card, Space, Typography, Avatar, Tag, Alert,
  Switch, Row, Col, Divider, Badge, Tooltip
} from 'antd';
import {
  ShoppingCartOutlined,
  DeleteOutlined,
  UserOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  SearchOutlined,
  ClearOutlined,
  ShopOutlined
} from '@ant-design/icons';
import { productService, saleService, clientService } from '../../services/api';

const { Option } = Select;
const { Title, Text } = Typography;

// ============================================================
// TYPES LOCAUX (adaptés à votre base de données)
// ============================================================

interface CartItem {
  product_id: string;
  product_name: string;
  reference: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  stock_quantity?: number;
}

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
}

// Interface Product basée sur votre table products
interface LocalProduct {
  id: string;
  reference: string;
  name: string;
  description?: string;
  price_cents: number;
  tva_rate?: number;
  min_stock?: number;
  stock_quantity?: number;
  stock_physical?: number;
  stock?: number;
  is_active?: boolean;
  frame_type?: string;
  accessory_type?: string;
  consumable?: boolean;
  type?: string;
  category?: string;
}

// ============================================================
// FONCTIONS UTILITAIRES
// ============================================================

/**
 * Obtient le stock disponible d'un produit
 * Gère les différentes propriétés possibles (stock_quantity, stock_physical, stock)
 */
const getStockDisponible = (product: LocalProduct): number => {
  if (product.stock_quantity !== undefined && product.stock_quantity !== null) return product.stock_quantity;
  if (product.stock_physical !== undefined && product.stock_physical !== null) return product.stock_physical;
  if (product.stock !== undefined && product.stock !== null) return product.stock;
  return 0; // Valeur par défaut si pas de stock défini
};

/**
 * Détermine la catégorie d'un produit
 */
const getProductCategory = (product: LocalProduct): string => {
  if (product.category) return product.category;
  if (product.frame_type) return 'frame';
  if (product.accessory_type) return 'accessory';
  if (product.consumable) return 'cleaner';
  if (product.type === 'frame') return 'frame';
  if (product.type === 'accessory') return 'accessory';
  return 'other';
};

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

const Cashier: React.FC = () => {
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchResults, setSearchResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchProducts();
    fetchClients();
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
    console.log('📦 Produits chargés (Cashier):', data.data.length);
    setProducts(data.data);
  } catch (error) {
    console.error('❌ Erreur chargement produits:', error);
    message.error('Erreur lors du chargement des produits');
  }
};


  const fetchClients = async () => {
    try {
      const response = await clientService.getAll();
      setClients(response.data.data);
    } catch (error) {
      console.error('Erreur chargement clients');
    }
  };

  const handleClientSearch = (value: string) => {
    if (!value || value.length < 2) {
      setSearchResults([]);
      return;
    }
    
    const results = clients.filter(client => 
      client.first_name?.toLowerCase().includes(value.toLowerCase()) ||
      client.last_name?.toLowerCase().includes(value.toLowerCase()) ||
      client.phone?.includes(value)
    );
    setSearchResults(results.slice(0, 10));
  };

  const handleClientSelect = (value: string) => {
    const client = clients.find(c => c.id === value);
    setSelectedClient(client || null);
    if (client) {
      setIsAnonymous(false);
      form.setFieldsValue({
        customer_name: `${client.first_name} ${client.last_name}`,
        customer_phone: client.phone,
        customer_email: client.email
      });
    }
  };

  const handleClearClient = () => {
    setSelectedClient(null);
    setIsAnonymous(true);
    form.setFieldsValue({
      customer_name: '',
      customer_phone: '',
      customer_email: ''
    });
  };

  const addToCart = (product: LocalProduct) => {
    const stockDispo = getStockDisponible(product);
    
    const existingItem = cart.find(item => item.product_id === product.id);
    
    if (existingItem) {
      const newQuantity = existingItem.quantity + 1;
      if (newQuantity > stockDispo) {
        message.error(`Stock insuffisant. Disponible: ${stockDispo}`);
        return;
      }
      setCart(cart.map(item =>
        item.product_id === product.id
          ? { ...item, quantity: newQuantity, total_cents: newQuantity * item.unit_price_cents }
          : item
      ));
    } else {
      if (1 > stockDispo && stockDispo < 999) {
        message.error(`Stock insuffisant pour ${product.name}`);
        return;
      }
      setCart([...cart, {
        product_id: product.id,
        product_name: product.name,
        reference: product.reference,
        quantity: 1,
        unit_price_cents: product.price_cents,
        total_cents: product.price_cents,
        stock_quantity: stockDispo
      }]);
    }
    message.success(`${product.name} ajouté au panier`);
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    
    const item = cart.find(i => i.product_id === productId);
    if (item && quantity > (item.stock_quantity || 999)) {
      message.error(`Stock maximum: ${item.stock_quantity}`);
      return;
    }
    
    setCart(cart.map(item =>
      item.product_id === productId
        ? { ...item, quantity, total_cents: item.unit_price_cents * quantity }
        : item
    ));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product_id !== productId));
    message.info('Produit retiré du panier');
  };

  const clearCart = () => {
    Modal.confirm({
      title: 'Vider le panier',
      content: 'Êtes-vous sûr de vouloir vider tout le panier ?',
      onOk: () => {
        setCart([]);
        message.info('Panier vidé');
      }
    });
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.total_cents, 0);
  const taxAmount = Math.round(totalAmount * 0.2);
  const totalWithTax = totalAmount + taxAmount;

  // Filtrage des produits avec useMemo pour performance
  const filteredProducts = useMemo(() => {
    let filtered = products;
    
    if (searchText) {
      filtered = filtered.filter(p =>
        p.name?.toLowerCase().includes(searchText.toLowerCase()) ||
        p.reference?.toLowerCase().includes(searchText.toLowerCase())
      );
    }
    
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(p => getProductCategory(p) === selectedCategory);
    }
    
    return filtered;
  }, [products, searchText, selectedCategory]);

  const handleCheckout = async (values: any) => {
    if (cart.length === 0) {
      message.warning('Panier vide');
      return;
    }

    setLoading(true);
    try {
      let clientId = null;
      let customerName = values.customer_name;
      
      if (!isAnonymous && selectedClient) {
        clientId = selectedClient.id;
        customerName = `${selectedClient.first_name} ${selectedClient.last_name}`;
      } else if (!customerName || customerName.trim() === '') {
        customerName = 'Client comptoir';
      }
      
      const saleData = {
        client_id: clientId,
        customer_name: customerName,
        customer_email: values.customer_email || null,
        customer_phone: values.customer_phone || null,
        payment_method: values.payment_method,
        is_anonymous: isAnonymous && !selectedClient,
        items: cart.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price_cents: item.unit_price_cents,
          total_cents: item.total_cents
        })),
        total_cents: totalWithTax
      };

      console.log('📤 Envoi vente:', saleData);

      const response = await saleService.create(saleData);
      
      console.log('✅ Réponse:', response.data);
      
      message.success(
        isAnonymous || !selectedClient
          ? `Vente anonyme enregistrée - ${(totalWithTax / 100).toFixed(2)} DH`
          : `Vente enregistrée pour ${customerName} - ${(totalWithTax / 100).toFixed(2)} DH`
      );
      await fetchProducts();
      setCart([]);
      setModalVisible(false);
      setSelectedClient(null);
      setIsAnonymous(true);
      form.resetFields();
      
    } catch (error: any) {
      console.error('❌ Erreur vente:', error);
      message.error(error.response?.data?.error || 'Erreur lors de la vente');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { 
      title: 'Référence', 
      dataIndex: 'reference', 
      key: 'reference',
      width: 120,
      render: (ref: string) => <Tag color="blue">{ref}</Tag>
    },
    { 
      title: 'Produit', 
      dataIndex: 'product_name', 
      key: 'product_name',
      width: 200
    },
    {
      title: 'Quantité',
      key: 'quantity',
      width: 100,
      render: (_: any, record: CartItem) => (
        <InputNumber
          min={1}
          max={record.stock_quantity || 999}
          value={record.quantity}
          onChange={(value) => updateQuantity(record.product_id, value || 1)}
          size="small"
          style={{ width: 80 }}
        />
      )
    },
    { 
      title: 'Prix unitaire', 
      dataIndex: 'unit_price_cents', 
      key: 'unit_price_cents',
      width: 120,
      align: 'right' as const,
      render: (price: number) => `${(price / 100).toFixed(2)} DH`
    },
    { 
      title: 'Total', 
      dataIndex: 'total_cents', 
      key: 'total_cents',
      width: 120,
      align: 'right' as const,
      render: (total: number) => (
        <Text strong style={{ color: '#1890ff' }}>
          {(total / 100).toFixed(2)} DH
        </Text>
      )
    },
    {
      title: 'Action',
      key: 'action',
      width: 80,
      render: (_: any, record: CartItem) => (
        <Tooltip title="Retirer">
          <Button icon={<DeleteOutlined />} danger size="small" onClick={() => removeFromCart(record.product_id)} />
        </Tooltip>
      )
    }
  ];

  // Catégories pour le filtrage
  const categories = [
    { value: 'all', label: 'Tous' },
    { value: 'frame', label: '👓 Montures' },
    { value: 'accessory', label: '📎 Accessoires' },
    { value: 'cleaner', label: '🧴 Nettoyants' },
    { value: 'case', label: '📦 Étuis' },
    { value: 'other', label: '📌 Autres' }
  ];

  return (
    <div>
      <Title level={2}>
        <ShopOutlined /> Caisse enregistreuse
      </Title>
      
      <Row gutter={16}>
        {/* Colonne gauche - Produits */}
        <Col span={16}>
          <Card 
            title="🛍️ Produits disponibles"
            extra={
              <Space>
                <Input
                  placeholder="Rechercher..."
                  prefix={<SearchOutlined />}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  style={{ width: 200 }}
                  allowClear
                />
                <Select
                  value={selectedCategory}
                  onChange={setSelectedCategory}
                  style={{ width: 120 }}
                >
                  {categories.map(cat => (
                    <Option key={cat.value} value={cat.value}>{cat.label}</Option>
                  ))}
                </Select>
              </Space>
            }
            style={{ marginBottom: 24 }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, maxHeight: 500, overflowY: 'auto' }}>
              {filteredProducts.map(product => {
                const stockDispo = getStockDisponible(product);
                const isLowStock = stockDispo <= (product.min_stock || 3);
                
                return (
                  <Card
                    key={product.id}
                    size="small"
                    hoverable
                    onClick={() => addToCart(product)}
                    style={{ 
                      cursor: 'pointer',
                      borderColor: isLowStock ? '#ff4d4f' : undefined,
                      opacity: stockDispo === 0 ? 0.5 : 1
                    }}
                  >
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Text strong style={{ fontSize: 13 }}>{product.name}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{product.reference}</Text>
                      <Text strong style={{ color: '#1890ff', fontSize: 14 }}>
                        {(product.price_cents / 100).toFixed(2)} DH
                      </Text>
                      <Tag color={stockDispo > 5 ? 'green' : isLowStock ? 'orange' : 'blue'} style={{ fontSize: 11 }}>
                        Stock: {stockDispo}
                      </Tag>
                    </Space>
                  </Card>
                );
              })}
            </div>
            {filteredProducts.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Text type="secondary">Aucun produit trouvé</Text>
              </div>
            )}
          </Card>
        </Col>

        {/* Colonne droite - Panier */}
        <Col span={8}>
          <Card 
            title={
              <Space>
                <ShoppingCartOutlined />
                <span>Panier</span>
                <Badge count={cart.length} showZero />
              </Space>
            }
            extra={
              cart.length > 0 && (
                <Button size="small" danger icon={<ClearOutlined />} onClick={clearCart}>
                  Vider
                </Button>
              )
            }
          >
            {cart.length > 0 ? (
              <>
                <Table 
                  columns={columns} 
                  dataSource={cart} 
                  rowKey="product_id" 
                  pagination={false} 
                  size="small"
                  scroll={{ y: 300 }}
                />
                <Divider style={{ margin: '12px 0' }} />
                <div style={{ textAlign: 'right' }}>
                  <Space direction="vertical" size="small" style={{ width: '100%', textAlign: 'right' }}>
                    <Row>
                      <Col span={12}><Text type="secondary">Total HT:</Text></Col>
                      <Col span={12}><Text>{(totalAmount / 100).toFixed(2)} DH</Text></Col>
                    </Row>
                    <Row>
                      <Col span={12}><Text type="secondary">TVA (20%):</Text></Col>
                      <Col span={12}><Text>{(taxAmount / 100).toFixed(2)} DH</Text></Col>
                    </Row>
                    <Row>
                      <Col span={12}><Text strong style={{ fontSize: 16 }}>Total TTC:</Text></Col>
                      <Col span={12}>
                        <Text strong style={{ fontSize: 18, color: '#1890ff' }}>
                          {(totalWithTax / 100).toFixed(2)} DH
                        </Text>
                      </Col>
                    </Row>
                    <Button 
                      type="primary" 
                      size="large" 
                      icon={<DollarOutlined />}
                      onClick={() => setModalVisible(true)}
                      block
                      style={{ marginTop: 8 }}
                    >
                      Finaliser la vente
                    </Button>
                  </Space>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <ShoppingCartOutlined style={{ fontSize: 48, color: '#ccc' }} />
                <p style={{ marginTop: 16, color: '#999' }}>Panier vide</p>
                <Text type="secondary">Ajoutez des produits pour commencer</Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Modal de finalisation */}
      <Modal
        title={
          <Space>
            <DollarOutlined />
            <span>Finaliser la vente</span>
            <Tag color="green">{(totalWithTax / 100).toFixed(2)} DH</Tag>
          </Space>
        }
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleCheckout} initialValues={{ payment_method: 'cash' }}>
          {/* Client anonyme vs identifié */}
          <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
            <Row align="middle">
              <Col span={12}>
                <Text strong>👤 Client anonyme</Text>
              </Col>
              <Col span={12}>
                <Switch
                  checked={!isAnonymous}
                  onChange={(checked) => {
                    setIsAnonymous(!checked);
                    if (!checked) {
                      setSelectedClient(null);
                      form.setFieldsValue({
                        customer_name: '',
                        customer_phone: '',
                        customer_email: ''
                      });
                    }
                  }}
                  checkedChildren="Avec client"
                  unCheckedChildren="Anonyme"
                />
              </Col>
            </Row>
          </Card>

          {!isAnonymous ? (
            <>
              <Form.Item label="Rechercher un client">
                <Select
                  showSearch
                  placeholder="Nom, téléphone..."
                  style={{ width: '100%' }}
                  onSearch={handleClientSearch}
                  onSelect={handleClientSelect}
                  onClear={handleClearClient}
                  allowClear
                  filterOption={false}
                >
                  {searchResults.map(client => (
                    <Option key={client.id} value={client.id}>
                      <Space>
                        <Avatar size="small" icon={<UserOutlined />} />
                        {client.first_name} {client.last_name}
                        <Text type="secondary">{client.phone}</Text>
                      </Space>
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              {selectedClient && (
                <Alert
                  message="Client identifié"
                  description={`${selectedClient.first_name} ${selectedClient.last_name} - ${selectedClient.phone}`}
                  type="success"
                  showIcon
                  icon={<CheckCircleOutlined />}
                  style={{ marginBottom: 16 }}
                />
              )}
            </>
          ) : (
            <Alert
              message="Vente anonyme"
              description="Cette vente sera enregistrée sans association à un client. Vous pourrez l'associer plus tard."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          <Form.Item 
            name="customer_name" 
            label="Nom du client" 
            hidden={!isAnonymous && !!selectedClient}
          >
            <Input placeholder="Client comptoir" />
          </Form.Item>

          <Form.Item 
            name="customer_phone" 
            label="Téléphone" 
            hidden={!isAnonymous && !!selectedClient}
          >
            <Input placeholder="Optionnel" />
          </Form.Item>

          <Form.Item 
            name="customer_email" 
            label="Email" 
            hidden={!isAnonymous && !!selectedClient}
          >
            <Input type="email" placeholder="Optionnel" />
          </Form.Item>

          <Form.Item name="payment_method" label="Mode de paiement" rules={[{ required: true }]}>
            <Select size="large">
              <Option value="cash">💰 Espèces</Option>
              <Option value="card">💳 Carte bancaire</Option>
              <Option value="transfer">🏦 Virement</Option>
              <Option value="check">📝 Chèque</Option>
            </Select>
          </Form.Item>

          <Divider />

          <div style={{ marginBottom: 16, textAlign: 'center' }}>
            <Text type="secondary">Total à payer</Text>
            <Title level={2} style={{ color: '#1890ff', margin: 0 }}>
              {(totalWithTax / 100).toFixed(2)} DH
            </Title>
          </div>

          <Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              <DollarOutlined /> Confirmer la vente
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Cashier;