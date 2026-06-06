import React, { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Space,
  Popconfirm, message, Card, Tabs, Descriptions
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined
} from '@ant-design/icons';
import { supplierService } from '../../services/api';
import PhoneInput from '../common/PhoneInput';

const { TabPane } = Tabs;

interface Supplier {
  id: string;
  name: string;
  commercial_name?: string;
  ice?: string;
  if?: string;
  rc?: string;
  cnss?: string;
  patente?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  phone: string;
  fax?: string;
  email?: string;
  website?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_rib?: string;
  bank_iban?: string;
  notes?: string;
  has_orders?: boolean;
}

const SuppliersList: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const res = await supplierService.getAll();
      setSuppliers(res.data.data);
    } catch {
      message.error('Erreur chargement fournisseurs');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values: any) => {
    try {
      if (editingSupplier) {
        await supplierService.update(editingSupplier.id, values);
        message.success('Fournisseur modifié');
      } else {
        await supplierService.create(values);
        message.success('Fournisseur ajouté');
      }
      setModalVisible(false);
      form.resetFields();
      fetchSuppliers();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async (id: string, hasOrders: boolean = false) => {
    if (hasOrders) {
      message.error('❌ Suppression impossible : ce fournisseur a des commandes associées');
      return;
    }
    
    Modal.confirm({
      title: 'Confirmation',
      content: 'Supprimer ce fournisseur ?',
      onOk: async () => {
        try {
          await supplierService.delete(id);
          message.success('Fournisseur supprimé avec succès');
          fetchSuppliers();
        } catch (error: any) {
          message.error(error.response?.data?.error || 'Erreur lors de la suppression');
        }
      }
    });
  };

  const columns = [
    { title: 'Nom', dataIndex: 'name', key: 'name' },
    { title: 'ICE', dataIndex: 'ice', key: 'ice', render: (v: string) => v || '-' },
    { title: 'Téléphone', dataIndex: 'phone', key: 'phone' },
    { title: 'Email', dataIndex: 'email', key: 'email', render: (v: string) => v || '-' },
    { title: 'Ville', dataIndex: 'city', key: 'city', render: (v: string) => v || '-' },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Supplier) => (
        <Space>
          <Button icon={<EyeOutlined />} onClick={() => {
            setSelectedSupplier(record);
            setDetailVisible(true);
          }} />
          <Button icon={<EditOutlined />} onClick={() => {
            setEditingSupplier(record);
            form.setFieldsValue(record);
            setModalVisible(true);
          }} />
          <Popconfirm 
            title="Supprimer ce fournisseur ?" 
            onConfirm={() => handleDelete(record.id, record.has_orders)}
            okText="Oui"
            cancelText="Non"
          >
            <Button icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Card
        title="Fournisseurs"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => {
            setEditingSupplier(null);
            form.resetFields();
            setModalVisible(true);
          }}>
            Nouveau fournisseur
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={suppliers}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingSupplier ? "Modifier le fournisseur" : "Nouveau fournisseur"}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Tabs defaultActiveKey="1">
            <TabPane tab="Identité" key="1">
              <Form.Item name="name" label="Nom" rules={[{ required: true, message: 'Nom obligatoire' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="commercial_name" label="Nom commercial">
                <Input />
              </Form.Item>
              <Form.Item name="ice" label="ICE (15 chiffres)">
                <Input maxLength={15} />
              </Form.Item>
              <Form.Item name="if" label="IF">
                <Input />
              </Form.Item>
              <Form.Item name="rc" label="RC">
                <Input />
              </Form.Item>
              <Form.Item name="cnss" label="CNSS">
                <Input />
              </Form.Item>
              <Form.Item name="patente" label="Patente">
                <Input />
              </Form.Item>
            </TabPane>

            <TabPane tab="Coordonnées" key="2">
              <Form.Item name="address" label="Adresse">
                <Input.TextArea rows={2} />
              </Form.Item>
              <Form.Item name="city" label="Ville">
                <Input />
              </Form.Item>
              <Form.Item name="postal_code" label="Code postal">
                <Input maxLength={5} />
              </Form.Item>
              <Form.Item name="phone" label="Téléphone" rules={[{ required: true, message: 'Téléphone obligatoire' }]}>
                <PhoneInput />
              </Form.Item>
              <Form.Item name="fax" label="Fax">
                <Input />
              </Form.Item>
              <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email invalide' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="website" label="Site web">
                <Input />
              </Form.Item>
            </TabPane>

            <TabPane tab="Contact" key="3">
              <Form.Item name="contact_name" label="Nom du contact">
                <Input />
              </Form.Item>
              <Form.Item name="contact_phone" label="Téléphone du contact">
                <PhoneInput />
              </Form.Item>
              <Form.Item name="contact_email" label="Email du contact" rules={[{ type: 'email', message: 'Email invalide' }]}>
                <Input />
              </Form.Item>
            </TabPane>

            <TabPane tab="Banque" key="4">
              <Form.Item name="bank_name" label="Banque">
                <Input />
              </Form.Item>
              <Form.Item name="bank_account_number" label="Numéro de compte">
                <Input />
              </Form.Item>
              <Form.Item name="bank_rib" label="RIB (24 chiffres)">
                <Input maxLength={24} />
              </Form.Item>
              <Form.Item name="bank_iban" label="IBAN (MA + 26 chiffres)">
                <Input />
              </Form.Item>
            </TabPane>

            <TabPane tab="Notes" key="5">
              <Form.Item name="notes" label="Notes">
                <Input.TextArea rows={4} />
              </Form.Item>
            </TabPane>
          </Tabs>

          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              {editingSupplier ? "Modifier" : "Créer"}
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Détails du fournisseur"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={600}
      >
        {selectedSupplier && (
          <Descriptions bordered column={2}>
            <Descriptions.Item label="Nom">{selectedSupplier.name}</Descriptions.Item>
            <Descriptions.Item label="ICE">{selectedSupplier.ice || '-'}</Descriptions.Item>
            <Descriptions.Item label="Téléphone">{selectedSupplier.phone}</Descriptions.Item>
            <Descriptions.Item label="Email">{selectedSupplier.email || '-'}</Descriptions.Item>
            <Descriptions.Item label="Adresse">{selectedSupplier.address || '-'}</Descriptions.Item>
            <Descriptions.Item label="Ville">{selectedSupplier.city || '-'}</Descriptions.Item>
            <Descriptions.Item label="Contact">{selectedSupplier.contact_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="Banque">{selectedSupplier.bank_name || '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default SuppliersList;