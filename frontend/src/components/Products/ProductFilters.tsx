// src/components/Products/ProductFilters.tsx
import React from 'react';
import { Row, Col, Select, Input, Slider, Button, Tag, Space } from 'antd';
import { SearchOutlined, ClearOutlined } from '@ant-design/icons';

const { Option } = Select;

// Définition des types - basés sur la table réelle
interface FilterState {
  search: string;
  frame_type: string | null;
  gender: string | null;
  material: string | null;
  frame_brand: string | null;  // ✅ Ajouté
  shape: string | null;         // ✅ Ajouté
  price_range: [number, number];
  tags: string[];
  is_featured: boolean | null;
}

interface ProductFiltersProps {
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: any) => void;
  onClearFilters: () => void;
  availableBrands?: string[];  // Liste des marques disponibles
  availableShapes?: string[];   // Liste des formes disponibles
}

const ProductFilters: React.FC<ProductFiltersProps> = ({ 
  filters, 
  onFilterChange, 
  onClearFilters,
  availableBrands = [],
  availableShapes = []
}) => {
  return (
    <div style={{ padding: '20px', background: '#fff', borderRadius: 8, marginBottom: 20 }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={8}>
          <Input
            placeholder="Recherche par nom, référence, SKU..."
            prefix={<SearchOutlined />}
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            allowClear
          />
        </Col>
        
        <Col xs={12} sm={6} md={4}>
          <Select
            placeholder="Type de monture"
            style={{ width: '100%' }}
            value={filters.frame_type}
            onChange={(value) => onFilterChange('frame_type', value)}
            allowClear
          >
            <Option value="full_rim">Pleine monture</Option>
            <Option value="semi_rimless">Semi-monture</Option>
            <Option value="rimless">Sans monture</Option>
          </Select>
        </Col>
        
        <Col xs={12} sm={6} md={4}>
          <Select
            placeholder="Genre"
            style={{ width: '100%' }}
            value={filters.gender}
            onChange={(value) => onFilterChange('gender', value)}
            allowClear
          >
            <Option value="homme">Homme</Option>
            <Option value="femme">Femme</Option>
            <Option value="unisex">Unisexe</Option>
            <Option value="enfant">Enfant</Option>
          </Select>
        </Col>
        
        <Col xs={12} sm={6} md={4}>
          <Select
            placeholder="Matériau"
            style={{ width: '100%' }}
            value={filters.material}
            onChange={(value) => onFilterChange('material', value)}
            allowClear
          >
            <Option value="acetate">Acétate</Option>
            <Option value="metal">Métal</Option>
            <Option value="titanium">Titane</Option>
            <Option value="plastic">Plastique</Option>
            <Option value="organic">Organique</Option>
          </Select>
        </Col>

        <Col xs={12} sm={6} md={4}>
          <Select
            placeholder="Marque"
            style={{ width: '100%' }}
            value={filters.frame_brand}
            onChange={(value) => onFilterChange('frame_brand', value)}
            allowClear
            showSearch
          >
            {availableBrands.map(brand => (
              <Option key={brand} value={brand}>{brand}</Option>
            ))}
          </Select>
        </Col>
      </Row>
      
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Select
            placeholder="Forme"
            style={{ width: '100%' }}
            value={filters.shape}
            onChange={(value) => onFilterChange('shape', value)}
            allowClear
          >
            {availableShapes.map(shape => (
              <Option key={shape} value={shape}>
                {shape === 'square' ? 'Carrée' : 
                 shape === 'round' ? 'Ronde' : 
                 shape === 'rectangle' ? 'Rectangulaire' : 
                 shape === 'oval' ? 'Ovale' : shape}
              </Option>
            ))}
          </Select>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Select
            placeholder="Mis en avant"
            style={{ width: '100%' }}
            value={filters.is_featured}
            onChange={(value) => onFilterChange('is_featured', value)}
            allowClear
          >
            <Option value={true}>Produits vedettes</Option>
            <Option value={false}>Produits non vedettes</Option>
          </Select>
        </Col>
        
        <Col xs={24} sm={12} md={12}>
          <div>
            <span>Prix: {filters.price_range[0]} - {filters.price_range[1]} DH</span>
            <Slider
              range
              min={0}
              max={20000}
              value={filters.price_range}
              onChange={(value: number[]) => onFilterChange('price_range', value)}
              tooltip={{ formatter: (value?: number) => `${value} DH` }}
            />
          </div>
        </Col>
      </Row>
      
      <Row style={{ marginTop: 16 }}>
        <Col span={24}>
          <Button icon={<ClearOutlined />} onClick={onClearFilters}>
            Effacer tous les filtres
          </Button>
        </Col>
      </Row>
      
      {/* Tags actifs */}
      {Object.entries(filters).some(([key, value]) => {
        if (key === 'price_range') return false;
        if (key === 'search') return value && value !== '';
        if (key === 'tags') return value && value.length > 0;
        return value !== null && value !== undefined && value !== '';
      }) && (
        <div style={{ marginTop: 16 }}>
          <Space wrap>
            {filters.frame_type && (
              <Tag closable onClose={() => onFilterChange('frame_type', null)}>
                Type: {filters.frame_type === 'full_rim' ? 'Pleine monture' : 
                       filters.frame_type === 'semi_rimless' ? 'Semi-monture' : 'Sans monture'}
              </Tag>
            )}
            {filters.gender && (
              <Tag closable onClose={() => onFilterChange('gender', null)}>
                Genre: {filters.gender}
              </Tag>
            )}
            {filters.material && (
              <Tag closable onClose={() => onFilterChange('material', null)}>
                Matériau: {filters.material}
              </Tag>
            )}
            {filters.frame_brand && (
              <Tag closable onClose={() => onFilterChange('frame_brand', null)}>
                Marque: {filters.frame_brand}
              </Tag>
            )}
            {filters.shape && (
              <Tag closable onClose={() => onFilterChange('shape', null)}>
                Forme: {filters.shape}
              </Tag>
            )}
            {filters.search && (
              <Tag closable onClose={() => onFilterChange('search', '')}>
                Recherche: {filters.search}
              </Tag>
            )}
            {filters.is_featured !== null && (
              <Tag closable onClose={() => onFilterChange('is_featured', null)}>
                {filters.is_featured ? 'Vedette' : 'Non vedette'}
              </Tag>
            )}
          </Space>
        </div>
      )}
    </div>
  );
};

export default ProductFilters;