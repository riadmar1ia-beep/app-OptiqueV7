// frontend/src/components/Clients/PrescriptionEditForm.tsx
import React, { useState, useEffect } from 'react';
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
  Alert,
  Spin
} from 'antd';
import { 
  EditOutlined, 
  SaveOutlined,
  CloseOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { clientService } from '../../services/api';
import api from '../../services/api';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface PrescriptionEditFormProps {
  visible: boolean;
  prescriptionId: string;
  clientName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const PrescriptionEditForm: React.FC<PrescriptionEditFormProps> = ({
  visible,
  prescriptionId,
  clientName,
  onClose,
  onSuccess
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Charger les données de la prescription
  useEffect(() => {
    if (visible && prescriptionId) {
      loadPrescription();
    }
  }, [visible, prescriptionId]);

  const loadPrescription = async () => {
    setInitialLoading(true);
    try {
      // Utiliser l'API directe car clientService.getById ne fonctionne pas pour prescriptions
      const token = localStorage.getItem('accessToken');
      const tenantId = localStorage.getItem('tenantId') || 'default-shop';
      
      const response = await fetch(`http://localhost:3001/api/prescriptions/${prescriptionId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Tenant-Id': tenantId,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Erreur chargement');
      }
      
      const result = await response.json();
      const data = result.data;
      
      form.setFieldsValue({
        doctor_name: data.doctor_name,
        doctor_phone: data.doctor_phone,
        date_range: [
          data.date_of_issue ? dayjs(data.date_of_issue) : null,
          data.expiry_date ? dayjs(data.expiry_date) : null
        ],
        od_sphere: data.od_sphere,
        od_cylinder: data.od_cylinder,
        od_axis: data.od_axis,
        od_addition: data.od_addition,
        og_sphere: data.og_sphere,
        og_cylinder: data.og_cylinder,
        og_axis: data.og_axis,
        og_addition: data.og_addition,
        pupillary_distance: data.pupillary_distance,
        notes: data.notes
      });
    } catch (error: any) {
      console.error('❌ Erreur chargement:', error);
      message.error('Erreur lors du chargement de la prescription');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const dateOfIssue = values.date_range?.[0]?.format('YYYY-MM-DD');
      const expiryDate = values.date_range?.[1]?.format('YYYY-MM-DD');

      const prescriptionData = {
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

      // Utiliser clientService.updatePrescription qui existe déjà dans api.ts
      await clientService.updatePrescription(prescriptionId, prescriptionData);

      message.success(`Ordonnance modifiée pour ${clientName}`);
      form.resetFields();
      onSuccess();
      onClose();

    } catch (error: any) {
      console.error('❌ Erreur:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Erreur lors de la modification';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <EditOutlined style={{ color: '#1890ff' }} />
          <span>Modifier l'ordonnance</span>
          <Text type="secondary" style={{ fontSize: 12 }}>
            pour {clientName}
          </Text>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={900}
      destroyOnClose
    >
      {initialLoading ? (
        <div style={{ textAlign: 'center', padding: 50 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Form form={form} layout="vertical">
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
                <Form.Item name="doctor_phone" label="Téléphone">
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
          <Card size="small" title={<Space><Text strong style={{ color: '#1890ff' }}>👁️ Œil Droit (OD)</Text></Space>} style={{ marginBottom: 16 }}>
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
                    max={6} 
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
          <Card size="small" title={<Space><Text strong style={{ color: '#52c41a' }}>👁️ Œil Gauche (OG)</Text></Space>} style={{ marginBottom: 16 }}>
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
                    max={6} 
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
              <Col span={24}>
                <Form.Item name="notes" label="Notes">
                  <Input.TextArea rows={3} placeholder="Remarques particulières..." />
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
              <Button onClick={onClose} size="large" icon={<CloseOutlined />}>
                Annuler
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSubmit}
                loading={loading}
                size="large"
              >
                Enregistrer les modifications
              </Button>
            </Space>
          </div>
        </Form>
      )}
    </Modal>
  );
};

export default PrescriptionEditForm;