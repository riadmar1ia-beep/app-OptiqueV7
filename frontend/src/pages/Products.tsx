import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, InputNumber, Popconfirm, message, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { productService } from '../services/api';
import { Product } from '../types';

const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const response = await productService.getAll();
      setProducts(response.data.data);
    } catch (error) {
      message.error('Erreur lors du chargement des produits');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values: any) => {
    try {
      const productData = {
        reference: values.reference,
        name: values.name,
        price_cents: values.price_cents * 100,
        
        tax_rate: values.tax_rate || 20,
        min_stock: values.min_stock || 0
      };

      if (editingProduct) {
        await productService.update(editingProduct.id, productData);
        message.success('Produit modifiÃ© avec succÃ¨s');
      } else {
        await productService.create(productData);
        message.success('Produit crÃ©Ã© avec succÃ¨s');
      }
      setModalVisible(false);
      form.resetFields();
      fetchProducts();
    } catch (error) {
      message.error('Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await productService.delete(id);
      message.success('Produit supprimÃ© avec succÃ¨s');
      fetchProducts();
    } catch (error) {
      message.error('Erreur lors de la suppression');
    }
  };

  const columns = [
    { title: 'RÃ©fÃ©rence', dataIndex: 'reference', key: 'reference' },
    { title: 'Nom', dataIndex: 'name', key: 'name' },
    { 
      title: 'Prix (â‚¬)', 
      dataIndex: 'price_cents', 
      key: 'price_cents',
      render: (price: number) => (price / 100).toFixed(2)
    },
    { title: 'Stock', dataIndex: 'stock', key: 'stock' },
    { title: 'TVA (%)', dataIndex: 'tax_rate', key: 'tax_rate' },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Product) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              setEditingProduct(record);
              form.setFieldsValue({
                ...record,
                price_cents: record.price_cents / 100,
              });
              setModalVisible(true);
            }}
          />
          <Popconfirm
            title="Supprimer ce produit ?"
            onConfirm={() => handleDelete(record.id)}
            okText="Oui"
            cancelText="Non"
          >
            <Button icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title="Gestion des produits"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingProduct(null);
              form.resetFields();
              setModalVisible(true);
            }}
          >
            Nouveau produit
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={products}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingProduct ? "Modifier le produit" : "Ajouter un produit"}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="reference" label="RÃ©fÃ©rence" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="Nom" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="price_cents" label="Prix (â‚¬)" rules={[{ required: true }]}>
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          
          <Form.Item name="tax_rate" label="TVA (%)">
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="min_stock" label="Stock minimum">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              {editingProduct ? "Modifier" : "CrÃ©er"}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Products;