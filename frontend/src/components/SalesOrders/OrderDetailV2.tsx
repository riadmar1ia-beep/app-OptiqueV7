import React from 'react';
import { useParams } from 'react-router-dom';
import { Card, Descriptions, Spin, Alert, Tag, Table } from 'antd';
import { useSalesOrdersV2, useOpticalJobsV2 } from '../../hooks/useSalesOrdersV2';

export const OrderDetailV2: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { orders, loading: ordersLoading } = useSalesOrdersV2();
    const { jobs, loading: jobsLoading, getJobsByOrderId } = useOpticalJobsV2();
    
    const order = orders.find(o => o.id === id);
    const orderJobs = getJobsByOrderId(id || '');
    
    if (ordersLoading || jobsLoading) {
        return <Spin size="large" style={{ display: 'block', margin: '50px auto' }} />;
    }
    
    if (!order) {
        return <Alert type="error" message="Commande non trouvée" />;
    }
    
    const columns = [
        { title: 'Job #', dataIndex: 'job_number', key: 'job_number' },
        { title: 'Statut', dataIndex: 'status', key: 'status', render: (s: string) => <Tag>{s}</Tag> },
        { title: 'Prix HT', dataIndex: 'selling_price', key: 'selling_price', render: (v: number) => `${v.toFixed(2)} DH` },
        { title: 'Coût', dataIndex: 'cost_price', key: 'cost_price', render: (v: number) => `${v.toFixed(2)} DH` },
    ];
    
    return (
        <div style={{ padding: 24 }}>
            <Card title={`Commande ${order.order_number}`}>
                <Descriptions bordered column={2}>
                    <Descriptions.Item label="Client">{order.client_id}</Descriptions.Item>
                    <Descriptions.Item label="Statut">{order.status}</Descriptions.Item>
                    <Descriptions.Item label="Date">{new Date(order.order_date).toLocaleDateString('fr-FR')}</Descriptions.Item>
                    <Descriptions.Item label="Paiement">{order.payment_status}</Descriptions.Item>
                    <Descriptions.Item label="Total HT">{order.total_ht.toFixed(2)} DH</Descriptions.Item>
                    <Descriptions.Item label="TVA">{order.total_tva.toFixed(2)} DH</Descriptions.Item>
                    <Descriptions.Item label="Total TTC" span={2}>
                        <strong style={{ color: '#52c41a', fontSize: 18 }}>{order.total_ttc.toFixed(2)} DH</strong>
                    </Descriptions.Item>
                </Descriptions>
                
                {orderJobs.length > 0 && (
                    <>
                        <h3 style={{ marginTop: 24, marginBottom: 16 }}>👓 Verres commandés</h3>
                        <Table columns={columns} dataSource={orderJobs} rowKey="id" pagination={false} />
                    </>
                )}
            </Card>
        </div>
    );
};