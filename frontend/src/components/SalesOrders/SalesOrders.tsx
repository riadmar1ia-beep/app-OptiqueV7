// SalesOrders.tsx - Version complète avec API V2
import React, { useState, useEffect } from 'react';
import { 
  Table, Card, Button, Space, Tag, Typography, Popconfirm, Badge, Tooltip, message, Tabs
} from 'antd';
import { 
  EyeOutlined, CheckCircleOutlined, DeleteOutlined,
  ShoppingOutlined, ExperimentOutlined, CarOutlined, WarningOutlined,
  PlusOutlined, UserOutlined, ShoppingCartOutlined, ApiOutlined
} from '@ant-design/icons';

import { globalOrderService, invoiceService } from '../../services/api';
import { apiV2, SalesOrder as SalesOrderV2, OpticalJob } from '../../services/apiV2';
import { useSalesOrdersV2, useOpticalJobsV2 } from '../../hooks/useSalesOrdersV2';
import ConfirmOrderModal from './components/ConfirmOrderModal';
import DeliverModal from './components/DeliverModal';
import DirectSaleDetailModal from './components/DirectSaleDetailModal';
import OrderDetailModal from './components/OrderDetailModal';
import NewOrderModal from './components/NewOrderModal';
import api from '../../services/api';

const { Text } = Typography;

interface SalesOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  status: string;
  payment_status: string;
  total_ht_cents?: number;
  total_ttc_cents?: number;
  created_at: string;
  items_count: number;
  order_type: string;
}

const SalesOrders: React.FC = () => {
  // État pour les données V2
  const { orders: v2Orders, loading: v2Loading, error: v2Error, refresh: refreshV2 } = useSalesOrdersV2();
  const { jobs: v2Jobs, getJobsByOrderId } = useOpticalJobsV2();
  
  // État pour les données legacy
  const [opticalOrders, setOpticalOrders] = useState<SalesOrder[]>([]);
  const [clientDirectSales, setClientDirectSales] = useState<any[]>([]);
  const [cashierSales, setCashierSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('optical');
  const [useV2, setUseV2] = useState(true); // Toggle pour passer en V2
  
  // États pour les modals
  const [modalVisible, setModalVisible] = useState(false);
  const [deliverModalVisible, setDeliverModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [directSaleDetailVisible, setDirectSaleDetailVisible] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [selectedSale, setSelectedSale] = useState<any>(null);

  useEffect(() => {
    if (useV2) {
      fetchV2Data();
    } else {
      fetchLegacyData();
    }
  }, [useV2]);

  // Récupération des données V2
  const fetchV2Data = async () => {
    setLoading(true);
    try {
      await refreshV2();
      // Transformer les données V2 au format attendu par le tableau
      const transformedOrders = v2Orders.map(order => ({
        id: order.id,
        order_number: order.order_number,
        customer_name: `Client ${order.client_id.substring(0, 8)}...`,
        customer_email: '',
        customer_phone: '',
        status: order.status,
        payment_status: order.payment_status,
        total_ht_cents: Math.round(order.total_ht * 100),
        total_ttc_cents: Math.round(order.total_ttc * 100),
        created_at: order.created_at,
        items_count: getJobsByOrderId(order.id).length + 1,
        order_type: 'optical'
      }));
      setOpticalOrders(transformedOrders);
    } catch (error) {
      console.error('Erreur V2:', error);
      message.error('Erreur chargement données V2');
    } finally {
      setLoading(false);
    }
  };

  // Récupération des données legacy
  const fetchLegacyData = async () => {
    setLoading(true);
    try {
      const ordersRes = await globalOrderService.getAll();
      const optical = (ordersRes.data.data?.optical_orders || [])
        .filter((order: any) => order.order_type === 'optical')
        .map((order: any) => ({ ...order, display_type: 'optical' }));
      
      setOpticalOrders(optical);
      
      const invoicesRes = await api.get('/sales-invoices');
      const allInvoices = invoicesRes.data.data || [];
      
      const directSales = allInvoices
        .filter((inv: any) => inv.document_origin === 'direct_sale')
        .map((inv: any) => ({
          id: inv.id,
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          customer_name: inv.customer_name || 'Client',
          total_cents: inv.amount_ttc_cents || 0,
          payment_method: inv.payment_method,
          created_at: inv.created_at,
          items_count: inv.items_count || 1,
          source: 'client_direct',
          client_id: inv.client_id,
          document_origin: inv.document_origin
        }));
      
      const cashier = allInvoices
        .filter((inv: any) => inv.document_origin === 'cashier_sale')
        .map((inv: any) => ({
          id: inv.id,
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          customer_name: inv.customer_name || 'Client comptoir',
          total_cents: inv.amount_ttc_cents || 0,
          payment_method: inv.payment_method,
          created_at: inv.created_at,
          items_count: inv.items_count || 1,
          source: 'cashier',
          client_id: null,
          document_origin: inv.document_origin
        }));
      
      setClientDirectSales(directSales);
      setCashierSales(cashier);
    } catch (error) {
      console.error('Erreur:', error);
      message.error('Erreur chargement commandes');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    try {
      const response = await globalOrderService.delete(orderId);
      message.success(response.data.message);
      if (useV2) {
        refreshV2();
      } else {
        fetchLegacyData();
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      draft: { color: 'default', text: '📝 Brouillon' },
      pending: { color: 'blue', text: '⏳ En attente' },
      confirmed: { color: 'orange', text: '✅ Confirmée' },
      in_production: { color: 'purple', text: '🔧 En production' },
      ready: { color: 'green', text: '🎯 Prête' },
      delivered: { color: 'cyan', text: '📦 Livrée' },
      cancelled: { color: 'red', text: '❌ Annulée' }
    };
    const s = statusMap[status] || { color: 'default', text: status };
    return <Tag color={s.color}>{s.text}</Tag>;
  };

  const getPaymentStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      pending: { color: 'orange', text: 'En attente' },
      paid: { color: 'green', text: 'Payée' },
      partial: { color: 'blue', text: 'Partiel' },
      unpaid: { color: 'red', text: 'Impayée' }
    };
    const s = statusMap[status] || { color: 'default', text: status };
    return <Tag color={s.color}>{s.text}</Tag>;
  };

  // Fonction pour obtenir le nombre d'articles V2
  const getItemsCount = (orderId: string) => {
    const jobsCount = getJobsByOrderId(orderId).length;
    return jobsCount > 0 ? jobsCount : 1;
  };

  // Colonnes pour les commandes optiques (version unifiée)
  const opticalColumns = [
    { 
      title: 'N° Commande', 
      dataIndex: 'order_number', 
      key: 'order_number', 
      width: 180, 
      render: (text: string, record: any) => (
        <div>
          <Tag color="purple"><code>{text}</code></Tag>
          {useV2 && <Tag color="blue" style={{ marginLeft: 8 }}>V2</Tag>}
        </div>
      )
    },
    { 
      title: 'Client / Verres', 
      dataIndex: 'customer_name', 
      key: 'customer_name', 
      width: 250,
      render: (text: string, record: any) => {
        if (useV2) {
          const jobs = getJobsByOrderId(record.id);
          return (
            <div>
              <div>{text}</div>
              {jobs.length > 0 && (
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  {jobs.map(job => (
                    <div key={job.id}>👓 {job.job_number.substring(0, 8)}... - {job.status}</div>
                  ))}
                </div>
              )}
            </div>
          );
        }
        return text;
      }
    },
    { 
      title: 'Contenu', 
      key: 'content', 
      width: 150,
      render: (_: any, record: any) => {
        if (useV2) {
          const jobs = getJobsByOrderId(record.id);
          return <Tag color="blue" icon={<ExperimentOutlined />}>Verres ({jobs.length})</Tag>;
        }
        return <Tag color="blue" icon={<ExperimentOutlined />}>Verres + Montures/Accessoires</Tag>;
      }
    },
    { 
      title: 'Articles', 
      key: 'items_count', 
      width: 80, 
      align: 'center' as const,
      render: (_: any, record: any) => {
        if (useV2) {
          return getItemsCount(record.id);
        }
        return record.items_count;
      }
    },
    { 
      title: 'Total TTC', 
      key: 'total_ttc', 
      width: 140,
      render: (_: any, record: any) => {
        let amount = 0;
        if (useV2) {
          amount = record.total_ttc_cents ? record.total_ttc_cents / 100 : 0;
        } else {
          amount = (record.total_ttc_cents || 0) / 100;
        }
        return (
          <Text strong style={{ color: '#1890ff', fontSize: 16 }}>
            {amount.toFixed(2)} DH
          </Text>
        );
      }
    },
    { 
      title: 'Statut', 
      dataIndex: 'status', 
      key: 'status', 
      width: 140, 
      render: getStatusTag 
    },
    { 
      title: 'Paiement', 
      dataIndex: 'payment_status', 
      key: 'payment_status', 
      width: 100, 
      render: getPaymentStatusTag 
    },
    { 
      title: 'Date', 
      dataIndex: 'created_at', 
      key: 'created_at', 
      width: 120, 
      render: (d: string) => new Date(d).toLocaleDateString() 
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_: any, record: SalesOrder) => (
        <Space size="small">
          <Tooltip title="Voir détails">
            <Button icon={<EyeOutlined />} onClick={() => {
              setSelectedOrder(record);
              setDetailModalVisible(true);
            }} />
          </Tooltip>
          
          {record.status === 'draft' && (
            <>
              <Tooltip title="Confirmer la commande">
                <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => {
                  setSelectedOrder(record);
                  setConfirmModalVisible(true);
                }} />
              </Tooltip>
              <Tooltip title="Supprimer">
                <Popconfirm title="Supprimer cette commande ?" onConfirm={() => handleDeleteOrder(record.id)}>
                  <Button danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Tooltip>
            </>
          )}
          
          {record.status === 'ready' && (
            <Tooltip title="Livrer">
              <Button type="primary" icon={<CarOutlined />} onClick={() => {
                setSelectedOrder(record);
                setDeliverModalVisible(true);
              }} />
            </Tooltip>
          )}
          
          {record.status === 'pending' && (
            <Tag icon={<WarningOutlined />} color="orange">Attente fournisseur</Tag>
          )}
        </Space>
      )
    }
  ];

  // Colonnes pour les ventes directes (inchangées)
  const directSalesColumns = [
    { title: 'N° Facture', dataIndex: 'invoice_number', key: 'invoice_number', width: 150, render: (v: string) => <Tag color="purple"><code>{v || '-'}</code></Tag> },
    { 
      title: 'Client', 
      dataIndex: 'customer_name', 
      key: 'customer_name', 
      width: 200, 
      render: (name: string) => <Tag icon={<UserOutlined />}>{name || 'Client comptoir'}</Tag>
    },
    { 
      title: 'Produits', 
      key: 'products', 
      width: 150,
      render: () => <Tag color="blue">🕶️ Monture / Accessoire</Tag>
    },
    { 
      title: 'Total TTC', 
      dataIndex: 'total_cents', 
      key: 'total_cents', 
      width: 140, 
      render: (v: number) => <Text strong style={{ color: '#1890ff', fontSize: 16 }}>{(v / 100).toFixed(2)} DH</Text> 
    },
    { title: 'Paiement', dataIndex: 'payment_method', key: 'payment_method', width: 100 },
    { title: 'Date', dataIndex: 'created_at', key: 'created_at', width: 120, render: (d: string) => d ? new Date(d).toLocaleDateString() : '-' },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      render: (_: any, record: any) => (
        <Tooltip title="Voir détails">
          <Button icon={<EyeOutlined />} onClick={() => {
            setSelectedSale(record);
            setDirectSaleDetailVisible(true);
          }} />
        </Tooltip>
      )
    }
  ];

  // Items des onglets
  const tabItems = [
    {
      key: 'optical',
      label: (
        <Space>
          <ExperimentOutlined />
          Verres personnalisés
          <Badge count={opticalOrders.length} showZero style={{ backgroundColor: '#1890ff' }} />
          {useV2 && <Tag color="blue" icon={<ApiOutlined />}>API V2</Tag>}
        </Space>
      ),
      children: (
        <Table 
          columns={opticalColumns} 
          dataSource={opticalOrders} 
          rowKey="id" 
          loading={loading || v2Loading} 
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: useV2 && v2Error ? `Erreur V2: ${v2Error}` : 'Aucune commande' }}
        />
      )
    },
    {
      key: 'client-direct',
      label: (
        <Space>
          <ShoppingOutlined />
          Ventes avec client
          <Badge count={clientDirectSales.length} showZero style={{ backgroundColor: '#52c41a' }} />
        </Space>
      ),
      children: (
        <Table 
          columns={directSalesColumns} 
          dataSource={clientDirectSales} 
          rowKey="id" 
          loading={loading} 
          pagination={{ pageSize: 10 }}
        />
      )
    },
    {
      key: 'cashier',
      label: (
        <Space>
          <ShoppingCartOutlined />
          Ventes caisse
          <Badge count={cashierSales.length} showZero style={{ backgroundColor: '#faad14' }} />
        </Space>
      ),
      children: (
        <Table 
          columns={directSalesColumns} 
          dataSource={cashierSales} 
          rowKey="id" 
          loading={loading} 
          pagination={{ pageSize: 10 }}
        />
      )
    }
  ];

  // Compteurs pour l'en-tête
  const readyCount = opticalOrders.filter(o => o.status === 'ready').length;
  const pendingCount = opticalOrders.filter(o => o.status === 'pending').length;

  return (
    <div>
      <Card
        title={
          <Space>
            <ShoppingOutlined />
            <span>Gestion des ventes</span>
            <Badge count={readyCount} showZero>
              <Tag color="green">Prêtes: {readyCount}</Tag>
            </Badge>
            <Badge count={pendingCount} showZero>
              <Tag color="orange">En attente: {pendingCount}</Tag>
            </Badge>
          </Space>
        }
        extra={
          <Space>
            <Tooltip title={useV2 ? "Basculer vers l'API legacy" : "Basculer vers l'API V2"}>
              <Button 
                icon={<ApiOutlined />} 
                onClick={() => setUseV2(!useV2)}
                type={useV2 ? 'primary' : 'default'}
              >
                {useV2 ? 'V2 Actif' : 'Legacy'}
              </Button>
            </Tooltip>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
              Nouvelle commande
            </Button>
          </Space>
        }
      >
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab} 
          items={tabItems}
          type="card"
        />
      </Card>

      {/* Modals */}
      <NewOrderModal
        open={modalVisible}
        onClose={() => setModalVisible(false)}
        onSuccess={() => {
          if (useV2) {
            refreshV2();
          } else {
            fetchLegacyData();
          }
        }}
      />

      <ConfirmOrderModal
        open={confirmModalVisible}
        order={selectedOrder}
        onClose={() => {
          setConfirmModalVisible(false);
          setSelectedOrder(null);
        }}
        onSuccess={() => {
          if (useV2) {
            refreshV2();
          } else {
            fetchLegacyData();
          }
        }}
      />

      <DeliverModal
        open={deliverModalVisible}
        order={selectedOrder}
        onClose={() => {
          setDeliverModalVisible(false);
          setSelectedOrder(null);
        }}
        onSuccess={() => {
          if (useV2) {
            refreshV2();
          } else {
            fetchLegacyData();
          }
        }}
      />

      <OrderDetailModal
        open={detailModalVisible}
        order={selectedOrder}
        onClose={() => {
          setDetailModalVisible(false);
          setSelectedOrder(null);
        }}
      />

      <DirectSaleDetailModal
        open={directSaleDetailVisible}
        sale={selectedSale}
        onClose={() => {
          setDirectSaleDetailVisible(false);
          setSelectedSale(null);
        }}
      />
    </div>
  );
};

export default SalesOrders;