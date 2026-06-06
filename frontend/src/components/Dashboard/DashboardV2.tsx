import React, { useState, useEffect } from 'react';
import { 
  Card, Row, Col, Statistic, Table, Tag, Button, Space, Modal, Select, 
  message, Tabs, Tooltip 
} from 'antd';
import { 
  DollarOutlined, ShoppingOutlined, RiseOutlined, WalletOutlined, 
  FilePdfOutlined, ReloadOutlined, DownloadOutlined,
  ExperimentOutlined, ApiOutlined, FileTextOutlined, UserOutlined,
  TruckOutlined, CheckCircleOutlined, ClockCircleOutlined
} from '@ant-design/icons';
import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer';
import { useSalesOrdersV2, useOpticalJobsV2 } from '../../hooks/useSalesOrdersV2';
import { TVADeclarationPDF } from '../accounting/TVADeclarationPDF';
import api from '../../services/api';

const { Option } = Select;

// ─────────────────────────────────────────────────────────────────
// FORMATAGE DES MONTANTS
// /v2/orders et /v2/optical/jobs → vue SQL divise déjà par 100 → valeurs en DH
// /sales-invoices                → colonnes *_cents → valeurs en centimes
// ─────────────────────────────────────────────────────────────────

/** Pour les champs de /v2/orders et /v2/optical/jobs (déjà en DH) */
const formatAmount = (value: any): number => {
  if (value === undefined || value === null) return 0;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return isNaN(num) ? 0 : num;
};

// Helper to format amounts in DH with French locale (returns only the number string)
const formatCurrencyDH = (amount: number, inCents: boolean = false): string => {
  const value = inCents ? amount / 100 : amount;
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
};

// French currency formatter (DH)
const formatCurrency = (cents: number | undefined): string => {
  const amount = (cents ?? 0) / 100;
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} DH`;
};

/** Pour les colonnes *_cents de /sales-invoices (en centimes) */
const fromCents = (value: any): number => {
  if (value === undefined || value === null) return 0;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return isNaN(num) ? 0 : num / 100;
};

const formatAmountDisplay = (value: any): string => {
  // Returns formatted number without DH suffix (suffix added via Statistic component)
  return formatCurrencyDH(value);
};

export const DashboardV2: React.FC = () => {
    const { orders, loading: ordersLoading, refresh: refreshOrders } = useSalesOrdersV2();
    const { jobs, loading: jobsLoading, refresh: refreshJobs } = useOpticalJobsV2();
    
    // States pour les factures
    const [invoices, setInvoices] = useState<any[]>([]);
    const [invoicesLoading, setInvoicesLoading] = useState(false);
    
    // State pour les jobs groupés par commande
    const [groupedJobs, setGroupedJobs] = useState<any[]>([]);
  // Map sales_order_id => array of supplier orders (for displaying supplier order numbers)
  const [supplierOrdersMap, setSupplierOrdersMap] = useState<Record<string, any[]>>({});
    
    const [exportModalVisible, setExportModalVisible] = useState(false);
    const [previewModalVisible, setPreviewModalVisible] = useState(false);
    const [exportParams, setExportParams] = useState<{ year: number; quarter: number } | null>(null);
    const [exportData, setExportData] = useState<any>(null);
    const [loadingExport, setLoadingExport] = useState(false);
    const [activeTab, setActiveTab] = useState('orders');
    const [suppliers, setSuppliers] = useState<Record<string, string>>({});
    
    // Clients map pour récupérer les noms
    const [clientsMap, setClientsMap] = useState<Record<string, { first_name: string; last_name: string }>>({});
    
    // Grouper les jobs par sales_order_id
    useEffect(() => {
        if (jobs.length === 0) {
            setGroupedJobs([]);
            return;
        }
        
        // Grouper les jobs par sales_order_id
        const groupedMap = new Map();
        
        jobs.forEach((job) => {
            const orderId = job.sales_order_id;
            if (!groupedMap.has(orderId)) {
                groupedMap.set(orderId, {
                    id: orderId,
                    sales_order_id: orderId,
                    job_count: 0,
                    total_selling_price: 0,
                    total_cost_price: 0,
                    supplier_id: job.supplier_id,
                    status: job.status,
                    created_at: job.created_at,
                    job_number: job.job_number,
                    jobs: []
                });
            }
            
            const group = groupedMap.get(orderId);
            group.job_count++;
            group.total_selling_price += (job.selling_price || 0);
            group.total_cost_price += (job.cost_price || 0);
            group.jobs.push(job);
        });
        
        setGroupedJobs(Array.from(groupedMap.values()));
    }, [jobs]);
    
    // Charger les clients pour récupérer les noms
    const fetchClients = async () => {
        try {
            const response = await api.get('/clients');
            const clients: any[] = response.data.data || [];
            const map: Record<string, { first_name: string; last_name: string }> = {};
            clients.forEach(client => {
                map[client.id] = {
                    first_name: client.first_name || '',
                    last_name: client.last_name || ''
                };
            });
            setClientsMap(map);
        } catch (error) {
            console.error('Erreur chargement clients:', error);
        }
    };
    
    // Charger les factures
    const fetchInvoices = async () => {
        setInvoicesLoading(true);
        try {
            const response = await api.get('/sales-invoices');
            setInvoices(response.data.data || []);
        } catch (error) {
            console.error('Erreur chargement factures:', error);
            message.error('Erreur lors du chargement des factures');
        } finally {
            setInvoicesLoading(false);
        }
    };
    
    // Calculer les totaux (raw numbers - ensure numeric conversion)
    const totalHT = orders.reduce((sum, o) => sum + (Number(o.total_ht) || 0), 0);
    const totalTVA = orders.reduce((sum, o) => sum + (Number(o.total_tva) || 0), 0);
    const totalTTC = orders.reduce((sum, o) => sum + (Number(o.total_ttc) || 0), 0);
    // Formatted strings for display (values already include DH)
    const totalHTDisplay = formatAmountDisplay(totalHT);
    const totalTVADisplay = formatAmountDisplay(totalTVA);
    const totalTTCDisplay = formatAmountDisplay(totalTTC);

    
    // Stats jobs optiques groupés
    const totalJobs = groupedJobs.length;
    const totalJobsValue = groupedJobs.reduce((sum, j) => sum + j.total_selling_price, 0);
    const avgJobValue = totalJobs > 0 ? totalJobsValue / totalJobs : 0;
    
    // Stats factures
    const totalInvoicesDH = invoices.reduce((sum, inv) => sum + ((Number(inv.amount_ttc_cents) || 0) / 100), 0);
    const totalInvoicesDisplay = formatCurrencyDH(totalInvoicesDH);
    const paidInvoices = invoices.filter(inv => inv.payment_status === 'paid').length;
    const unpaidInvoices = invoices.filter(inv => inv.payment_status !== 'paid').length;
    
    // Rafraîchir toutes les données
    const refreshAll = () => {
        refreshOrders();
        refreshJobs();
        fetchInvoices();
        fetchClients();
        // Also refresh supplier orders mapping
        fetchSupplierOrders();
        message.success('Données actualisées');
      };
    
    const fetchSuppliers = async () => {
        try {
            const response = await api.get('/suppliers');
            const supplierMap: Record<string, string> = {};
            response.data.data.forEach((s: any) => {
                supplierMap[s.id] = s.name;
            });
            setSuppliers(supplierMap);
        } catch (error) {
            console.error('Erreur chargement fournisseurs:', error);
        }
    };

    // ---------------------------------------------------
    // Fetch supplier orders for each sales order (used in Jobs table)
    const fetchSupplierOrders = async () => {
        const map: Record<string, any[]> = {};
        // groupedJobs may be empty initially; guard against that
        const groups = groupedJobs.length ? groupedJobs : [];
        await Promise.all(groups.map(async (group) => {
            try {
                const res = await api.get(`/supplier-orders/sales-order/${group.sales_order_id}`);
                map[group.sales_order_id] = res.data.data || [];
            } catch (e) {
                console.error('Erreur récupération fournisseurs pour sales order', group.sales_order_id, e);
                map[group.sales_order_id] = [];
            }
        }));
        setSupplierOrdersMap(map);
    };

    // Refresh supplier orders whenever groupedJobs changes
    useEffect(() => {
        fetchSupplierOrders();
    }, [groupedJobs]);
    
    // Charger les données pour l'export TVA
    const loadExportData = async (year: number, quarter: number) => {
        setLoadingExport(true);
        try {
            const response = await api.get(`/accounting/v2/tva/export?year=${year}&quarter=${quarter}`);
            setExportData(response.data);
            setExportParams({ year, quarter });
            setPreviewModalVisible(true);
        } catch (error) {
            console.error('Erreur chargement export:', error);
            message.error('Erreur lors du chargement des données TVA');
        } finally {
            setLoadingExport(false);
        }
    };
    
    useEffect(() => {
        fetchInvoices();
        fetchSuppliers();
        fetchClients();
    }, []);
    
    // Fonction pour obtenir le nom du client depuis son ID
    const getClientName = (clientId: string) => {
        if (!clientId) return '-';
        const client = clientsMap[clientId];
        if (client) {
            return `${client.first_name} ${client.last_name}`.trim() || '-';
        }
        return '-';
    };
    
    // Colonnes pour les commandes
    const orderColumns = [
        { 
            title: 'Commande', 
            dataIndex: 'order_number', 
            key: 'order_number',
            width: 180,
            render: (text: string) => <Tag color="purple">{text}</Tag>
        },
        { 
            title: 'Client', 
            key: 'client_name',
            width: 200,
            render: (_: any, record: any) => {
                const clientName = getClientName(record.client_id);
                return <span>{clientName}</span>;
            }
        },
        { 
            title: 'Statut', 
            dataIndex: 'status', 
            key: 'status', 
            width: 120,
            render: (s: string) => {
                const colors: Record<string, string> = {
                    draft: 'default',
                    pending: 'blue',
                    confirmed: 'orange',
                    delivered: 'green',
                    cancelled: 'red'
                };
                const labels: Record<string, string> = {
                    draft: '📝 Brouillon',
                    pending: '⏳ En attente',
                    confirmed: '✅ Confirmée',
                    delivered: '📦 Livrée',
                    cancelled: '❌ Annulée'
                };
                return <Tag color={colors[s] || 'default'}>{labels[s] || s}</Tag>;
            }
        },
        { 
            title: 'Total HT',
            dataIndex: 'total_ht',
            key: 'total_ht',
            width: 120,
            align: 'right' as const,
            render: (v: any) => `${formatCurrencyDH(v)} DH`
        },
        { 
            title: 'TVA', 
            dataIndex: 'total_tva', 
            key: 'total_tva', 
            width: 100,
            align: 'right' as const,
            render: (v: any) => `${formatCurrencyDH(v)} DH`
        },
        { 
            title: 'Total TTC', 
            dataIndex: 'total_ttc', 
            key: 'total_ttc', 
            width: 120,
            align: 'right' as const,
            render: (v: any) => <strong style={{ color: '#52c41a' }}>{formatCurrencyDH(v)} DH</strong>
        },
        { 
            title: 'Date', 
            dataIndex: 'order_date', 
            key: 'order_date', 
            width: 120,
            render: (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '-'
        },
    ];
    
    // Colonnes pour les jobs optiques GROUPÉS par commande
    const jobColumns = [
        {
            title: 'Commande client',
            key: 'order_number',
            width: 200,
            render: (_: any, record: any) => {
                const order = orders.find(o => o.id === record.sales_order_id);
                if (order) {
                    return (
                        <Tooltip title={`${order.order_number} - ${record.job_count} verre(s)`}>
                            <Tag color="purple" style={{ fontSize: 13 }}>
                                📦 {order.order_number}
                            </Tag>
                        </Tooltip>
                    );
                }
                const shortId = record.sales_order_id?.substring(0, 8) || 'N/A';
                return <Tag color="blue">CMD-{shortId}</Tag>;
            }
        },
        {
            title: 'Commande fournisseur',
            key: 'supplier_order_number',
            width: 200,
            render: (_: any, record: any) => {
                const supplierOrders = supplierOrdersMap[record.sales_order_id] || [];
                if (supplierOrders.length === 0) return '-';
                // Affiche le premier numéro de commande fournisseur (BCF‑…) s'il existe
                const first = supplierOrders[0];
                const number = first.order_id || first.order_number || first.id || '-';
                return <Tag color="orange">{number}</Tag>;
            }
        },
        {
            title: 'Client',
            key: 'client_name',
            width: 200,
            render: (_: any, record: any) => {
                const order = orders.find(o => o.id === record.sales_order_id);
                if (order && order.client_id) {
                    const clientName = getClientName(order.client_id);
                    return <span>{clientName}</span>;
                }
                return <span style={{ color: '#999' }}>-</span>;
            }
        },
        {
            title: 'Verres',
            key: 'job_count',
            width: 80,
            align: 'center' as const,
            render: (_: any, record: any) => {
                return (
                    <Tag color="blue" style={{ fontSize: 12 }}>
                        👓 {record.job_count} verre(s)
                    </Tag>
                );
            }
        },
        {
            title: 'Prix Vente HT (Total)',
            key: 'selling_price',
            width: 180,
            align: 'right' as const,
            render: (_: any, record: any) => {
                return (
                    <strong style={{ color: '#1890ff', fontSize: 14 }}>
                        {formatCurrencyDH(record.total_selling_price)} DH
                    </strong>
                );
            }
        },
        {
            title: "Prix d'Achat HT (Total)",
            key: 'cost_price',
            width: 180,
            align: 'right' as const,
            render: (_: any, record: any) => {
                if (record.total_cost_price === 0) {
                    return <span style={{ color: '#bbb' }}>N/A</span>;
                }
                return <span>{formatCurrencyDH(record.total_cost_price)}</span>;
            }
        },
        {
            title: 'Marge (Total)',
            key: 'margin',
            width: 180,
            align: 'right' as const,
            render: (_: any, record: any) => {
                const totalSelling = record.total_selling_price;
                const totalCost = record.total_cost_price;
                
                if (totalCost === 0) {
                    return <Tag color="default">Prix achat manquant</Tag>;
                }
                const margin = totalSelling - totalCost;
                const marginPercent = (margin / totalCost) * 100;
                return (
                    <Tag color={margin > 0 ? 'green' : 'red'} style={{ fontSize: 13 }}>
                        {margin.toFixed(2)} DH ({marginPercent.toFixed(0)}%)
                    </Tag>
                );
            }
        },
        {
            title: 'Fournisseur',
            key: 'supplier',
            width: 150,
            render: (_: any, record: any) => {
                // Prendre le premier fournisseur trouvé
                const firstJob = record.jobs?.[0];
                const supplierId = firstJob?.supplier_id;
                if (!supplierId) return '-';
                const supplierName = suppliers[supplierId] || supplierId.substring(0, 8) + '...';
                return <Tag color="orange">{supplierName}</Tag>;
            }
        },
        {
            title: 'Statut Commande',
            key: 'order_status',
            width: 140,
            render: (_: any, record: any) => {
                const order = orders.find(o => o.id === record.sales_order_id);
                const status = order?.status || record.status;
                const statusMap: Record<string, { color: string; label: string }> = {
                    draft: { color: 'default', label: '📝 Brouillon' },
                    pending: { color: 'blue', label: '⏳ En attente' },
                    confirmed: { color: 'orange', label: '✅ Confirmée' },
                    delivered: { color: 'green', label: '📦 Livrée' },
                    cancelled: { color: 'red', label: '❌ Annulée' }
                };
                const config = statusMap[status] || { color: 'default', label: status };
                return <Tag color={config.color}>{config.label}</Tag>;
            }
        },
        {
            title: 'Date',
            key: 'created_at',
            width: 120,
            render: (_: any, record: any) => {
                const order = orders.find(o => o.id === record.sales_order_id);
                const date = order?.created_at || record.created_at;
                return date ? new Date(date).toLocaleDateString('fr-FR') : '-';
            }
        }
    ];
    
    // Colonnes pour les factures
    const invoiceColumns = [
        { 
            title: 'N° Facture', 
            dataIndex: 'invoice_number', 
            key: 'invoice_number',
            width: 150,
            render: (text: string) => <Tag color="blue">{text}</Tag>
        },
        { 
            title: 'Client', 
            dataIndex: 'customer_name', 
            key: 'customer_name',
            width: 200 
        },
        { 
            title: 'Date', 
            dataIndex: 'invoice_date', 
            key: 'invoice_date',
            width: 120,
            render: (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '-'
        },
        {
            title: 'Montant HT',
            dataIndex: 'amount_ht_cents',
            key: 'amount_ht_cents',
            width: 120,
            align: 'right' as const,
            render: (v: number) => formatCurrencyDH(v, true)
        },
        { 
            title: 'TVA', 
            key: 'tva',
            width: 100,
            align: 'right' as const,
            render: (_: any, record: any) => {
                const tva = (record.amount_ttc_cents || 0) - (record.amount_ht_cents || 0);
                return formatCurrency(tva);
            }
        },
        { 
            title: 'Total TTC', 
            dataIndex: 'amount_ttc_cents', 
            key: 'amount_ttc_cents',
            width: 120,
            align: 'right' as const,
            render: (v: number) => <strong style={{ color: '#52c41a' }}>{formatCurrency(v)}</strong>
        },
        { 
            title: 'Statut', 
            dataIndex: 'payment_status', 
            key: 'payment_status',
            width: 100,
            render: (s: string) => (
                <Tag color={s === 'paid' ? 'green' : 'red'}>
                    {s === 'paid' ? '✅ Payée' : '⏳ Impayée'}
                </Tag>
            )
        },
    ];
    
    // Items des onglets
    const tabItems = [
        {
            key: 'orders',
            label: <Space><ShoppingOutlined />Commandes ({orders.length})</Space>,
            children: (
                <Table 
                    columns={orderColumns} 
                    dataSource={orders} 
                    rowKey="id" 
                    loading={ordersLoading}
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: 1000 }}
                />
            )
        },
        {
            key: 'optical',
            label: <Space><ExperimentOutlined />Jobs Optiques ({groupedJobs.length})</Space>,
            children: (
                <Table 
                    columns={jobColumns} 
                    dataSource={groupedJobs} 
                    rowKey="sales_order_id" 
                    loading={jobsLoading}
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: 1300 }}
                />
            )
        },
        {
            key: 'invoices',
            label: <Space><FileTextOutlined />Factures ({invoices.length})</Space>,
            children: (
                <Table 
                    columns={invoiceColumns} 
                    dataSource={invoices} 
                    rowKey="id" 
                    loading={invoicesLoading}
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: 1000 }}
                />
            )
        }
    ];
    
    return (
        <div style={{ padding: 24 }}>
            {/* En-tête */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>
                        📊 Dashboard V2 - Nouveau Core
                    </h1>
                    <Space style={{ marginTop: 8 }}>
                        <Tag color="blue" icon={<ApiOutlined />}>API V2 Active</Tag>
                        <Tag color="green">Double écriture active</Tag>
                        <Tag color="purple">Synchronisation temps réel</Tag>
                    </Space>
                </div>
                <Space>
                    <Tooltip title="Exporter la déclaration TVA">
                        <Button 
                            icon={<FilePdfOutlined />} 
                            onClick={() => setExportModalVisible(true)}
                            style={{ backgroundColor: '#ff4d4f', color: 'white', borderColor: '#ff4d4f' }}
                        >
                            Export TVA
                        </Button>
                    </Tooltip>
                    <Tooltip title="Actualiser toutes les données">
                        <Button icon={<ReloadOutlined />} onClick={refreshAll}>
                            Rafraîchir
                        </Button>
                    </Tooltip>
                </Space>
            </div>
            
            {/* KPIs - Première ligne */}
            <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic 
                            title="CA HT (Commandes)" 
                            value={totalHTDisplay}
                              suffix="DH"
                              prefix={<DollarOutlined />}
                              styles={{ content: { color: '#1890ff' } }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic 
                            title="TVA Collectée" 
                            value={totalTVADisplay}
                              suffix="DH"
                              prefix={<RiseOutlined />}
                              styles={{ content: { color: '#52c41a' } }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic 
                            title="CA TTC (Commandes)" 
                            value={totalTTCDisplay}
                              suffix="DH"
                              prefix={<ShoppingOutlined />}
                              styles={{ content: { color: '#722ed1' } }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic 
                            title="Valeur Jobs Optiques" 
                            value={formatCurrencyDH(totalJobsValue)} 
                            prefix={<ExperimentOutlined />} 
                            suffix="DH"
                            styles={{ content: { color: '#fa8c16' } }}
                        />
                        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                            {totalJobs} commande(s) - Moyenne: {avgJobValue.toFixed(2)} DH
                        </div>
                    </Card>
                </Col>
            </Row>
            
            {/* KPIs - Deuxième ligne (Factures) */}
            <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={8}>
                    <Card>
                        <Statistic 
                            title="Total Factures" 
                            value={invoices.length} 
                            prefix={<FileTextOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={8}>
                    <Card>
                        <Statistic 
                            title="Montant Total Facturé"
                            value={totalInvoicesDisplay}
                            prefix={<DollarOutlined />}
                            suffix="DH"
                            styles={{ content: { color: '#1890ff' } }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={8}>
                    <Card>
                        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                            <div>
                                <Statistic 
                                    title="Payées" 
                                    value={paidInvoices} 
                                    styles={{ content: { color: '#52c41a' } }}
                                />
                            </div>
                            <div>
                                <Statistic 
                                    title="Impayées" 
                                    value={unpaidInvoices} 
                                    styles={{ content: { color: '#ff4d4f' } }}
                                />
                            </div>
                        </div>
                    </Card>
                </Col>
            </Row>
            
            {/* Tableaux avec onglets */}
            <Card>
                <Tabs 
                    activeKey={activeTab} 
                    onChange={setActiveTab} 
                    items={tabItems}
                    type="card"
                />
            </Card>
            
            {/* Modal Export TVA */}
            <Modal
                title="📄 Export Déclaration TVA"
                open={exportModalVisible}
                onCancel={() => setExportModalVisible(false)}
                footer={null}
                width={500}
            >
                <div style={{ padding: '16px 0' }}>
                    <p>Sélectionnez la période pour générer la déclaration TVA :</p>
                    <Select
                        placeholder="Sélectionner un trimestre"
                        style={{ width: '100%', marginBottom: 16 }}
                        onChange={(value) => {
                            const [year, quarter] = value.split('-');
                            loadExportData(parseInt(year), parseInt(quarter));
                            setExportModalVisible(false);
                        }}
                        loading={loadingExport}
                    >
                        <Option value="2026-1">T1 2026 (Janvier - Mars) - limite 30 Avril</Option>
                        <Option value="2026-2">T2 2026 (Avril - Juin) - limite 31 Juillet</Option>
                        <Option value="2026-3">T3 2026 (Juillet - Septembre) - limite 31 Octobre</Option>
                        <Option value="2026-4">T4 2026 (Octobre - Décembre) - limite 31 Janvier</Option>
                    </Select>
                    
                    <p style={{ fontSize: 12, color: '#666', marginTop: 16 }}>
                        📄 La déclaration inclut :<br />
                        - Ventes (CA HT et TVA collectée)<br />
                        - Achats de verres (TVA déductible)<br />
                        - Net à payer
                    </p>
                </div>
            </Modal>
            
            {/* Modal Aperçu PDF */}
            <Modal
                title="Aperçu Déclaration TVA"
                open={previewModalVisible}
                onCancel={() => setPreviewModalVisible(false)}
                width="90%"
                style={{ top: 20 }}
                footer={[
                    <Button key="cancel" onClick={() => setPreviewModalVisible(false)}>
                        Fermer
                    </Button>,
                    exportData && (
                        <PDFDownloadLink
                            key="download"
                            document={<TVADeclarationPDF data={exportData} />}
                            fileName={`declaration_tva_${exportParams?.year}_t${exportParams?.quarter}.pdf`}
                        >
                            {({ loading }) => (
                                <Button type="primary" icon={<DownloadOutlined />} loading={loading}>
                                    Télécharger le PDF
                                </Button>
                            )}
                        </PDFDownloadLink>
                    )
                ]}
            >
                {exportData && (
                    <div style={{ height: '70vh' }}>
                        <PDFViewer width="100%" height="100%">
                            <TVADeclarationPDF data={exportData} />
                        </PDFViewer>
                    </div>
                )}
            </Modal>
        </div>
    );
};