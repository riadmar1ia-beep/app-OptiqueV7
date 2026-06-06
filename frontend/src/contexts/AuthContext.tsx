// src/contexts/AuthContext.tsx
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import api from '../services/api';
import { authService } from '../services/api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  role: 'admin' | 'optician' | 'cashier';
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  hasPermission: (permission: string) => boolean;
  hasRole: (roles: string | string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

// Définition des permissions par rôle
const rolePermissions: Record<string, string[]> = {
  admin: ['*'], // Accès total
  optician: [
    // Clients
    'clients.read', 'clients.write', 'clients.delete',
    // Produits
    'products.read', 'products.write', 'products.delete',
    // Prescriptions
    'prescriptions.read', 'prescriptions.write', 'prescriptions.delete',
    // Commandes
    'orders.read', 'orders.write', 'orders.confirm', 'orders.delete',
    // Fournisseurs
    'suppliers.read', 'suppliers.write',
    // Prix et traitements
    'pricing.read', 'pricing.write',
    // Stock
    'stock.read', 'stock.write',
    // Ventes (lecture seule)
    'sales.read',
    // Statistiques
    'stats.read'
  ],
  cashier: [
    // Ventes (lecture et écriture)
    'sales.read', 'sales.write',
    // Clients (lecture seule)
    'clients.read',
    // Produits (lecture seule)
    'products.read',
    // Statistiques (lecture seule)
    'stats.read'
  ]
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

useEffect(() => {
  const initAuth = async () => {
    try {
      const token = localStorage.getItem('accessToken');

      if (!token) {
        setLoading(false);
        return;
      }

      const response = await authService.getMe();

      if (response.data?.data) {
        setUser(response.data.data);
      } else {
        throw new Error('Utilisateur invalide');
      }
    } catch (error) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      localStorage.removeItem('tenantId');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  initAuth();
}, []);


  const login = async (email: string, password: string): Promise<User> => {
    const response = await api.post('/auth/login', { email, password });
    const { accessToken, user: userData } = response.data.data;
    
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    
    return userData;
  };

  const logout = async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      localStorage.removeItem('tenantId');
      setUser(null);
    }
  };

  /**
   * Vérifie si l'utilisateur a une permission spécifique
   * @param permission - La permission à vérifier (ex: 'clients.read')
   * @returns true si l'utilisateur a la permission
   */
  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    
    const role = user.role;
    const permissions = rolePermissions[role] || [];
    
    // Admin a toutes les permissions
    if (permissions.includes('*')) return true;
    
    return permissions.includes(permission);
  };

  /**
   * Vérifie si l'utilisateur a un ou plusieurs rôles
   * @param roles - Rôle unique ou tableau de rôles
   * @returns true si l'utilisateur a au moins un des rôles
   */
  const hasRole = (roles: string | string[]): boolean => {
    if (!user) return false;
    
    const roleList = Array.isArray(roles) ? roles : [roles];
    return roleList.includes(user.role);
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        loading, 
        login, 
        logout, 
        isAuthenticated: !!user,
        hasPermission,
        hasRole
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};