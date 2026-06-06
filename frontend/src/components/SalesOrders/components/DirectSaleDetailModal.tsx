import React, { useState, useEffect } from 'react';
import { Modal, Descriptions, Divider, Table, Typography, Button, Space, message } from 'antd';
import api from '../../../services/api';
import PrintButton from '../../Documents/PrintButton';

const { Text } = Typography;

interface DirectSaleDetailModalProps {
  open: boolean;
  sale: any;
  onClose: () => void;
}

const DirectSaleDetailModal: React.FC<DirectSaleDetailModalProps> = ({ open, sale, onClose }) => {
  const [directSaleDetail, setDirectSaleDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && sale) {
      fetchDetail();
    }
  }, [open, sale]);

  const fetchDetail = async () => {
    console.log('🔍 SALE COMPLET:', sale);
    
    // 🔧 CORRECTION : Utiliser invoice_number d'abord, puis id
    const invoiceNumber = sale?.invoice_number;
    const saleId = sale?.id;
    
    console.log('🔍 invoice_number:', invoiceNumber);
    console.log('🔍 sale_id:', saleId);
    
    if (!invoiceNumber && !saleId) {
      message.error('Identifiant de facture manquant');
      return;
    }

    setLoading(true);
    try {
      let url;
      // Priorité à la recherche par numéro de facture
      if (invoiceNumber) {
        url = `/sales-invoices/by-number/${encodeURIComponent(invoiceNumber)}`;
        console.log('🔍 Recherche par numéro de facture:', url);
      } else {
        url = `/sales-invoices/${saleId}`;
        console.log('🔍 Recherche par ID:', url);
      }
      
      const response = await api.get(url);

      if (response.data.success && response.data.data) {
        const apiData = response.data.data;
        
        console.log('✅ API Data:', apiData);
        
        // Récupérer les items si nécessaire
        let itemsData = apiData.items || [];
        if (!itemsData.length && apiData.id) {
          const itemsResponse = await api.get(`/sales-invoice-items?invoice_id=${apiData.id}`);
          if (itemsResponse.data.success) {
            itemsData = itemsResponse.data.data;
          }
        }
        
        const mergedDetail = {
          ...apiData,
          items: itemsData,
          customer_name: apiData.customer_name || 
                         apiData.client_name || 
                         (apiData.client ? `${apiData.client.first_name || ''} ${apiData.client.last_name || ''}`.trim() : null) ||
                         sale?.customer_name || 
                         'Client comptoir',
          customer_phone: apiData.customer_phone || 
                          apiData.client_phone || 
                          apiData.client?.phone || 
                          sale?.customer_phone || 
                          '',
          customer_email: apiData.customer_email || 
                          apiData.client_email || 
                          apiData.client?.email || 
                          sale?.customer_email || 
                          '',
        };

        console.log('✅ Merged Detail:', mergedDetail);
        setDirectSaleDetail(mergedDetail);
      } else {
        message.error('Données de facture invalides');
      }
    } catch (error: any) {
      console.error('❌ Erreur:', error);
      if (error.response?.status === 404) {
        message.error('Facture non trouvée');
      } else {
        message.error('Erreur chargement détails');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!sale) return null;

  return (
    <Modal
      title={
        <Space>
          🧾 Détail de la vente directe
          {directSaleDetail && (
            <PrintButton
              type="invoice"
              data={{
                number: directSaleDetail.invoice_number,
                date: directSaleDetail.invoice_date
                  ? new Date(directSaleDetail.invoice_date).toLocaleDateString('fr-FR')
                  : '',
                client_name: directSaleDetail.customer_name || directSaleDetail.client_name || '',
                client_phone: directSaleDetail.customer_phone || directSaleDetail.client_phone || '',
                client_address: '',
                client_email: '',
                items: (directSaleDetail.items || []).map((item: any) => ({
                  reference: item.reference || item.product_reference || 'REF',
                  description: item.description || '',
                  treatments: [],
                  quantity: item.quantity || 1,
                  unit_price: (item.unit_price_cents || 0) / 100,
                  total: (item.total_cents || 0) / 100
                })),
                subtotal: (directSaleDetail.amount_ht_cents || 0) / 100,
                tax_rate: 20,
                tax_amount: (directSaleDetail.tax_amount_cents || 0) / 100,
                total: (directSaleDetail.amount_ttc_cents || 0) / 100,
                payment_method: directSaleDetail.payment_method || 'Espèces',
                notes: ''
              }}
              buttonText="Facture PDF"
              buttonType="default"
            />
          )}
        </Space>
      }
      open={open}
      onCancel={() => {
        setDirectSaleDetail(null);
        onClose();
      }}
      footer={<Button onClick={onClose}>Fermer</Button>}
      width={700}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Text type="secondary">Chargement des détails...</Text>
        </div>
      ) : directSaleDetail ? (
        <div>
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="N° Facture" span={2}>
              <Text strong>{directSaleDetail.invoice_number || '-'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Date">
              {directSaleDetail.invoice_date ? new Date(directSaleDetail.invoice_date).toLocaleDateString() : 
               directSaleDetail.created_at ? new Date(directSaleDetail.created_at).toLocaleDateString() : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Mode de paiement">
              {directSaleDetail.payment_method || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Total HT">
              {((directSaleDetail.amount_ht_cents || 0) / 100).toFixed(2)} DH
            </Descriptions.Item>
            <Descriptions.Item label="TVA">
              {((directSaleDetail.tax_amount_cents || 0) / 100).toFixed(2)} DH
            </Descriptions.Item>
            <Descriptions.Item label="Total TTC" span={2}>
              <Text strong style={{ color: '#1890ff', fontSize: 18 }}>
                {((directSaleDetail.amount_ttc_cents || 0) / 100).toFixed(2)} DH
              </Text>
            </Descriptions.Item>
          </Descriptions>
          
          <Divider>Articles vendus</Divider>
          
          <Table
            dataSource={directSaleDetail.items || []}
            rowKey="id"
            pagination={false}
            size="small"
            columns={[
              { title: 'Description', dataIndex: 'description', key: 'description' },
              { title: 'Qté', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'center' as const },
              { 
                title: 'Prix unitaire', 
                key: 'unit_price', 
                width: 120, 
                align: 'right' as const,
                render: (_: any, r: any) => `${((r.unit_price_cents || 0) / 100).toFixed(2)} DH`
              },
              { 
                title: 'Total HT', 
                key: 'total', 
                width: 120, 
                align: 'right' as const,
                render: (_: any, r: any) => `${((r.total_cents || 0) / 100).toFixed(2)} DH`
              },
              { 
                title: 'TVA', 
                dataIndex: 'tax_rate', 
                key: 'tax_rate', 
                width: 80, 
                align: 'center' as const,
                render: (v: number) => `${v || 20}%`
              }
            ]}
          />
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Text type="secondary">Aucune donnée disponible</Text>
        </div>
      )}
    </Modal>
  );
};

export default DirectSaleDetailModal;