// frontend/src/components/Invoices/CreateInvoiceModal.tsx
import React, { useState } from 'react';
import { 
  Modal,
  Form,
  Input,
  Button,
  message,
  Table,
  Space,
  Tag,
  Row,
  Col,
  Select
} from 'antd';

import { FileTextOutlined, PrinterOutlined } from '@ant-design/icons';
import { documentService } from '../../services/api';

const { Option } = Select;

interface CreateInvoiceModalProps {
  visible: boolean;
  orderData: any;
  onClose: () => void;
  onSuccess: () => void;
}

const CreateInvoiceModal: React.FC<CreateInvoiceModalProps> = ({
  visible,
  orderData,
  onClose,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  const [form] = Form.useForm();

  const handleGenerateNumber = async () => {
    try {
      const res = await documentService.getNextDocumentNumber('invoice');
      setInvoiceNumber(res.data.data.document_number);
      form.setFieldValue('invoice_number', res.data.data.document_number);
      message.success(`Numéro généré: ${res.data.data.document_number}`);
    } catch (error) {
      message.error('Erreur génération numéro');
    }
  };

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const invoiceData = {
        sales_order_id: orderData?.id,
        client_id: orderData?.client_id,
        client_name: values.client_name,
        client_email: values.client_email,
        client_phone: values.client_phone,
        items: orderData?.items?.map((item: any) => ({
          description: item.name,
          quantity: item.quantity,
          unit_price_cents: item.unit_price_cents,
          total_cents: item.total_cents,
          tax_rate: 20,
          tax_amount_cents: Math.round(item.total_cents * 0.2)
        })),
        amount_ht: orderData?.total_ht,
        amount_tva: orderData?.total_tva,
        amount_ttc: orderData?.total_ttc,
        payment_method: values.payment_method,
        notes: values.notes
      };
      
      const res = await documentService.createInvoice(invoiceData);
      message.success(res.data.message);
      onSuccess();
      onClose();
    } catch (error) {
      message.error('Erreur création facture');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <FileTextOutlined style={{ color: '#52c41a' }} />
          <span>Créer une facture</span>
          {invoiceNumber && <Tag color="blue">{invoiceNumber}</Tag>}
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item label="Numéro de facture" required>
          <Space>
            <Input 
              placeholder="Cliquez sur Générer" 
              disabled 
              value={invoiceNumber || ''}
              style={{ width: 250 }}
            />
            <Button onClick={handleGenerateNumber} type="default">
              Générer le numéro
            </Button>
          </Space>
          <div style={{ fontSize: 12, color: '#666', marginTop: 5 }}>
            ✅ Numérotation séquentielle conforme à la loi marocaine (sans trous)
          </div>
        </Form.Item>

        <Form.Item name="client_name" label="Client" initialValue={orderData?.customer_name} required>
          <Input />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="client_email" label="Email" initialValue={orderData?.customer_email}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="client_phone" label="Téléphone" initialValue={orderData?.customer_phone}>
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="payment_method" label="Mode de paiement" initialValue="cash" required>
          <Select>
            <Option value="cash">Espèces</Option>
            <Option value="card">Carte bancaire</Option>
            <Option value="transfer">Virement bancaire</Option>
            <Option value="check">Chèque</Option>
          </Select>
        </Form.Item>

        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={3} placeholder="Conditions de paiement, etc..." />
        </Form.Item>

        <Form.Item>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={onClose}>Annuler</Button>
            <Button type="primary" htmlType="submit" loading={loading} icon={<PrinterOutlined />}>
              Générer la facture
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CreateInvoiceModal;