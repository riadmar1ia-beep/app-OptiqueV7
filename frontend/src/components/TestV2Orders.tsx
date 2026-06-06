import React, { useState, useEffect } from 'react';
import { Button, Space, Tag, Card, message, Switch } from 'antd';
import { ApiOutlined, ReloadOutlined } from '@ant-design/icons';
import { useSalesOrdersV2, useOpticalJobsV2 } from '../hooks/useSalesOrdersV2';
import { globalOrderService } from '../services/api';

export const TestV2Orders: React.FC = () => {
    const [useV2, setUseV2] = useState(true);
    const [legacyOrders, setLegacyOrders] = useState<any[]>([]);
    const [legacyLoading, setLegacyLoading] = useState(false);
    
    const { orders: v2Orders, loading: v2Loading, error: v2Error, refresh: refreshV2 } = useSalesOrdersV2();
    const { jobs: v2Jobs, getJobsByOrderId } = useOpticalJobsV2();

    // Chargement des données legacy
    const fetchLegacyOrders = async () => {
        setLegacyLoading(true);
        try {
            const response = await globalOrderService.getAll();
            const orders = response.data.data?.optical_orders || [];
            setLegacyOrders(orders);
        } catch (error) {
            console.error('Erreur legacy:', error);
            message.error('Erreur chargement données legacy');
        } finally {
            setLegacyLoading(false);
        }
    };

    useEffect(() => {
        if (!useV2) {
            fetchLegacyOrders();
        }
    }, [useV2]);

    const formatAmount = (value: number | string | undefined): string => {
        if (value === undefined || value === null) return '0,00';
        const num = typeof value === 'string' ? parseFloat(value) : value;
        const amount = num > 1000 ? num / 100 : num;
        return amount.toFixed(2);
    };

    // Affichage des données V2
    const renderV2Content = () => {
        if (v2Loading) {
            return <div style={{ textAlign: 'center', padding: '32px' }}>Chargement des données V2...</div>;
        }
        if (v2Error) {
            return <div style={{ color: 'red', textAlign: 'center', padding: '32px' }}>Erreur: {v2Error}</div>;
        }
        if (v2Orders.length === 0) {
            return <div style={{ color: '#666', textAlign: 'center', padding: '32px' }}>Aucune commande trouvée</div>;
        }
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {v2Orders.map((order: any) => (
                    <div key={order.id} style={{ border: '1px solid #e8e8e8', borderRadius: '8px', padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h3 style={{ fontWeight: '600', fontSize: '18px' }}>
                                    {order.order_number}
                                    <Tag color="blue" style={{ marginLeft: 8 }}>V2</Tag>
                                </h3>
                                <p style={{ fontSize: '14px', color: '#666' }}>
                                    Client: {order.client_id} | Statut: {order.status}
                                </p>
                                <p style={{ fontSize: '14px', color: '#666' }}>
                                    Date: {new Date(order.order_date).toLocaleDateString('fr-FR')}
                                </p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#52c41a' }}>
                                    {formatAmount(order.total_ttc)} DH
                                </p>
                                <p style={{ fontSize: '12px', color: '#666' }}>
                                    HT: {formatAmount(order.total_ht)} DH | TVA: {formatAmount(order.total_tva)} DH
                                </p>
                            </div>
                        </div>
                        
                        {getJobsByOrderId(order.id).length > 0 && (
                            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e8e8e8' }}>
                                <p style={{ fontSize: '14px', fontWeight: '500', color: '#333' }}>👓 Verres commandés:</p>
                                {getJobsByOrderId(order.id).map((job: any) => (
                                    <div key={job.id} style={{ fontSize: '13px', color: '#666', marginLeft: '16px' }}>
                                        Job #{job.job_number.substring(0, 8)}... - Statut: {job.status} - Prix: {formatAmount(job.selling_price)} DH
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };

    // Affichage des données Legacy
    const renderLegacyContent = () => {
        if (legacyLoading) {
            return <div style={{ textAlign: 'center', padding: '32px' }}>Chargement des données Legacy...</div>;
        }
        if (legacyOrders.length === 0) {
            return <div style={{ color: '#666', textAlign: 'center', padding: '32px' }}>Aucune commande trouvée</div>;
        }
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {legacyOrders.map((order: any) => (
                    <div key={order.id} style={{ border: '1px solid #e8e8e8', borderRadius: '8px', padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h3 style={{ fontWeight: '600', fontSize: '18px' }}>
                                    {order.order_number}
                                    <Tag color="orange" style={{ marginLeft: 8 }}>Legacy</Tag>
                                </h3>
                                <p style={{ fontSize: '14px', color: '#666' }}>
                                    Client: {order.customer_name} | Statut: {order.status}
                                </p>
                                <p style={{ fontSize: '14px', color: '#666' }}>
                                    Date: {new Date(order.created_at).toLocaleDateString('fr-FR')}
                                </p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#52c41a' }}>
                                    {((order.total_ttc_cents || 0) / 100).toFixed(2)} DH
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div style={{ padding: '24px' }}>
            <Card
                title={
                    <Space>
                        <ApiOutlined />
                        <span>Test API V2 vs Legacy</span>
                    </Space>
                }
                extra={
                    <Space>
                        <span style={{ fontSize: 14 }}>API V2</span>
                        <Switch
                            checked={useV2}
                            onChange={setUseV2}
                            checkedChildren="V2"
                            unCheckedChildren="Legacy"
                        />
                        <span style={{ fontSize: 14 }}>Legacy</span>
                        <Button 
                            icon={<ReloadOutlined />} 
                            onClick={() => useV2 ? refreshV2() : fetchLegacyOrders()}
                        >
                            Rafraîchir
                        </Button>
                    </Space>
                }
            >
                {useV2 ? renderV2Content() : renderLegacyContent()}
            </Card>
        </div>
    );
};