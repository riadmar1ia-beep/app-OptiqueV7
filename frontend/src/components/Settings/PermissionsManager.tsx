import React, { useState, useEffect } from 'react';
import { Table, Card, Button, message, Checkbox, Spin, Space, Tag } from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../../services/api';

interface Permission {
  id: number;
  resource: string;
  action: string;
  description: string;
}

interface Role {
  id: number;
  name: string;
  description: string;
}

const PermissionsManager: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<number, number[]>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRole, setSelectedRole] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        api.get('/permissions/roles'),
        api.get('/permissions')
      ]);
      setRoles(rolesRes.data.data);
      setPermissions(permsRes.data.data);
      
      // Charger les permissions pour chaque rôle
      const permsMap: Record<number, number[]> = {};
      for (const role of rolesRes.data.data) {
        const rolePermsRes = await api.get(`/permissions/roles/${role.id}`);
        permsMap[role.id] = rolePermsRes.data.data.map((p: Permission) => p.id);
      }
      setRolePermissions(permsMap);
      if (rolesRes.data.data.length > 0) {
        setSelectedRole(rolesRes.data.data[0].id);
      }
    } catch (error) {
      message.error('Erreur chargement des permissions');
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionChange = (permissionId: number, checked: boolean) => {
    if (!selectedRole) return;
    
    setRolePermissions(prev => ({
      ...prev,
      [selectedRole]: checked
        ? [...(prev[selectedRole] || []), permissionId]
        : (prev[selectedRole] || []).filter(id => id !== permissionId)
    }));
  };

  const handleSave = async () => {
    if (!selectedRole) return;
    
    setSaving(true);
    try {
      await api.put(`/permissions/roles/${selectedRole}`, {
        permissionIds: rolePermissions[selectedRole] || []
      });
      message.success('Permissions mises à jour avec succès');
    } catch (error) {
      message.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const getResourceColor = (resource: string) => {
    const colors: Record<string, string> = {
      clients: 'blue',
      products: 'green',
      orders: 'orange',
      sales: 'cyan',
      suppliers: 'purple',
      pricing: 'magenta',
      stock: 'geekblue',
      settings: 'red'
    };
    return colors[resource] || 'default';
  };

  // Regrouper les permissions par ressource
  const groupedPermissions = permissions.reduce((acc, perm) => {
    if (!acc[perm.resource]) acc[perm.resource] = [];
    acc[perm.resource].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  const columns = [
    {
      title: 'Module',
      dataIndex: 'resource',
      key: 'resource',
      width: 150,
      render: (resource: string) => (
        <Tag color={getResourceColor(resource)}>{resource.toUpperCase()}</Tag>
      )
    },
    {
      title: 'Permission',
      dataIndex: 'action',
      key: 'action',
      width: 120,
      render: (action: string) => {
        const actionLabels: Record<string, string> = {
          read: '📖 Lecture',
          write: '✏️ Écriture',
          delete: '🗑️ Suppression',
          confirm: '✅ Confirmation'
        };
        return actionLabels[action] || action;
      }
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description'
    },
    {
      title: 'Autorisé',
      key: 'allowed',
      width: 100,
      render: (_: any, record: Permission) => (
        <Checkbox
          checked={selectedRole ? (rolePermissions[selectedRole] || []).includes(record.id) : false}
          onChange={(e) => handlePermissionChange(record.id, e.target.checked)}
        />
      )
    }
  ];

  return (
    <Card
      title="Gestion des permissions"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
            Actualiser
          </Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
            Enregistrer
          </Button>
        </Space>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <Space>
          <span style={{ fontWeight: 'bold' }}>Rôle :</span>
          {roles.map(role => (
            <Button
              key={role.id}
              type={selectedRole === role.id ? 'primary' : 'default'}
              onClick={() => setSelectedRole(role.id)}
            >
              {role.name === 'admin' ? '👑 Admin' : role.name === 'optician' ? '👓 Opticien' : '💰 Caissier'}
            </Button>
          ))}
        </Space>
      </div>

      <Spin spinning={loading}>
        <Table
          columns={columns}
          dataSource={permissions}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Spin>
    </Card>
  );
};

export default PermissionsManager;