import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  message,
  Card,
  Row,
  Col,
  Statistic,
  Modal
} from 'antd';
import {
  FilePdfOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { TVADeclarationPDF } from '../../components/accounting/TVADeclarationPDF';
import axios from 'axios';

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
  status: string;
}

const TVADeclarationsPage: React.FC = () => {
  const [declarations, setDeclarations] = useState<TVADeclaration[]>([]);
  const [loading, setLoading] = useState(false);
  const [pdfData, setPdfData] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const tenantId = 'default-shop'; // À remplacer par le vrai tenant

  // Charger les déclarations
  const loadDeclarations = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/accounting/tva-declarations', {
        headers: { 'x-tenant-id': tenantId }
      });
      setDeclarations(response.data);
    } catch (error) {
      message.error('Erreur lors du chargement des déclarations');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Préparer les données pour l'export PDF
  const preparePDFExport = async (declarationId: number) => {
    try {
      const response = await axios.get(`/api/accounting/tva-declarations/${declarationId}/export`, {
        headers: { 'x-tenant-id': tenantId }
      });
      setPdfData(response.data);
      setModalVisible(true);
    } catch (error) {
      message.error('Erreur lors de la préparation du PDF');
      console.error(error);
    }
  };

  useEffect(() => {
    loadDeclarations();
  }, []);

  const quarterNames: { [key: number]: string } = {
    1: '1er Trimestre',
    2: '2ème Trimestre',
    3: '3ème Trimestre',
    4: '4ème Trimestre'
  };

  const statusColors: { [key: string]: string } = {
    draft: 'default',
    submitted: 'processing',
    validated: 'success'
  };

  const statusLabels: { [key: string]: string } = {
    draft: 'Brouillon',
    submitted: 'Soumise',
    validated: 'Validée'
  };

  const columns = [
    {
      title: 'Période',
      dataIndex: 'quarter',
      key: 'period',
      render: (quarter: number, record: TVADeclaration) => (
        <span>{quarterNames[quarter]} {record.year}</span>
      )
    },
    {
      title: 'Date de début',
      dataIndex: 'start_date',
      key: 'start_date',
      render: (date: string) => new Date(date).toLocaleDateString('fr-FR')
    },
    {
      title: 'Date de fin',
      dataIndex: 'end_date',
      key: 'end_date',
      render: (date: string) => new Date(date).toLocaleDateString('fr-FR')
    },
    {
      title: 'Date limite',
      dataIndex: 'due_date',
      key: 'due_date',
      render: (date: string) => new Date(date).toLocaleDateString('fr-FR')
    },
    {
      title: 'Total HT',
      dataIndex: 'total_ht_cents',
      key: 'total_ht',
      render: (cents: number) => `${(cents / 100).toLocaleString('fr-FR')} DH`
    },
    {
      title: 'TVA à payer',
      dataIndex: 'net_tva_due_cents',
      key: 'net_tva',
      render: (cents: number) => (
        <span style={{ fontWeight: 'bold', color: '#DC2626' }}>
          {(cents / 100).toLocaleString('fr-FR')} DH
        </span>
      )
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={statusColors[status]} icon={status === 'validated' ? <CheckCircleOutlined /> : <ClockCircleOutlined />}>
          {statusLabels[status]}
        </Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: TVADeclaration) => (
        <Space>
          <Button
            type="primary"
            icon={<FilePdfOutlined />}
            onClick={() => preparePDFExport(record.id)}
          >
            Exporter PDF
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Statistic
              title="Total TVA à payer"
              value={declarations.reduce((sum, d) => sum + d.net_tva_due_cents, 0) / 100}
              precision={2}
              suffix="DH"
              valueStyle={{ color: '#DC2626' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Déclarations en brouillon"
              value={declarations.filter(d => d.status === 'draft').length}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Déclarations validées"
              value={declarations.filter(d => d.status === 'validated').length}
              valueStyle={{ color: '#10B981' }}
            />
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={declarations}
          loading={loading}
          rowKey="id"
          pagination={false}
        />
      </Card>

      {/* Modal d'aperçu PDF */}
      <Modal
        title="Aperçu de la déclaration TVA"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width="90%"
        style={{ top: 20 }}
        footer={[
          <Button key="cancel" onClick={() => setModalVisible(false)}>
            Fermer
          </Button>,
          pdfData && (
            <PDFDownloadLink
              key="download"
              document={<TVADeclarationPDF data={pdfData} />}
              fileName={`declaration_tva_${pdfData.declaration.year}_t${pdfData.declaration.quarter}.pdf`}
            >
              {({ loading }) => (
                <Button type="primary" loading={loading}>
                  Télécharger le PDF
                </Button>
              )}
            </PDFDownloadLink>
          )
        ]}
      >
        {pdfData && (
          <div style={{ textAlign: 'center' }}>
            <iframe
              src={pdfData.previewUrl}
              style={{ width: '100%', height: '80vh', border: 'none' }}
              title="Aperçu PDF"
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TVADeclarationsPage;