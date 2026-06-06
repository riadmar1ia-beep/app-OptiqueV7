// frontend/src/components/Clients/ClientDashboard.tsx
import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Statistic,
  Table,
  Tag,
  Button,
  Tabs,
  Empty,
  Spin,
  Descriptions,
  Avatar,
  Space,
  Tooltip,
  Modal,
  Alert,
  Timeline,
  Badge,
  Progress,
  message,
  Popconfirm
} from 'antd';
import {
  ShoppingOutlined,
  DollarOutlined,
  CalendarOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlusOutlined,
  MedicineBoxOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  InsuranceOutlined,
  HistoryOutlined,
  TrophyOutlined,
  DeleteOutlined,
  EditOutlined
} from '@ant-design/icons';
import { clientsService, globalOrderService, clientService } from '../../services/api';
import LensOrderFormEmbedded from '../Lenses/LensOrderFormEmbedded';
import PrescriptionForm from './PrescriptionForm';
import PrescriptionEditForm from './PrescriptionEditForm';

const { Title, Text } = Typography;


// ============================================================
// FONCTIONS UTILITAIRES POUR LA CONVERSION DES NOMBRES
// ============================================================

const toNumber = (value: any): number => {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

const formatSphere = (value: any): string => {
  const num = toNumber(value);
  if (num === 0) return '0.00';
  return `${num > 0 ? '+' : ''}${num.toFixed(2)}`;
};

const formatCylinder = (value: any): string => {
  const num = toNumber(value);
  if (num === 0) return '0.00';
  return num.toFixed(2);
};

const formatAddition = (value: any): string => {
  const num = toNumber(value);
  if (num === 0) return '-';
  return num.toFixed(2);
};

// ============================================================
// INTERFACE DES PROPS
// ============================================================

interface ClientDashboardProps {
  clientId: string;
  clientName: string;
  onClose?: () => void;
  onOrderCreated?: () => void;
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

const ClientDashboard: React.FC<ClientDashboardProps> = ({ 
  clientId, 
  clientName, 
  onClose,
  onOrderCreated 
}) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [showEditPrescriptionModal, setShowEditPrescriptionModal] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState<any>(null);
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState<string | null>(null);
  const [hasValidPrescription, setHasValidPrescription] = useState(false);
  const [checkingPrescription, setCheckingPrescription] = useState(false);
  const [latestValidPrescription, setLatestValidPrescription] = useState<any>(null);

  useEffect(() => {
    console.log('🟢 ClientDashboard monté pour client:', clientId);
    loadClientSummary();
    checkPrescription();
  }, [clientId]);

  const loadClientSummary = async () => {
    setLoading(true);
    try {
      const response = await clientsService.getSummary(clientId);
      console.log('✅ Données client chargées:', response.data.data);
      setData(response.data.data);
    } catch (error) {
      console.error('❌ Erreur chargement dashboard client:', error);
      message.error('Erreur lors du chargement des données client');
    } finally {
      setLoading(false);
    }
  };

  const checkPrescription = async () => {
  console.log('🔍 Vérification ordonnance pour client:', clientId);
  setCheckingPrescription(true);
  
  if (!clientId) {
    setHasValidPrescription(false);
    setLatestValidPrescription(null);
    setCheckingPrescription(false);
    return;
  }
  
  try {
    const response = await clientsService.getPrescriptions(clientId);
    console.log('📡 Réponse API prescriptions:', response.data);
    
    const prescriptions = response.data?.data || [];
    console.log('📋 Nombre d\'ordonnances:', prescriptions.length);
    
    // Filtrer les ordonnances valides
    const validPrescriptions = prescriptions.filter((p: any) => {
      if (!p.expiry_date) return true;
      return new Date(p.expiry_date) > new Date();
    });
    
    const hasValid = validPrescriptions.length > 0;
    console.log('✅ Ordonnance valide:', hasValid);
    setHasValidPrescription(hasValid);
    
    // Stocker la dernière prescription valide (la plus récente) - comme dans NewOrderModal
    if (hasValid && validPrescriptions.length > 0) {
      const latest = validPrescriptions.sort((a: any, b: any) => 
        new Date(b.date_of_issue).getTime() - new Date(a.date_of_issue).getTime()
      )[0];
      setLatestValidPrescription(latest);
      console.log('📋 Dernière prescription valide:', latest);
    } else {
      setLatestValidPrescription(null);
    }
    
  } catch (error: any) {
    console.error('❌ Erreur vérification ordonnance:', error);
    setHasValidPrescription(false);
    setLatestValidPrescription(null);
  } finally {
    setCheckingPrescription(false);
  }
};

  const handleDeletePrescription = async (prescriptionId: string) => {
    try {
      await clientService.deletePrescription(prescriptionId);
      message.success('Ordonnance supprimée avec succès');
      checkPrescription();
      loadClientSummary();
    } catch (error: any) {
      console.error('❌ Erreur suppression:', error);
      message.error(error.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

  const handleAddOrder = async (lensData: any) => {
  console.log('📦 Nouvelle commande verres reçue:', lensData);
  console.log('🔍 Prescription OD brute:', lensData.right_eye?.prescription);
  console.log('🔍 Prescription OG brute:', lensData.left_eye?.prescription);
  
  if (!clientId || !data?.client) {
    message.error('Client non identifié');
    return;
  }
  
  const client = data.client;
  
  if (!hasValidPrescription) {
    Modal.warning({
      title: '⚠️ Ordonnance requise',
      icon: <WarningOutlined style={{ color: '#faad14' }} />,
      content: (
        <div>
          <p>Ce client n'a pas d'ordonnance valide pour commander des verres.</p>
          <p style={{ marginTop: 8, color: '#ff4d4f' }}>
            <strong>Action requise :</strong> Veuillez d'abord ajouter une ordonnance valide.
          </p>
        </div>
      ),
      okText: 'Ajouter une ordonnance',
      onOk: () => setShowPrescriptionModal(true),
      cancelText: 'Annuler'
    });
    setShowOrderModal(false);
    return;
  }
  
  try {
    const items = [];
    
    // ✅ Utiliser la même structure que NewOrderModal
    const mounting = lensData.mounting || {};
    
    if (lensData.right_eye) {
      const od = lensData.right_eye;
      const price = od.price || (lensData.total_price_cents / 2 / 100);
      
      items.push({
        type: 'lens',
        product_id: null,
        description: `${od.type || 'progressive'} | ${od.index || '1.67'} | ${od.material || 'organic'}`,
        quantity: 1,
        unit_price_cents: Math.round(price * 100),
        total_cents: Math.round(price * 100),
        tva_rate: 20,
        metadata: {
          eye: 'OD',
          lens_config: {
            type: od.type,
            index: od.index,
            material: od.material,
            coatings: od.coatings || [],
            coatings_detail: od.coatings_detail || [],
            tint: od.tint || { color: 'none', gradient: false, intensity: 0 }
          },
          // ✅ IMPORTANT: la prescription doit être directement accessible
          prescription: od.prescription || {
            sphere: od.sphere || 0,
            cylinder: od.cylinder || 0,
            axis: od.axis || null,
            addition: od.addition || null,
            prism: od.prism || null,
            prism_base: od.prism_base || null
          },
          mounting: mounting,
          purchase_price_cents: 0,
        }
      });
    }
    
    if (lensData.left_eye) {
      const og = lensData.left_eye;
      const price = og.price || (lensData.total_price_cents / 2 / 100);
      
      items.push({
        type: 'lens',
        product_id: null,
        description: `${og.type || 'progressive'} | ${og.index || '1.67'} | ${og.material || 'organic'}`,
        quantity: 1,
        unit_price_cents: Math.round(price * 100),
        total_cents: Math.round(price * 100),
        tva_rate: 20,
        metadata: {
          eye: 'OG',
          lens_config: {
            type: og.type,
            index: og.index,
            material: og.material,
            coatings: og.coatings || [],
            coatings_detail: og.coatings_detail || [],
            tint: og.tint || { color: 'none', gradient: false, intensity: 0 }
          },
          // ✅ IMPORTANT: la prescription doit être directement accessible
          prescription: og.prescription || {
            sphere: og.sphere || 0,
            cylinder: og.cylinder || 0,
            axis: og.axis || null,
            addition: og.addition || null,
            prism: og.prism || null,
            prism_base: og.prism_base || null
          },
          mounting: mounting,
          purchase_price_cents: 0,
        }
      });
    }
    
    if (items.length === 0) {
      message.error('Aucun verre configuré');
      return;
    }
    
    const orderData = {
      customer_name: `${client.first_name} ${client.last_name}`,
      customer_email: client.email,
      customer_phone: client.phone,
      client_id: client.id,
      notes: 'Commande créée depuis le dashboard client',
      items: items
    };
    
    console.log('📤 Envoi au backend:', JSON.stringify(orderData, null, 2));
    
    const response = await globalOrderService.create(orderData);
    
    console.log('✅ Réponse reçue:', response.data);
    message.success(`Commande créée avec succès !`);
    
    setShowOrderModal(false);
    setSelectedPrescription(null);
    await loadClientSummary();
    if (onOrderCreated) onOrderCreated();
    
  } catch (error: any) {
    console.error('❌ Erreur détaillée:', error);
    const errorMsg = error.response?.data?.error || error.message || 'Erreur lors de la création de la commande';
    message.error(errorMsg);
  }
};

  const handleOrderFromPrescription = (prescription: any) => {
    console.log('📋 Commande depuis ordonnance:', prescription);
    setSelectedPrescription(prescription);
    setShowOrderModal(true);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!data) {
    return <Empty description="Impossible de charger les données client" />;
  }

  const { client, stats, recent_orders, prescriptions, next_expiry } = data;

  const hasExpiringSoon = next_expiry && 
    new Date(next_expiry) > new Date() && 
    new Date(next_expiry) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const getStatusConfig = (status: string) => {
    const configs: any = {
      draft: { color: 'default', label: 'Brouillon', icon: <ClockCircleOutlined />, progress: 10 },
      pending: { color: 'orange', label: 'En attente', icon: <ClockCircleOutlined />, progress: 25 },
      in_production: { color: 'blue', label: 'En production', icon: <ClockCircleOutlined />, progress: 50 },
      ready: { color: 'cyan', label: 'Prêt', icon: <CheckCircleOutlined />, progress: 75 },
      delivered: { color: 'green', label: 'Livré', icon: <CheckCircleOutlined />, progress: 100 },
      paid: { color: 'green', label: 'Payé', icon: <CheckCircleOutlined />, progress: 100 },
      cancelled: { color: 'red', label: 'Annulé', icon: <WarningOutlined />, progress: 0 }
    };
    return configs[status] || { color: 'default', label: status, icon: null, progress: 0 };
  };

  // ============================================================
  // COLONNES DU TABLEAU DES COMMANDES
  // ============================================================

  const orderColumns = [
    {
      title: 'N° Commande',
      dataIndex: 'order_number',
      key: 'order_number',
      width: 150,
      render: (text: string, record: any) => (
        <Button type="link" style={{ padding: 0, fontWeight: 'bold' }}>
          #{text || record.id?.slice(0, 8) || 'N/A'}
        </Button>
      )
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 110,
      render: (date: string) => date ? new Date(date).toLocaleDateString('fr-FR') : '-'
    },
    {
      title: 'Articles',
      key: 'items',
      render: (_: any, record: any) => (
        <Space size={4} wrap>
          {record.items?.slice(0, 2).map((item: any, idx: number) => (
            <Tag key={idx} style={{ fontSize: 11 }}>
              {item.item_type === 'lens' ? '🔍 Verres' : 
               item.item_type === 'frame' ? '👓 Monture' : 
               item.item_type === 'accessory' ? '📎 Accessoire' :
               item.description?.substring(0, 20) || 'Article'}
            </Tag>
          ))}
          {record.items?.length > 2 && (
            <Tag>+{record.items.length - 2}</Tag>
          )}
        </Space>
      )
    },
    {
      title: 'Montant',
      key: 'total',
      width: 120,
      align: 'right' as const,
      render: (_: any, record: any) => {
        let totalCents = 0;
        
        if (record.total_ttc_cents) {
          totalCents = record.total_ttc_cents;
        } else if (record.total_cents) {
          totalCents = record.total_cents;
        } else if (record.amount_ttc_cents) {
          totalCents = record.amount_ttc_cents;
        } else if (record.items && record.items.length > 0) {
          totalCents = record.items.reduce((sum: number, item: any) => {
            return sum + (item.total_cents || item.total_ttc_cents || 0);
          }, 0);
        }
        
        const totalDh = totalCents / 100;
        
        return (
          <Text strong style={{ color: totalDh > 0 ? '#1677ff' : '#ff4d4f' }}>
            {totalDh.toFixed(2)} DH
          </Text>
        );
      }
    },
    {
      title: 'Statut',
      key: 'status',
      width: 140,
      render: (_: any, record: any) => {
        const status = getStatusConfig(record.order_status || record.status || record.payment_status);
        return (
          <div>
            <Tag color={status.color} icon={status.icon}>
              {status.label}
            </Tag>
            {status.progress > 0 && status.progress < 100 && (
              <Progress 
                percent={status.progress} 
                size="small" 
                showInfo={false}
                style={{ width: 80, marginTop: 4 }}
              />
            )}
          </div>
        );
      }
    }
  ];

  // ============================================================
  // COLONNES DU TABLEAU DES ORDONNANCES AVEC ACTIONS
  // ============================================================

  const prescriptionColumns = [
    {
      title: 'Médecin',
      dataIndex: 'doctor_name',
      key: 'doctor_name',
      render: (name: string) => name || 'Non spécifié'
    },
    {
      title: 'Délivrance',
      dataIndex: 'date_of_issue',
      key: 'date_of_issue',
      width: 100,
      render: (date: string) => date ? new Date(date).toLocaleDateString('fr-FR') : '-'
    },
    {
      title: 'Validité',
      dataIndex: 'expiry_date',
      key: 'expiry_date',
      width: 150,
      render: (date: string) => {
        if (!date) return <Tag color="green" icon={<CheckCircleOutlined />}>Permanente</Tag>;
        const expiryDate = new Date(date);
        const isExpired = expiryDate < new Date();
        const daysLeft = Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
        
        if (isExpired) {
          return <Tag color="red" icon={<WarningOutlined />}>Expirée</Tag>;
        }
        if (daysLeft <= 30) {
          return <Tag color="orange" icon={<WarningOutlined />}>{daysLeft} jours restants</Tag>;
        }
        return <Tag color="green">{expiryDate.toLocaleDateString('fr-FR')}</Tag>;
      }
    },
    {
      title: 'OD',
      key: 'od',
      width: 120,
      render: (_: any, record: any) => {
        const odSphere = toNumber(record.od_sphere);
        const odCylinder = toNumber(record.od_cylinder);
        const hasCorrection = odSphere !== 0 || odCylinder !== 0;
        
        return (
          <Tooltip title={`SPH ${formatSphere(record.od_sphere)} | CYL ${formatCylinder(record.od_cylinder)} | ADD ${formatAddition(record.od_addition)}`}>
            <Tag color={hasCorrection ? 'blue' : 'default'}>
              {hasCorrection ? (
                <>
                  {odSphere !== 0 && `${odSphere > 0 ? '+' : ''}${odSphere.toFixed(2)}`}
                  {odCylinder !== 0 && ` / ${odCylinder.toFixed(2)}`}
                </>
              ) : 'Plano'}
            </Tag>
          </Tooltip>
        );
      }
    },
    {
      title: 'OG',
      key: 'og',
      width: 120,
      render: (_: any, record: any) => {
        const ogSphere = toNumber(record.og_sphere);
        const ogCylinder = toNumber(record.og_cylinder);
        const hasCorrection = ogSphere !== 0 || ogCylinder !== 0;
        
        return (
          <Tooltip title={`SPH ${formatSphere(record.og_sphere)} | CYL ${formatCylinder(record.og_cylinder)} | ADD ${formatAddition(record.og_addition)}`}>
            <Tag color={hasCorrection ? 'blue' : 'default'}>
              {hasCorrection ? (
                <>
                  {ogSphere !== 0 && `${ogSphere > 0 ? '+' : ''}${ogSphere.toFixed(2)}`}
                  {ogCylinder !== 0 && ` / ${ogCylinder.toFixed(2)}`}
                </>
              ) : 'Plano'}
            </Tag>
          </Tooltip>
        );
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      render: (_: any, record: any) => (
        <Space>
          <Tooltip title="Modifier">
            <Button 
              type="link" 
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setSelectedPrescriptionId(record.id);
                setShowEditPrescriptionModal(true);
              }}
            />
          </Tooltip>
          <Tooltip title="Supprimer">
            <Popconfirm
              title="Supprimer cette ordonnance ?"
              description="Cette action est irréversible."
              onConfirm={() => handleDeletePrescription(record.id)}
              okText="Oui, supprimer"
              cancelText="Non"
              okButtonProps={{ danger: true }}
            >
              <Button 
                type="link" 
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          </Tooltip>
          <Tooltip title="Voir détails">
            <Button 
              type="link" 
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                Modal.info({
                  title: `Ordonnance du ${new Date(record.date_of_issue).toLocaleDateString('fr-FR')}`,
                  width: 700,
                  icon: <MedicineBoxOutlined />,
                  okText: 'Fermer',
                  content: (
                    <div>
                      <Descriptions column={2} bordered size="small" style={{ marginTop: 16 }}>
                        <Descriptions.Item label="Médecin" span={2}>
                          {record.doctor_name || 'Non spécifié'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Date de délivrance">
                          {record.date_of_issue ? new Date(record.date_of_issue).toLocaleDateString('fr-FR') : '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Date d'expiration">
                          {record.expiry_date ? new Date(record.expiry_date).toLocaleDateString('fr-FR') : 'Permanente'}
                        </Descriptions.Item>
                        
                        <Descriptions.Item label="OD Sphère" span={1}>
                          {formatSphere(record.od_sphere)}
                        </Descriptions.Item>
                        <Descriptions.Item label="OG Sphère" span={1}>
                          {formatSphere(record.og_sphere)}
                        </Descriptions.Item>
                        
                        <Descriptions.Item label="OD Cylindre">
                          {formatCylinder(record.od_cylinder)}
                        </Descriptions.Item>
                        <Descriptions.Item label="OG Cylindre">
                          {formatCylinder(record.og_cylinder)}
                        </Descriptions.Item>
                        
                        <Descriptions.Item label="OD Axe">
                          {record.od_axis || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="OG Axe">
                          {record.og_axis || '-'}
                        </Descriptions.Item>
                        
                        <Descriptions.Item label="OD Addition">
                          {formatAddition(record.od_addition)}
                        </Descriptions.Item>
                        <Descriptions.Item label="OG Addition">
                          {formatAddition(record.og_addition)}
                        </Descriptions.Item>
                      </Descriptions>
                      {record.notes && (
                        <Alert
                          message="Notes du médecin"
                          description={record.notes}
                          type="info"
                          style={{ marginTop: 16 }}
                        />
                      )}
                      <div style={{ marginTop: 16, textAlign: 'center' }}>
                        <Button 
                          type="primary" 
                          icon={<ShoppingOutlined />}
                          onClick={() => handleOrderFromPrescription(record)}
                          disabled={!hasValidPrescription}
                        >
                          Commander des verres avec cette ordonnance
                        </Button>
                      </div>
                    </div>
                  )
                });
              }}
            >
              Détails
            </Button>
          </Tooltip>
        </Space>
      )
    }
  ];

  // ============================================================
  // TIMELINE DES ACTIVITÉS
  // ============================================================

  const timelineItems = [
    {
      dot: <UserOutlined style={{ fontSize: 14 }} />,
      children: (
        <div>
          <Text strong>Client inscrit</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {client.created_at ? new Date(client.created_at).toLocaleDateString('fr-FR') : '-'}
          </Text>
        </div>
      ),
      color: 'green',
      key: 'client-created'
    },
    ...(recent_orders || []).map((order: any, idx: number) => ({
      dot: <ShoppingOutlined style={{ fontSize: 14 }} />,
      children: (
        <div>
          <Text strong>Commande #{order.order_number || order.id?.slice(0, 8) || 'N/A'}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {order.created_at ? new Date(order.created_at).toLocaleDateString('fr-FR') : '-'} - 
            Montant: {(toNumber(order.total_cents) / 100).toFixed(2)} DH
          </Text>
        </div>
      ),
      color: 'blue',
      key: `order-${order.id || idx}`
    })),
    ...(prescriptions || []).slice(0, 3).map((presc: any, idx: number) => ({
      dot: <MedicineBoxOutlined style={{ fontSize: 14 }} />,
      children: (
        <div>
          <Text strong>Ordonnance délivrée</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Dr. {presc.doctor_name || 'Médecin'} - 
            {presc.date_of_issue ? new Date(presc.date_of_issue).toLocaleDateString('fr-FR') : '-'}
          </Text>
        </div>
      ),
      color: 'orange',
      key: `presc-${presc.id || idx}`
    }))
  ];

  // ============================================================
  // RENDU PRINCIPAL
  // ============================================================

  return (
    <div style={{ padding: '0 8px' }}>
      {/* En-tête avec infos client */}
      <Card 
        style={{ 
          marginBottom: 16, 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: 12
        }}
      >
        <Row align="middle" gutter={16}>
          <Col>
            <Avatar 
              size={72} 
              style={{ 
                backgroundColor: '#fff', 
                color: '#667eea',
                border: '3px solid rgba(255,255,255,0.3)'
              }}
            >
              {client.first_name?.[0] || ''}{client.last_name?.[0] || ''}
            </Avatar>
          </Col>
          <Col flex="auto">
            <Title level={3} style={{ color: '#fff', margin: 0 }}>
              {client.first_name || ''} {client.last_name || ''}
            </Title>
            <Space direction="vertical" size={2}>
              <Space>
                <PhoneOutlined style={{ color: 'rgba(255,255,255,0.85)' }} />
                <Text style={{ color: 'rgba(255,255,255,0.85)' }}>{client.phone || '-'}</Text>
                {client.email && (
                  <>
                    <MailOutlined style={{ color: 'rgba(255,255,255,0.85)', marginLeft: 12 }} />
                    <Text style={{ color: 'rgba(255,255,255,0.85)' }}>{client.email}</Text>
                  </>
                )}
                {toNumber(client.insurance_rate) > 0 && (
                  <>
                    <InsuranceOutlined style={{ color: 'rgba(255,255,255,0.85)', marginLeft: 12 }} />
                    <Text style={{ color: 'rgba(255,255,255,0.85)' }}>Mutuelle: {client.insurance_rate}%</Text>
                  </>
                )}
              </Space>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                Client depuis le {client.created_at ? new Date(client.created_at).toLocaleDateString('fr-FR') : '-'}
              </Text>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button 
                type="primary" 
                icon={<PlusOutlined />}
                onClick={() => {
                  console.log('🔵 Bouton Nouvelle commande cliqué');
                  if (!hasValidPrescription) {
                    Modal.warning({
                      title: '⚠️ Ordonnance requise',
                      content: 'Ce client ne peut pas commander de verres sans ordonnance valide.',
                      okText: 'Ajouter une ordonnance',
                      onOk: () => setShowPrescriptionModal(true),
                    });
                    return;
                  }
                  setShowOrderModal(true);
                }}
                style={{ background: '#fff', color: '#667eea', border: 'none', fontWeight: 'bold' }}
              >
                Nouvelle commande
              </Button>
              {onClose && (
                <Button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none' }}>
                  Fermer
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Alerte ordonnance manquante ou expirée */}
      {!hasValidPrescription && !checkingPrescription && (
        <Alert
          title="⚠️ Ordonnance requise"
          description="Ce client ne peut pas commander de verres sans ordonnance valide. Veuillez ajouter une ordonnance."
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16, borderRadius: 8 }}
          action={
            <Button 
              size="small" 
              type="primary"
              onClick={() => setShowPrescriptionModal(true)}
            >
              + Ajouter une ordonnance
            </Button>
          }
        />
      )}

      {/* Alerte ordonnance qui expire bientôt */}
      {hasValidPrescription && hasExpiringSoon && (
        <Alert
          title="⚠️ Ordonnance bientôt expirée"
          description={`Une ordonnance expire le ${new Date(next_expiry).toLocaleDateString('fr-FR')}. Pensez à en faire établir une nouvelle.`}
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16, borderRadius: 8 }}
          action={
            <Button size="small" type="primary" danger>
              Renouveler
            </Button>
          }
        />
      )}

      {/* Statistiques clés */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card style={{ borderRadius: 8, textAlign: 'center' }}>
            <Statistic
              title="Total dépensé"
              value={toNumber(stats?.total_spent)}
              precision={2}
              suffix="DH"
              prefix={<DollarOutlined style={{ color: '#3f8600' }} />}
              styles={{ content: { color: '#3f8600', fontSize: 24 } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 8, textAlign: 'center' }}>
            <Statistic
              title="Commandes"
              value={toNumber(stats?.total_orders)}
              prefix={<ShoppingOutlined style={{ color: '#1890ff' }} />}
              styles={{ content: { fontSize: 24 } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 8, textAlign: 'center' }}>
            <Statistic
              title="Ordonnances"
              value={toNumber(stats?.active_prescriptions)}
              prefix={<MedicineBoxOutlined style={{ color: '#52c41a' }} />}
              styles={{ content: { fontSize: 24 } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 8, textAlign: 'center' }}>
            <Statistic
              title="Dernière visite"
              value={stats?.last_visit ? new Date(stats.last_visit).toLocaleDateString('fr-FR') : 'Jamais'}
              prefix={<CalendarOutlined style={{ color: '#faad14' }} />}
              styles={{ content: { fontSize: 18 } }}
            />
          </Card>
        </Col>
      </Row>

      {/* Badge de fidélité si +5000 DH dépensés */}
      {toNumber(stats?.total_spent) >= 5000 && (
        <Card 
          style={{ 
            marginBottom: 16, 
            background: 'linear-gradient(135deg, #f5f0ff 0%, #e8e0ff 100%)',
            borderRadius: 8,
            textAlign: 'center'
          }}
        >
          <Space>
            <TrophyOutlined style={{ fontSize: 28, color: '#faad14' }} />
            <div>
              <Text strong style={{ fontSize: 16 }}>Client Fidèle ⭐</Text>
              <br />
              <Text type="secondary">
                {toNumber(stats?.total_spent) >= 10000 ? 'Platinum' : 'Gold'} - 
                Total dépensé: {toNumber(stats?.total_spent).toFixed(2)} DH
              </Text>
            </div>
          </Space>
        </Card>
      )}

      {/* Onglets principaux */}
      <Tabs
        defaultActiveKey="orders"
        items={[
          {
            key: 'orders',
            label: <span><ShoppingOutlined /> Commandes ({toNumber(stats?.total_orders)})</span>,
            children: (
              <Table
                columns={orderColumns}
                dataSource={recent_orders || []}
                rowKey={(record) => `order-${record.id}`}
                pagination={false}
                locale={{ emptyText: 'Aucune commande pour ce client' }}
                expandable={{
                  expandedRowRender: (record) => (
                    <div style={{ margin: 0, paddingLeft: 24 }}>
                      <Text strong type="secondary">Détails de la commande</Text>
                      <div style={{ marginTop: 8 }}>
                        {record.items?.map((item: any, idx: number) => (
                          <div key={`item-${record.id}-${idx}`} style={{ marginBottom: 8 }}>
                            <Tag color="blue">{item.item_type}</Tag>
                            <Text>{item.description || item.product_name || item.reference}</Text>
                            <Text style={{ float: 'right' }}>
                              {item.quantity} x {(toNumber(item.total_cents) / 100 / toNumber(item.quantity)).toFixed(2)} DH
                            </Text>
                          </div>
                        ))}
                      </div>
                    </div>
                  ),
                  rowExpandable: (record) => record.items && record.items.length > 0
                }}
              />
            )
          },
          {
            key: 'prescriptions',
            label: <span><MedicineBoxOutlined /> Ordonnances {(prescriptions || []).length}</span>,
            children: (
              <div>
                <div style={{ marginBottom: 16, textAlign: 'right' }}>
                  <Button 
                    type="primary" 
                    icon={<PlusOutlined />}
                    onClick={() => setShowPrescriptionModal(true)}
                  >
                    Ajouter une ordonnance
                  </Button>
                </div>
                <Table
                  columns={prescriptionColumns}
                  dataSource={prescriptions || []}
                  rowKey={(record) => `presc-${record.id}`}
                  pagination={false}
                  locale={{ emptyText: 'Aucune ordonnance enregistrée' }}
                />
              </div>
            )
          },
          {
            key: 'history',
            label: <span><HistoryOutlined /> Historique</span>,
            children: (
              <Card style={{ borderRadius: 8 }}>
                <Timeline
                  items={timelineItems}
                  style={{ marginTop: 16 }}
                />
                {(recent_orders || []).length === 0 && (prescriptions || []).length === 0 && (
                  <Empty 
                    description="Aucune activité récente" 
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                )}
              </Card>
            )
          }
        ]}
      />

  {/* Modal création commande */}
<Modal
  title={
    <Space>
      <PlusOutlined />
      <span>Nouvelle commande verres</span>
      {selectedPrescription ? (
        <Tag color="blue" icon={<MedicineBoxOutlined />}>
          Ordonnance du {new Date(selectedPrescription.date_of_issue).toLocaleDateString('fr-FR')}
        </Tag>
      ) : latestValidPrescription ? (
        <Tag color="green" icon={<MedicineBoxOutlined />}>
          📋 Dernière ordonnance valide - Dr. {latestValidPrescription.doctor_name || 'inconnu'} — {new Date(latestValidPrescription.date_of_issue).toLocaleDateString('fr-FR')}
        </Tag>
      ) : (
        <Tag color="orange" icon={<WarningOutlined />}>
          ⚠️ Aucune ordonnance valide
        </Tag>
      )}
    </Space>
  }
  open={showOrderModal}
  onCancel={() => {
    console.log('❌ Fermeture modale');
    setShowOrderModal(false);
    setSelectedPrescription(null);
  }}
  footer={null}
  width={800}
  destroyOnHidden
  maskClosable={false}
>
  <LensOrderFormEmbedded
    onConfirm={(lensData: any) => {
      console.log('✅ Confirmation commande reçue:', lensData);
      handleAddOrder(lensData);
    }}
    onCancel={() => {
      console.log('❌ Annulation commande');
      setShowOrderModal(false);
      setSelectedPrescription(null);
    }}
    // Priorité à la prescription sélectionnée manuellement, sinon utiliser la dernière valide
    initialPrescription={selectedPrescription ? {
      od: {
        sphere: selectedPrescription.od_sphere ?? 0,
        cylinder: selectedPrescription.od_cylinder ?? 0,
        axis: selectedPrescription.od_axis ?? null,
        addition: selectedPrescription.od_addition ?? null,
      },
      og: {
        sphere: selectedPrescription.og_sphere ?? 0,
        cylinder: selectedPrescription.og_cylinder ?? 0,
        axis: selectedPrescription.og_axis ?? null,
        addition: selectedPrescription.og_addition ?? null,
      },
      pupillary_distance: selectedPrescription.pupillary_distance ?? 0,
    } : (latestValidPrescription ? {
      od: {
        sphere: latestValidPrescription.od_sphere ?? 0,
        cylinder: latestValidPrescription.od_cylinder ?? 0,
        axis: latestValidPrescription.od_axis ?? null,
        addition: latestValidPrescription.od_addition ?? null,
      },
      og: {
        sphere: latestValidPrescription.og_sphere ?? 0,
        cylinder: latestValidPrescription.og_cylinder ?? 0,
        axis: latestValidPrescription.og_axis ?? null,
        addition: latestValidPrescription.og_addition ?? null,
      },
      pupillary_distance: latestValidPrescription.pupillary_distance ?? 0,
    } : null)}
    prescriptionLabel={selectedPrescription 
      ? `Dr. ${selectedPrescription.doctor_name || 'inconnu'} — ${selectedPrescription.date_of_issue ? new Date(selectedPrescription.date_of_issue).toLocaleDateString('fr-FR') : ''}`
      : (latestValidPrescription 
        ? `📋 Ordonnance chargée automatiquement - Dr. ${latestValidPrescription.doctor_name || 'inconnu'} — ${new Date(latestValidPrescription.date_of_issue).toLocaleDateString('fr-FR')}`
        : undefined)
    }
  />
</Modal>

      {/* Modal ajout ordonnance */}
      <PrescriptionForm
        visible={showPrescriptionModal}
        clientId={clientId}
        clientName={`${client.first_name} ${client.last_name}`}
        onClose={() => {
          setShowPrescriptionModal(false);
        }}
        onSuccess={() => {
          console.log('✅ Ordonnance ajoutée, rechargement...');
          checkPrescription();
          loadClientSummary();
        }}
      />

      {/* Modal modification ordonnance */}
      <PrescriptionEditForm
        visible={showEditPrescriptionModal}
        prescriptionId={selectedPrescriptionId || ''}
        clientName={`${client.first_name} ${client.last_name}`}
        onClose={() => {
          setShowEditPrescriptionModal(false);
          setSelectedPrescriptionId(null);
        }}
        onSuccess={() => {
          console.log('✅ Ordonnance modifiée, rechargement...');
          checkPrescription();
          loadClientSummary();
        }}
      />
    </div>
  );
};

export default ClientDashboard;