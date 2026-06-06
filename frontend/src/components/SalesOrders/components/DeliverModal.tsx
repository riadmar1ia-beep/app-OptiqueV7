import React, { useState } from 'react';
import { Modal, Form, Select, InputNumber, Button, Alert, Descriptions, message } from 'antd';
import { globalOrderService } from '../../../services/api';
import { getStatusTag } from '../utils/statusUtils';
import axios from 'axios';  // ← AJOUTER CET IMPORT

interface DeliverModalProps {
  open: boolean;
  order: any;
  onClose: () => void;
  onSuccess: () => void;
}

const DeliverModal: React.FC<DeliverModalProps> = ({ open, order, onClose, onSuccess }) => {
  const [deliverForm] = Form.useForm();
  const [loading, setLoading] = useState(false);

  if (!order) return null;

  const totalTTC = (order.total_ttc_cents || 0) / 100;

  // ✅ AJOUTER LA FONCTION D'IMPRESSION
  const printInvoice = async (invoiceId: string) => {
    try {
      const response = await axios.get(`/api/documents/invoice/${invoiceId}`, {
        responseType: 'blob',
        headers: { 'X-Tenant-Id': localStorage.getItem('tenantId') || 'default-shop' }
      });
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Erreur génération facture:', error);
      message.warning('La facture sera disponible dans la liste des commandes');
    }
  };

  const handleDeliver = async (values: any) => {
    const deposit = values.deposit_cents || 0;
    
    if (deposit > totalTTC) {
      message.error(`L'acompte ne peut pas dépasser le total de ${totalTTC} DH`);
      return;
    }
    
    setLoading(true);
    try {
      const response = await globalOrderService.deliver(order.id, {
        payment_method: values.payment_method,
        deposit_cents: deposit * 100
      });
      
      message.success(response.data.message);
      
      // ✅ AJOUTER ICI : IMPRESSION DE LA FACTURE FINALE
      if (response.data.data?.invoice?.id) {
        await printInvoice(response.data.data.invoice.id);
      }
      
      deliverForm.resetFields();
      onSuccess();
      onClose();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Erreur lors de la livraison');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="📦 Livraison et facturation"
      open={open}
      onCancel={() => {
        deliverForm.resetFields();
        onClose();
      }}
      footer={null}
      width={500}
    >
      <Alert 
        title={`Commande: ${order.order_number}`} 
        description={`Client: ${order.customer_name}`}
        type="info" 
        showIcon 
        style={{ marginBottom: 16 }}
      />
      
      <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Total TTC">
          <span style={{ color: '#1890ff', fontSize: 18, fontWeight: 'bold' }}>
            {totalTTC.toFixed(2)} DH
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="Statut actuel">
          {getStatusTag(order.status)}
        </Descriptions.Item>
      </Descriptions>
      
      <Form form={deliverForm} layout="vertical" onFinish={handleDeliver}>
        <Form.Item 
          name="payment_method" 
          label="Mode de paiement" 
          rules={[{ required: true }]}
          initialValue="cash"
        >
          <Select size="large">
            <Select.Option value="cash">💰 Espèces</Select.Option>
            <Select.Option value="card">💳 Carte bancaire</Select.Option>
            <Select.Option value="transfer">🏦 Virement bancaire</Select.Option>
            <Select.Option value="check">📝 Chèque</Select.Option>
          </Select>
        </Form.Item>
        
        <Form.Item 
          name="deposit_cents" 
          label={`Acompte (DH) - Total: ${totalTTC.toFixed(2)} DH`}
          initialValue={totalTTC}
          rules={[
            { required: true, message: 'Veuillez saisir un montant' },
            {
              validator: (_: any, value: number) => {
                if (value >= 0 && value <= totalTTC) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error(`L'acompte ne peut pas dépasser ${totalTTC} DH`));
              }
            }
          ]}
        >
          <InputNumber 
            min={0} 
            max={totalTTC}
            step={10} 
            style={{ width: '100%' }} 
            size="large"
            formatter={value => `${value} DH`}
            parser={(value?: string) => Number(value?.replace('DH', '') || 0)}
          />
        </Form.Item>
        
        <Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            ✅ Valider la livraison et générer la facture
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default DeliverModal;