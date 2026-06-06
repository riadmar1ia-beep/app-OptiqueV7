import React from 'react';
import { Card, Row, Col, Statistic, Spin } from 'antd';
import { ShoppingOutlined, DollarOutlined, RiseOutlined, StockOutlined } from '@ant-design/icons';
import { Stats } from '../types';

interface DashboardProps {
  stats: Stats | null;
}

const Dashboard: React.FC<DashboardProps> = ({ stats }) => {
  if (!stats) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Tableau de bord</h1>
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Chiffre d'affaires"
              value={stats.revenue_euros}
              prefix={<DollarOutlined />}
              styles={{ content: { color: '#3f8600' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total produits"
              value={stats.products}
              prefix={<ShoppingOutlined />}
              styles={{ content: { color: '#1890ff' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Ventes réalisées"
              value={stats.sales}
              prefix={<RiseOutlined />}
              styles={{ content: { color: '#722ed1' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="En attente"
              value={stats.pending_sales || 0}
              prefix={<StockOutlined />}
              styles={{ content: { color: '#faad14' } }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;