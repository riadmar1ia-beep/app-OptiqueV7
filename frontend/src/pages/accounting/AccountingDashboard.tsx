import React, { useState, useEffect } from 'react';
import {
  Card, Row, Col, Statistic, Table, Tag, Spin, Button, Space,
  DatePicker, Typography, Progress, Alert, Divider, message
} from 'antd';
import {
  DollarOutlined, ShoppingOutlined, WalletOutlined,
  RiseOutlined, FallOutlined, ReloadOutlined, FileTextOutlined,
  WarningOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import { accountingService } from '../../services/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface DashboardData {
  monthly: {
    total_ttc_dh: number;
    total_ht_dh: number;
    total_tva_dh: number;
    invoice_count: number;
  };
  yearly: {
    total_ttc_dh: number;
    total_ht_dh: number;
    total_tva_dh: number;
    invoice_count: number;
  };
  outstanding: {
    total_dh: number;
    count: number;
    invoices: any[];
  };
  recent_invoices: any[];
}

const AccountingDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const response = await accountingService.getDashboard();
      setDashboard(response.data.data);
    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
      message.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'N° Facture',
      dataIndex: 'invoice_number',
      key: 'invoice_number',
      render: (text: string) => <Tag color="blue">{text}</Tag>
    },
    {
      title: 'Client',
      dataIndex: 'customer_name',
      key: 'customer_name',
      render: (text: string) => text || '-'
    },
    {
      title: 'Date',
      dataIndex: 'invoice_date',
      key: 'invoice_date',
      render: (date: string) => new Date(date).toLocaleDateString('fr-FR')
    },
    {
      title: 'Montant TTC',
      dataIndex: 'amount_ttc_dh',
      key: 'amount_ttc_dh',
      align: 'right' as const,
      render: (value: number) => (
        <Text strong style={{ color: '#1890ff' }}>
          {value.toFixed(2)} DH
        </Text>
      )
    },
    {
      title: 'Statut',
      dataIndex: 'payment_status',
      key: 'payment_status',
      render: (status: string) => (
        <Tag color={status === 'paid' ? 'green' : status === 'partial' ? 'orange' : 'red'}>
          {status === 'paid' ? 'Payée' : status === 'partial' ? 'Partiel' : 'Impayée'}
        </Tag>
      )
    }
  ];

  const outstandingColumns = [
    {
      title: 'N° Facture',
      dataIndex: 'invoice_number',
      key: 'invoice_number',
      render: (text: string) => <Tag color="red">{text}</Tag>
    },
    {
      title: 'Client',
      dataIndex: 'customer_name',
      key: 'customer_name',
      render: (text: string, record: any) => (
        <span>{record.first_name} {record.last_name}</span>
      )
    },
    {
      title: 'Date',
      dataIndex: 'invoice_date',
      key: 'invoice_date',
      render: (date: string) => new Date(date).toLocaleDateString('fr-FR')
    },
    {
      title: 'Montant dû',
      dataIndex: 'remaining_dh',
      key: 'remaining_dh',
      align: 'right' as const,
      render: (value: number) => (
        <Text strong style={{ color: '#ff4d4f' }}>
          {value.toFixed(2)} DH
        </Text>
      )
    }
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!dashboard) {
    return <Alert type="error" title="Impossible de charger les données" />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={2}>📊 Tableau de bord comptable</Title>
        <Button icon={<ReloadOutlined />} onClick={fetchDashboard}>
          Actualiser
        </Button>
      </div>

      {/* KPIs - Mois */}
      <Card size="small" style={{ marginBottom: 16, background: '#f0f5ff' }}>
        <div style={{ marginBottom: 8 }}>
          <Text strong>📅 Ce mois-ci</Text>
        </div>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="Chiffre d'affaires"
              value={dashboard.monthly.total_ttc_dh}
              precision={2}
              prefix={<DollarOutlined />}
              suffix="DH"
              //valueStyle={{ color: '#1890ff' }}
styles={{
    content: {
      color: '#1890ff',
    },
  }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Total HT"
              value={dashboard.monthly.total_ht_dh}
              precision={2}
              prefix={<ShoppingOutlined />}
              suffix="DH"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="TVA collectée"
              value={dashboard.monthly.total_tva_dh}
              precision={2}
              prefix={<RiseOutlined />}
              suffix="DH"
             // valueStyle={{ color: '#52c41a' }}
  styles={{
    content: {
      color: '#52c41a',
    },
  }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Factures"
              value={dashboard.monthly.invoice_count}
              prefix={<FileTextOutlined />}
            />
          </Col>
        </Row>
      </Card>

      {/* KPIs - Année */}
      <Card size="small" style={{ marginBottom: 16, background: '#f6ffed' }}>
        <div style={{ marginBottom: 8 }}>
          <Text strong>📅 Cette année</Text>
        </div>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="Chiffre d'affaires"
              value={dashboard.yearly.total_ttc_dh}
              precision={2}
              prefix={<DollarOutlined />}
              suffix="DH"
              //valueStyle={{ color: '#1890ff' }}
 styles={{
    content: {
      color: '#1890ff',
    },
  }}

            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Total HT"
              value={dashboard.yearly.total_ht_dh}
              precision={2}
              prefix={<ShoppingOutlined />}
              suffix="DH"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="TVA collectée"
              value={dashboard.yearly.total_tva_dh}
              precision={2}
              prefix={<RiseOutlined />}
              suffix="DH"
              //valueStyle={{ color: '#52c41a' }}
 styles={{
    content: {
      color: '#52c41a',
    },
  }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Factures"
              value={dashboard.yearly.invoice_count}
              prefix={<FileTextOutlined />}
            />
          </Col>
        </Row>
      </Card>

      {/* Créances */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card
            title={
              <Space>
                <WalletOutlined />
                <span>Créances clients</span>
                {dashboard.outstanding.count > 0 && (
                  <Tag color="red" icon={<WarningOutlined />}>
                    {dashboard.outstanding.count} impayée(s)
                  </Tag>
                )}
              </Space>
            }
            extra={
              <Text strong style={{ color: dashboard.outstanding.total_dh > 0 ? '#ff4d4f' : '#52c41a' }}>
                Total dû: {dashboard.outstanding.total_dh.toFixed(2)} DH
              </Text>
            }
          >
            {dashboard.outstanding.count === 0 ? (
              <Alert
                type="success"
                icon={<CheckCircleOutlined />}
                title="Aucune créance impayée"
                description="Toutes les factures sont réglées."
              />
            ) : (
              <Table
                columns={outstandingColumns}
                dataSource={dashboard.outstanding.invoices}
                rowKey="id"
                pagination={false}
                size="small"
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Dernières factures */}
      <Card title="📄 Dernières factures">
        <Table
          columns={columns}
          dataSource={dashboard.recent_invoices}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          size="small"
        />
      </Card>
    </div>
  );
};

export default AccountingDashboard;