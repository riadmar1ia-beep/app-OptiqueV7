// frontend/src/components/Clients/PrescriptionForm.tsx
import React, { useState } from 'react';
import {
  Modal,
  Form,
  Input,
  DatePicker,
  InputNumber,
  Button,
  Space,
  message,
  Row,
  Col,
  Card,
  Divider,
  Typography,
  Alert
} from 'antd';
import { 
  PlusOutlined, 
  MedicineBoxOutlined,
  UserOutlined,
  CalendarOutlined,
  PhoneOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { clientService } from '../../services/api';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

interface PrescriptionFormProps {
  visible: boolean;
  clientId: string;
  clientName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const PrescriptionForm: React.FC<PrescriptionFormProps> = ({
  visible,
  clientId,
  clientName,
  onClose,
  onSuccess
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      // Formater les dates
      const dateOfIssue = values.date_range?.[0]?.format('YYYY-MM-DD');
      const expiryDate = values.date_range?.[1]?.format('YYYY-MM-DD');

      const prescriptionData = {
        client_id: clientId,
        doctor_name: values.doctor_name,
        doctor_phone: values.doctor_phone,
        date_of_issue: dateOfIssue,
        expiry_date: expiryDate,
        od_sphere: values.od_sphere || null,
        od_cylinder: values.od_cylinder || null,
        od_axis: values.od_axis || null,
        od_addition: values.od_addition || null,
        og_sphere: values.og_sphere || null,
        og_cylinder: values.og_cylinder || null,
        og_axis: values.og_axis || null,
        og_addition: values.og_addition || null,
        pupillary_distance: values.pupillary_distance || null,
        notes: values.notes || null
      };

      console.log('📤 Envoi prescription:', prescriptionData);

      const response = await clientService.createPrescription(prescriptionData);

      console.log('✅ Réponse:', response.data);

      message.success(`Ordonnance créée pour ${clientName}`);
      form.resetFields();
      onSuccess();
      onClose();

    } catch (error: any) {
      console.error('❌ Erreur:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Erreur lors de la création';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <MedicineBoxOutlined style={{ color: '#52c41a' }} />
          <span>Ajouter une ordonnance</span>
          <Text type="secondary" style={{ fontSize: 12 }}>
            pour {clientName}
          </Text>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={900}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          date_range: [dayjs(), dayjs().add(1, 'year')]
        }}
      >
        {/* Informations médecin */}
        <Card size="small" title="👨‍⚕️ Médecin prescripteur" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item
                name="doctor_name"
                label="Nom du médecin"
                rules={[{ required: true, message: 'Requis' }]}
              >
                <Input placeholder="Dr. Dupont" size="large" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="doctor_phone"
                label="Téléphone"
              >
                <Input placeholder="0612345678" size="large" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* Dates */}
        <Card size="small" title="📅 Période de validité" style={{ marginBottom: 16 }}>
          <Form.Item
            name="date_range"
            label="Période de validité"
            rules={[{ required: true, message: 'Requis' }]}
          >
            <RangePicker
              format="DD/MM/YYYY"
              style={{ width: '100%' }}
              size="large"
              placeholder={['Date de délivrance', "Date d'expiration"]}
            />
          </Form.Item>
        </Card>

        {/* Prescription OD */}
        <Card 
          size="small" 
          title={
            <Space>
              <Text strong style={{ color: '#1890ff' }}>👁️ Œil Droit (OD)</Text>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="od_sphere" label="Sphère (SPH)">
                <InputNumber
                  step={0.25}
                  min={-20}
                  max={20}
                  style={{ width: '100%' }}
                  placeholder="0.00"
                  size="large"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="od_cylinder" label="Cylindre (CYL)">
                <InputNumber
                  step={0.25}
                  min={-6}
                  max={0}
                  style={{ width: '100%' }}
                  placeholder="0.00"
                  size="large"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="od_axis" label="Axe (°)">
                <InputNumber
                  step={1}
                  min={0}
                  max={180}
                  style={{ width: '100%' }}
                  placeholder="0"
                  size="large"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="od_addition" label="Addition (ADD)">
                <InputNumber
                  step={0.25}
                  min={0}
                  max={3.5}
                  style={{ width: '100%' }}
                  placeholder="0.00"
                  size="large"
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* Prescription OG */}
        <Card 
          size="small" 
          title={
            <Space>
              <Text strong style={{ color: '#52c41a' }}>👁️ Œil Gauche (OG)</Text>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="og_sphere" label="Sphère (SPH)">
                <InputNumber
                  step={0.25}
                  min={-20}
                  max={20}
                  style={{ width: '100%' }}
                  placeholder="0.00"
                  size="large"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="og_cylinder" label="Cylindre (CYL)">
                <InputNumber
                  step={0.25}
                  min={-6}
                  max={0}
                  style={{ width: '100%' }}
                  placeholder="0.00"
                  size="large"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="og_axis" label="Axe (°)">
                <InputNumber
                  step={1}
                  min={0}
                  max={180}
                  style={{ width: '100%' }}
                  placeholder="0"
                  size="large"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="og_addition" label="Addition (ADD)">
                <InputNumber
                  step={0.25}
                  min={0}
                  max={3.5}
                  style={{ width: '100%' }}
                  placeholder="0.00"
                  size="large"
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* Informations complémentaires */}
        <Card size="small" title="📝 Informations complémentaires" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="pupillary_distance" label="Distance pupillaire (DP)">
                <InputNumber
                  step={0.5}
                  min={50}
                  max={80}
                  style={{ width: '100%' }}
                  placeholder="mm"
                  size="large"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              {/* Espace réservé */}
            </Col>
            <Col span={24}>
              <Form.Item name="notes" label="Notes">
                <Input.TextArea
                  rows={3}
                  placeholder="Remarques particulières..."
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Alert
          message="⚠️ Attention"
          description="Une ordonnance est valable 1 an à compter de la date de délivrance (sauf mention contraire)."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Divider />

        <div style={{ textAlign: 'right', marginTop: 16 }}>
          <Space>
            <Button onClick={onClose} size="large">
              Annuler
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleSubmit}
              loading={loading}
              size="large"
            >
              Enregistrer l'ordonnance
            </Button>
          </Space>
        </div>
      </Form>
    </Modal>
  );
};

export default PrescriptionForm;