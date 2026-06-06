// src/App.tsx
import React, { useState, useEffect } from 'react';
import { Layout, Menu, Avatar, Dropdown, Space, Badge, message } from 'antd';
import {
  DashboardOutlined,
  ShoppingOutlined,
  DollarOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  UserOutlined,
  ShopOutlined,
  FileTextOutlined,
  TruckOutlined,
  PlusCircleOutlined,
  BankOutlined,
  LogoutOutlined,
  UserOutlined as UserIcon,  
  SafetyOutlined,
  ApiOutlined,
  BookOutlined,
  AuditOutlined
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import Dashboard from './pages/Dashboard';
import Cashier from './components/Cashier/Cashier';
import SupplierOrders from './components/Supplier/SupplierOrders';
import SupplierReception from './pages/SupplierReception';
import PricingGrid from './components/Pricing/PricingGrid';
import SuppliersList from './components/Suppliers/SuppliersList';
import ClientsList from './components/Clients/ClientsList';
import Products from './components/Products/Products';
import SalesOrders from './components/SalesOrders/SalesOrders';
import PurchaseOrders from './components/PurchaseOrders/PurchaseOrders';
import CompanySettings from './components/Settings/CompanySettings';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { statsService } from './services/api';
import './App.css';
import PermissionsManager from './components/Settings/PermissionsManager';
import AlertsPanel from './components/AlertsPanel';
import ChartOfAccounts from './pages/accounting/ChartOfAccounts';
import { TestV2Orders } from './components/TestV2Orders';
import { OrderDetailV2 } from './components/SalesOrders/OrderDetailV2';
import { DashboardV2 } from './components/Dashboard/DashboardV2';

const { Header, Content, Sider } = Layout;

type MenuItem = Required<MenuProps>['items'][number];

function getItem(
  label: React.ReactNode,
  key: React.Key,
  icon?: React.ReactNode,
  children?: MenuItem[],
): MenuItem {
  return {
    key,
    icon,
    children,
    label,
  } as MenuItem;
}

// Menu de base (toutes les entrées)
const allMenuItems: MenuItem[] = [
  getItem('Tableau de bord', 'dashboard', <DashboardOutlined />),
  { type: 'divider' },
  getItem('Commandes Client', 'sales-orders', <ShoppingCartOutlined />),
  getItem('Commandes Fournisseur', 'supplier', <TruckOutlined/>),
  getItem('Réception Fournisseur', 'reception', <SafetyOutlined/>),
  getItem('Achats Stock Magasin', 'purchase-orders', <PlusCircleOutlined />),
  { type: 'divider' },
  getItem('Produits', 'products', <ShoppingOutlined />),
  getItem('Ventes directes', 'cashier', <FileTextOutlined />),
  { type: 'divider' },
  getItem('Clients', 'clients', <TeamOutlined />),
  getItem('Fournisseurs', 'suppliers', <ShopOutlined />),
  { type: 'divider' },
  getItem('Grille prix verres', 'pricing', <DollarOutlined />),
  getItem('Paramètres', 'settings', <SettingOutlined />, [
    getItem('Paramètres société', 'company-settings', <BankOutlined />),
    getItem('Paramètres généraux', 'general-settings', <SettingOutlined />),
    getItem('Permissions', 'permissions', <SafetyOutlined />),
  ]),
  // ============================================
  // COMPTABILITÉ - UNIQUEMENT DASHBOARD V2
  // ============================================
  getItem('Comptabilité', 'accounting', <DollarOutlined />, [
    getItem('Dashboard V2', 'dashboard-v2', <DashboardOutlined />),
    getItem('Plan comptable', 'chart-of-accounts', <BookOutlined />),
    getItem('Test API V2', 'test-v2', <ApiOutlined />),
  ]),
];

// Composant interne qui utilise useAuth (doit être DANS AuthProvider)
function AppContent() {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedKey, setSelectedKey] = useState('dashboard');
  const [stats, setStats] = useState<any>(null);
  const { user, logout, isAuthenticated, hasRole, hasPermission } = useAuth();
  const [tenantId, setTenantId] = useState(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        return userData.tenantId || localStorage.getItem('tenantId') || 'default-shop';
      } catch {
        return localStorage.getItem('tenantId') || 'default-shop';
      }
    }
    return localStorage.getItem('tenantId') || 'default-shop';
  });

  useEffect(() => {
    if (isAuthenticated && user) {
      fetchStats();
      const interval = setInterval(fetchStats, 30000);
      return () => clearInterval(interval);
    }
  }, [tenantId, isAuthenticated, user]);

  const fetchStats = async () => {
    if (!isAuthenticated) return;
    try {
      const response = await statsService.getStats();
      setStats(response.data.data);
    } catch (error) {
      console.error('Erreur stats:', error);
    }
  };

  const handleTenantChange = (newTenantId: string) => {
    setTenantId(newTenantId);
    localStorage.setItem('tenantId', newTenantId);
    message.info(`Magasin changé: ${newTenantId}`);
    window.location.reload();
  };

  const handleLogout = async () => {
    await logout();
    message.success('Déconnecté avec succès');
  };

  // Filtrer le menu selon le rôle et les permissions
  const getFilteredMenu = (): MenuItem[] => {
    const role = user?.role || 'cashier';
    
    if (role === 'admin') {
      return allMenuItems;
    }
    
    if (role === 'optician') {
      return allMenuItems.filter(item => {
        const key = (item as any)?.key;
        if (key === 'settings') return false;
        return true;
      });
    }
    
    const allowedKeys = ['dashboard', 'cashier', 'clients', 'products'];
    return allMenuItems.filter(item => {
      const key = (item as any)?.key;
      if (item?.type === 'divider') return true;
      return allowedKeys.includes(key);
    });
  };

  const renderContent = () => {
    switch (selectedKey) {
      case 'dashboard':
        return <Dashboard stats={stats} />;
      case 'cashier':
        if (!hasPermission('sales.read')) {
          return <div>Accès non autorisé</div>;
        }
        return <Cashier />;
      case 'reception':
        if (!hasPermission('orders.read')) {
          return <div>Accès non autorisé</div>;
        }
        return <SupplierReception />;
      case 'supplier':
        if (!hasPermission('orders.read')) {
          return <div>Accès non autorisé</div>;
        }
        return <SupplierOrders />;
      case 'suppliers':
        if (!hasPermission('suppliers.read')) {
          return <div>Accès non autorisé</div>;
        }
        return <SuppliersList />;
      case 'pricing':
        if (!hasPermission('pricing.read')) {
          return <div>Accès non autorisé</div>;
        }
        return <PricingGrid />;
      case 'clients':
        if (!hasPermission('clients.read')) {
          return <div>Accès non autorisé</div>;
        }
        return <ClientsList />;
      case 'products':
        if (!hasPermission('products.read')) {
          return <div>Accès non autorisé</div>;
        }
        return <Products />;
      case 'sales-orders':
        if (!hasPermission('orders.read')) {
          return <div>Accès non autorisé</div>;
        }
        return <SalesOrders />;
      case 'purchase-orders':
        if (!hasPermission('orders.read')) {
          return <div>Accès non autorisé</div>;
        }
        return <PurchaseOrders />;
      case 'company-settings':
        if (!hasPermission('settings.read')) {
          return <div>Accès non autorisé</div>;
        }
        return <CompanySettings />;
      case 'permissions':
        if (!hasPermission('settings.write')) {
          return <div>Accès non autorisé</div>;
        }
        return <PermissionsManager />;
      case 'chart-of-accounts':
        if (!hasPermission('accounting.read')) {
          return <div>Accès non autorisé</div>;
        }
        return <ChartOfAccounts />;
      case 'test-v2':
        return <TestV2Orders />;
      case 'order-detail-v2':
        return <OrderDetailV2 />;
      case 'dashboard-v2':
        return <DashboardV2 />;
      default:
        return <Dashboard stats={stats} />;
    }
  };

  const userMenuItems: MenuProps['items'] = [
    { 
      key: 'profile', 
      label: (
        <Space>
          <UserIcon />
          <span>Mon profil</span>
        </Space>
      )
    },
    { 
      key: 'logout', 
      label: (
        <Space>
          <LogoutOutlined />
          <span>Déconnexion</span>
        </Space>
      ),
      onClick: handleLogout
    },
  ];

  const getUserInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    return user?.email?.[0]?.toUpperCase() || 'U';
  };

  const filteredMenu = getFilteredMenu();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="dark">
        <div style={{ 
          height: 32, 
          margin: 16, 
          color: 'white', 
          textAlign: 'center', 
          fontSize: collapsed ? 12 : 16, 
          fontWeight: 'bold' 
        }}>
          {collapsed ? 'OV7' : 'Optique V7'}
        </div>
        <Menu
          theme="dark"
          selectedKeys={[selectedKey]}
          mode="inline"
          items={filteredMenu}
          onClick={({ key }) => setSelectedKey(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ 
          padding: '0 24px', 
          background: '#fff', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          <div>
            <span style={{ marginRight: 16 }}>🏪 Optique V7 - ERP Multi-tenant</span>
            {user && (
              <Badge 
                count={user.role === 'admin' ? 'Admin' : user.role === 'optician' ? 'Opticien' : 'Caissier'} 
                style={{ backgroundColor: user.role === 'admin' ? '#52c41a' : user.role === 'optician' ? '#1890ff' : '#faad14' }} 
              />
            )}
          </div>
          <Space>
            <span style={{ color: '#666' }}>Magasin:</span>
            <input
              type="text"
              value={tenantId}
              onChange={(e) => handleTenantChange(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d9d9d9', width: 150 }}
            />
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar style={{ backgroundColor: '#1890ff' }}>
                  {getUserInitials()}
                </Avatar>
                <span style={{ color: '#333' }}>
                  {user?.firstName || user?.email?.split('@')[0] || 'Utilisateur'}
                </span>
              </div>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ margin: '16px', padding: 24, background: '#fff', borderRadius: 8, minHeight: 280 }}>
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
  );
}

// Composant principal qui gère l'authentification
function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

// Composant séparé pour la logique de routing
function AppRouter() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        Chargement...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return <AppContent />;
}

export default App;