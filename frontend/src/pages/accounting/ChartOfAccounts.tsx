import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Tag, Input, Modal, Form, message, Tree } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { accountingService } from '../../services/api';

interface Account {
  id: string;
  account_number: string;
  account_name: string;
  class: number;
  type: string;
  parent_id: string | null;
  is_active: boolean;
}

const ChartOfAccounts: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
  setLoading(true);

  try {
    const response = await accountingService.getChartOfAccounts();

    console.log(response.data);

    setAccounts(response.data.data || []);
  } catch (error) {
    console.error(error);
    message.error('Erreur lors du chargement');
  } finally {
    setLoading(false);
  }
};

  const columns = [
    {
      title: 'Numéro de compte',
      dataIndex: 'account_number',
      key: 'account_number',
      render: (text: string) => <Tag color="blue">{text}</Tag>
    },
    {
      title: 'Libellé',
      dataIndex: 'account_name',
      key: 'account_name'
    },
    {
      title: 'Classe',
      dataIndex: 'class',
      key: 'class',
      render: (value: number) => <Tag>Classe {value}</Tag>
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type'
    },
    {
      title: 'Statut',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'red'}>{active ? 'Actif' : 'Inactif'}</Tag>
      )
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>📚 Plan comptable (Norme marocaine)</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
          Nouveau compte
        </Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={accounts}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title={editingAccount ? 'Modifier le compte' : 'Nouveau compte'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingAccount(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={async (values) => {
          try {
            if (editingAccount) {
              await accountingService.updateChartAccount(
  editingAccount.id,
  values
);
              message.success('Compte modifié');
            } else {
              await accountingService.createChartAccount(values);
              message.success('Compte créé');
            }
            setModalVisible(false);
            form.resetFields();
            fetchAccounts();
          } catch (error) {
            message.error('Erreur');
          }
        }}>
          <Form.Item name="account_number" label="Numéro de compte" rules={[{ required: true }]}>
            <Input placeholder="Ex: 411000" />
          </Form.Item>
          <Form.Item name="account_name" label="Libellé" rules={[{ required: true }]}>
            <Input placeholder="Ex: Clients" />
          </Form.Item>
          <Form.Item name="class" label="Classe" rules={[{ required: true }]}>
            <Input type="number" placeholder="1 à 7" />
          </Form.Item>
          <Form.Item name="type" label="Type">
            <Input placeholder="ACTIF, PASSIF, CHARGE, PRODUIT" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ChartOfAccounts;