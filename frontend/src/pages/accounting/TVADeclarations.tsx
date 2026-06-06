import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Tag, Modal, Select, message,
  Descriptions, Spin, Alert, Typography, Statistic, Row, Col,
  Divider, Timeline, Tooltip
} from 'antd';
import {
  PlusOutlined, EyeOutlined, CheckCircleOutlined,
  WarningOutlined, FileTextOutlined, DownloadOutlined,
  ReloadOutlined, CalendarOutlined
} from '@ant-design/icons';
import { accountingService } from '../../services/api';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { TVADeclarationPDF } from '../../components/accounting/TVADeclarationPDF';

const { Title, Text } = Typography;
const { Option } = Select;



interface TVADeclaration {
  id: number;
  year: number;
  quarter: number;
  start_date: string;
  end_date: string;
  due_date: string;
  total_ht_cents: number;
  total_tva_collected_cents: number;
  total_tva_deductible_cents: number;
  net_tva_due_cents: number;
  status: 'draft' | 'submitted' | 'validated';
  created_at: string;
  validated_at: string;
  created_by_name: string;
  validated_by_name: string;
}

const TVADeclarations: React.FC = () => {
  const [pdfData, setPdfData] = useState<any>(null);
  const [pdfLoading, setPdfLoading] = useState<number | null>(null);
  const [declarations, setDeclarations] = useState<TVADeclaration[]>([]);
  const [loading, setLoading] = useState(false);
  const [generateModalVisible, setGenerateModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedDeclaration, setSelectedDeclaration] = useState<TVADeclaration | null>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState<number>(() => {
    const now = new Date();
    return Math.floor(now.getMonth() / 3) + 1;
  });
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchDeclarations();
  }, []);

// Dans TVADeclarations.tsx, ligne ~44
const fetchDeclarations = async () => {
  setLoading(true);
  try {
    const response = await accountingService.getTVADeclarations();
    console.log('📊 Déclarations reçues:', response.data);
    setDeclarations(response.data.data || []);
  } catch (error) {
    console.error('Erreur chargement déclarations:', error);
    message.error('Erreur lors du chargement');
  } finally {
    setLoading(false);
  }
};

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await accountingService.generateTVADeclaration(selectedYear, selectedQuarter);
      message.success(`Déclaration T${selectedQuarter} ${selectedYear} générée avec succès`);
      setGenerateModalVisible(false);
      fetchDeclarations();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  };

const handleExportPDF = async (id: number) => {
  setPdfLoading(id);
  try {
    const response = await accountingService.exportTVADeclaration(id);
    setPdfData(response.data);
  } catch (error) {
    message.error('Erreur lors de la génération du PDF');
  } finally {
    setPdfLoading(null);
  }
};

  const handleValidate = async (id: number) => {
    Modal.confirm({
      title: 'Validation de la déclaration',
      content: 'Une fois validée, la déclaration ne pourra plus être modifiée. Confirmez-vous ?',
      onOk: async () => {
        try {
          await accountingService.validateTVADeclaration(id);
          message.success('Déclaration validée avec succès');
          fetchDeclarations();
        } catch (error) {
          message.error('Erreur lors de la validation');
        }
      }
    });
  };

  const handleViewDetails = async (id: number) => {
    try {
      const response = await accountingService.getTVADeclarationDetail(id);
      setSelectedDeclaration(response.data.data);
      setDetailItems(response.data.data.items || []);
      setDetailModalVisible(true);
    } catch (error) {
      message.error('Erreur lors du chargement des détails');
    }
  };

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'draft':
        return <Tag color="orange" icon={<WarningOutlined />}>Brouillon</Tag>;
      case 'submitted':
        return <Tag color="blue" icon={<FileTextOutlined />}>Soumise</Tag>;
      case 'validated':
        return <Tag color="green" icon={<CheckCircleOutlined />}>Validée</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const getQuarterLabel = (quarter: number) => {
    const labels: Record<number, string> = {
      1: '1er Trimestre (Jan-Mar)',
      2: '2ème Trimestre (Avr-Juin)',
      3: '3ème Trimestre (Juil-Sep)',
      4: '4ème Trimestre (Oct-Déc)'
    };
    return labels[quarter];
  };

  const columns = [
    {
      title: 'Période',
      key: 'period',
      render: (_: any, record: TVADeclaration) => (
        <Space>
          <CalendarOutlined />
          <span>{getQuarterLabel(record.quarter)} {record.year}</span>
        </Space>
      )
    },
    {
      title: 'Période',
      dataIndex: 'start_date',
      key: 'start_date',
      render: (date: string, record: TVADeclaration) => (
        <span>
          {new Date(date).toLocaleDateString('fr-FR')} → {new Date(record.end_date).toLocaleDateString('fr-FR')}
        </span>
      )
    },
    {
      title: 'Date limite',
      dataIndex: 'due_date',
      key: 'due_date',
      render: (date: string) => (
        <span style={{ color: new Date(date) < new Date() ? '#ff4d4f' : '#52c41a' }}>
          {new Date(date).toLocaleDateString('fr-FR')}
        </span>
      )
    },
    {
      title: 'Total HT',
      key: 'total_ht',
      render: (_: any, record: TVADeclaration) => (
        <Text>{(record.total_ht_cents / 100).toFixed(2)} DH</Text>
      )
    },
    {
      title: 'TVA collectée',
      key: 'collected',
      render: (_: any, record: TVADeclaration) => (
        <Text strong style={{ color: '#52c41a' }}>
          {(record.total_tva_collected_cents / 100).toFixed(2)} DH
        </Text>
      )
    },
    {
      title: 'TVA déductible',
      key: 'deductible',
      render: (_: any, record: TVADeclaration) => (
        <Text style={{ color: '#faad14' }}>
          {(record.total_tva_deductible_cents / 100).toFixed(2)} DH
        </Text>
      )
    },
    {
      title: 'Net à payer',
      key: 'net',
      render: (_: any, record: TVADeclaration) => (
        <Text strong style={{ color: record.net_tva_due_cents > 0 ? '#ff4d4f' : '#52c41a' }}>
          {(record.net_tva_due_cents / 100).toFixed(2)} DH
        </Text>
      )
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      render: getStatusTag
    },
    {
      title: 'Actions',
      
  key: 'actions',
  render: (_: any, record: TVADeclaration) => (
    <Space>
      <Tooltip title="Voir détails">
        <Button icon={<EyeOutlined />} size="small" onClick={() => handleViewDetails(record.id)} />
      </Tooltip>
      {record.status === 'draft' && (
        <Tooltip title="Valider la déclaration">
          <Button icon={<CheckCircleOutlined />} size="small" type="primary" onClick={() => handleValidate(record.id)} />
        </Tooltip>
      )}
      {/* Nouveau bouton Export PDF */}
      <Tooltip title="Exporter PDF">
        {pdfData && pdfData.declaration?.id === record.id ? (
          <PDFDownloadLink
            document={<TVADeclarationPDF data={pdfData} />}
            fileName={`declaration_tva_${record.year}_t${record.quarter}.pdf`}
          >
            {({ loading }) => (
              <Button 
                icon={<DownloadOutlined />} 
                size="small" 
                loading={loading}
                type="default"
              >
                PDF
              </Button>
            )}
          </PDFDownloadLink>
        ) : (
          <Button 
            icon={<DownloadOutlined />} 
            size="small" 
            onClick={() => handleExportPDF(record.id)}
            loading={pdfLoading === record.id}
          />
        )}
      </Tooltip>
    </Space>
      )
    }
  ];

  const detailColumns = [
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => (
        <Tag color={type === 'sale' ? 'blue' : 'orange'}>
          {type === 'sale' ? 'Vente' : 'Achat'}
        </Tag>
      )
    },
    {
      title: 'Document',
      dataIndex: 'document_number',
      key: 'document_number',
      render: (num: string) => num || '-'
    },
    {
      title: 'Date',
      dataIndex: 'document_date',
      key: 'document_date',
      render: (date: string) => new Date(date).toLocaleDateString('fr-FR')
    },
    {
      title: 'Taux TVA',
      dataIndex: 'tva_rate',
      key: 'tva_rate',
      render: (rate: number) => `${rate}%`
    },
    {
      title: 'Montant HT',
      dataIndex: 'amount_ht_cents',
      key: 'amount_ht_cents',
      align: 'right' as const,
      render: (cents: number) => `${(cents / 100).toFixed(2)} DH`
    },
    {
      title: 'TVA',
      dataIndex: 'tva_amount_cents',
      key: 'tva_amount_cents',
      align: 'right' as const,
      render: (cents: number) => `${(cents / 100).toFixed(2)} DH`
    }
  ];

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={2}>📑 Déclarations TVA</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchDeclarations} loading={loading}>
            Actualiser
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setGenerateModalVisible(true)}>
            Générer une déclaration
          </Button>
        </Space>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={declarations}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Modal Génération */}
      <Modal
        title="Générer une déclaration TVA"
        open={generateModalVisible}
        onCancel={() => setGenerateModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setGenerateModalVisible(false)}>
            Annuler
          </Button>,
          <Button key="generate" type="primary" onClick={handleGenerate} loading={generating}>
            Générer
          </Button>
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>Année</Text>
            <Select value={selectedYear} onChange={setSelectedYear} style={{ width: '100%', marginTop: 8 }}>
              {years.map(y => (
                <Option key={y} value={y}>{y}</Option>
              ))}
            </Select>
          </div>
          <div style={{ marginTop: 16 }}>
            <Text strong>Trimestre</Text>
            <Select value={selectedQuarter} onChange={setSelectedQuarter} style={{ width: '100%', marginTop: 8 }}>
              <Option value={1}>T1 - Janvier à Mars (limite: 30 Avril)</Option>
              <Option value={2}>T2 - Avril à Juin (limite: 31 Juillet)</Option>
              <Option value={3}>T3 - Juillet à Septembre (limite: 31 Octobre)</Option>
              <Option value={4}>T4 - Octobre à Décembre (limite: 31 Janvier)</Option>
            </Select>
          </div>
          <Divider />
          <Alert
            type="info"
            message="⚠️ Attention"
            description="La génération d'une déclaration remplacera toute version draft existante pour cette période. Les déclarations validées ne peuvent pas être modifiées."
            showIcon
          />
        </Space>
      </Modal>

      {/* Modal Détails */}
      <Modal
        title={
          selectedDeclaration && (
            <Space>
              <FileTextOutlined />
              <span>Déclaration TVA {getQuarterLabel(selectedDeclaration.quarter)} {selectedDeclaration.year}</span>
              {getStatusTag(selectedDeclaration.status)}
            </Space>
          )
        }
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={<Button onClick={() => setDetailModalVisible(false)}>Fermer</Button>}
        width={900}
      >
        {selectedDeclaration && (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <Card size="small">
                  <Statistic
                    title="Total HT"
                    value={selectedDeclaration.total_ht_cents / 100}
                    precision={2}
                    suffix="DH"
                  />
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small">
                  <Statistic
                    title="TVA collectée"
                    value={selectedDeclaration.total_tva_collected_cents / 100}
                    precision={2}
                    suffix="DH"
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Card>
              </Col>
            </Row>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <Card size="small">
                  <Statistic
                    title="TVA déductible"
                    value={selectedDeclaration.total_tva_deductible_cents / 100}
                    precision={2}
                    suffix="DH"
                    valueStyle={{ color: '#faad14' }}
                  />
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" style={{ background: selectedDeclaration.net_tva_due_cents > 0 ? '#fff2f0' : '#f6ffed' }}>
                  <Statistic
                    title="Net à payer"
                    value={selectedDeclaration.net_tva_due_cents / 100}
                    precision={2}
                    suffix="DH"
                    valueStyle={{ color: selectedDeclaration.net_tva_due_cents > 0 ? '#ff4d4f' : '#52c41a' }}
                  />
                </Card>
              </Col>
            </Row>

            <Divider>Période</Divider>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Début">{new Date(selectedDeclaration.start_date).toLocaleDateString('fr-FR')}</Descriptions.Item>
              <Descriptions.Item label="Fin">{new Date(selectedDeclaration.end_date).toLocaleDateString('fr-FR')}</Descriptions.Item>
              <Descriptions.Item label="Date limite">{new Date(selectedDeclaration.due_date).toLocaleDateString('fr-FR')}</Descriptions.Item>
              <Descriptions.Item label="Créé par">{selectedDeclaration.created_by_name || '-'}</Descriptions.Item>
              {selectedDeclaration.validated_by_name && (
                <Descriptions.Item label="Validé par">{selectedDeclaration.validated_by_name}</Descriptions.Item>
              )}
              {selectedDeclaration.validated_at && (
                <Descriptions.Item label="Date validation">{new Date(selectedDeclaration.validated_at).toLocaleString('fr-FR')}</Descriptions.Item>
              )}
            </Descriptions>

            <Divider>Détail des opérations</Divider>
            <Table
              columns={detailColumns}
              dataSource={detailItems}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 20 }}
              scroll={{ y: 400 }}
            />
          </>
        )}
      </Modal>
    </div>
  );
};

export default TVADeclarations;