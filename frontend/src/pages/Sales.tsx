import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Modal, Tag, Popconfirm, message, Card } from 'antd';
import { EyeOutlined, DollarOutlined } from '@ant-design/icons';
import { saleService } from '../services/api';
import { Sale } from '../types';

const Sales: React.FC = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const response = await saleService.getAll();
      setSales(response.data.data);
    } catch (error) {
      message.error('Erreur lors du chargement des ventes');
    } finally {
      setLoading(false);
    }
  };

  const handlePaySale = async (id: string) => {
    try {
      await saleService.updateStatus(id, 'paid');
      message.success('Vente marquée comme payée');
      fetchSales();
    } catch (error) {
      message.error('Erreur lors du paiement');
    }
  };

  const handleViewSale = async (id: string) => {
    try {
      const response = await saleService.getById(id);
      setSelectedSale(response.data.data);
      setDetailVisible(true);
    } catch (error) {
      message.error('Erreur lors du chargement des détails');
    }
  };

  const columns = [
    { title: 'Facture', dataIndex: 'invoice_number', key: 'invoice_number' },
    { title: 'Client', dataIndex: 'customer_name', key: 'customer_name' },
    { 
      title: 'Total (€)', 
      dataIndex: 'total_cents', 
      key: 'total_cents',
      render: (price: number) => (price / 100).toFixed(2)
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'paid' ? 'green' : 'orange'}>{status === 'paid' ? 'Payée' : 'En attente'}</Tag>
      )
    },
    { title: 'Date', dataIndex: 'created_at', key: 'created_at', render: (date: string) => new Date(date).toLocaleDateString() },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Sale) => (
        <Space>
          <Button icon={<EyeOutlined />} onClick={() => handleViewSale(record.id)} />
          {record.status !== 'paid' && (
            <Popconfirm
              title="Marquer cette vente comme payée ?"
              onConfirm={() => handlePaySale(record.id)}
              okText="Oui"
              cancelText="Non"
            >
              <Button icon={<DollarOutlined />} type="primary" />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card title="Historique des ventes">
        <Table columns={columns} dataSource={sales} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
      </Card>

      <Modal
        title="Détails de la vente"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={600}
      >
        {selectedSale && (
          <div>
            <p><strong>Facture:</strong> {selectedSale.invoice_number}</p>
            <p><strong>Client:</strong> {selectedSale.customer_name}</p>
            <p><strong>Total:</strong> {(selectedSale.total_cents / 100).toFixed(2)} €</p>
            <p><strong>Statut:</strong> {selectedSale.status === 'paid' ? 'Payée' : 'En attente'}</p>
            <p><strong>Paiement:</strong> {selectedSale.payment_method}</p>
            <p><strong>Date:</strong> {new Date(selectedSale.created_at).toLocaleString()}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Sales;