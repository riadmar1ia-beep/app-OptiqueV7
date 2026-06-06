// src/pages/Login.tsx
import React, { useState } from 'react';
import { Form, Input, Button, Card, message, Typography, Alert } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const { Title } = Typography;

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.email, values.password);
      message.success('Connexion réussie');
      navigate('/');
    } catch (error: any) {
      console.error(error);
      message.error(error.response?.data?.error || 'Email ou mot de passe incorrect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <Card style={{ width: 400, borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={2} style={{ color: '#1890ff', marginBottom: 8 }}>Optique V7</Title>
          <Typography.Text type="secondary">ERP de gestion optique</Typography.Text>
        </div>
        
        <Alert
          message="Compte de démonstration"
          description="Email: admin@optiquev7.com | Mot de passe: Admin123!"
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />
        
        <Form name="login" onFinish={onFinish} size="large">
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Email requis' },
              { type: 'email', message: 'Email invalide' }
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="Email" />
          </Form.Item>
          
          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Mot de passe requis' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Mot de passe" />
          </Form.Item>
          
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block icon={<LoginOutlined />}>
              Se connecter
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Login;