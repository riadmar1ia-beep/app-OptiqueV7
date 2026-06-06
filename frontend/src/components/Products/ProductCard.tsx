// frontend/src/components/Products/ProductCard.tsx
import { Card, Badge, Image, Tag, Button, Space, Tooltip } from 'antd';
import { EyeOutlined, ShoppingCartOutlined, StarOutlined } from '@ant-design/icons';

interface ProductCardProps {
  product: any;
  onView: (product: any) => void;
  onAddToCart: (product: any) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onView, onAddToCart }) => {
  // Récupérer l'image principale depuis product_images (si disponible)
  const primaryImage = product.images?.find((img: any) => img.is_primary) || product.images?.[0];
  
  // ✅ Calcul du statut du stock basé sur current_stock (venant de core_stock_view)
  const getStockStatus = () => {
    const currentStock = product.current_stock ?? product.stock_quantity ?? 0;
    const minStock = product.min_stock ?? 0;
    
    if (currentStock <= 0) {
      return { color: 'red', text: 'Rupture', badgeColor: 'red' };
    }
    if (minStock > 0 && currentStock <= minStock) {
      return { color: 'orange', text: `Stock faible (${currentStock})`, badgeColor: 'orange' };
    }
    return { color: 'green', text: `${currentStock} en stock`, badgeColor: 'green' };
  };

  const stockStatus = getStockStatus();

  // Formatage des types de monture
  const getFrameTypeLabel = (frameType: string) => {
    switch (frameType) {
      case 'full_rim': return 'Pleine monture';
      case 'semi_rimless': return 'Semi-monture';
      case 'rimless': return 'Sans monture';
      default: return frameType;
    }
  };

  // Formatage du genre
  const getGenderLabel = (gender: string) => {
    switch (gender) {
      case 'homme': return 'Homme';
      case 'femme': return 'Femme';
      case 'unisex': return 'Unisexe';
      case 'enfant': return 'Enfant';
      default: return gender;
    }
  };

  return (
    <Card
      hoverable
      cover={
        <div style={{ position: 'relative', padding: '20px', background: '#f5f5f5', minHeight: 240 }}>
          {primaryImage ? (
            <Image
              src={primaryImage.image_url}
              alt={product.name}
              style={{ height: 200, objectFit: 'contain' }}
              preview={false}
              fallback="/placeholder-image.png"
            />
          ) : (
            <div style={{ 
              height: 200, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: '#999',
              fontSize: 14,
              background: '#fafafa'
            }}>
              🖼️ Pas d'image
            </div>
          )}
          
          {/* Badge produit vedette */}
          {product.is_featured && (
            <Tag 
              icon={<StarOutlined />} 
              color="gold" 
              style={{ position: 'absolute', top: 10, right: 10, zIndex: 1 }}
            >
              Vedette
            </Tag>
          )}
          
          {/* Badge de stock */}
          <Badge.Ribbon 
            text={stockStatus.text} 
            color={stockStatus.badgeColor}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
          />
        </div>
      }
      actions={[
        <Tooltip title="Voir les détails">
          <Button 
            type="text" 
            icon={<EyeOutlined />} 
            onClick={() => onView(product)}
            style={{ width: '100%' }}
          >
            Détails
          </Button>
        </Tooltip>,
        <Tooltip title={stockStatus.text === 'Rupture' ? 'Produit indisponible' : 'Ajouter au panier'}>
          <Button 
            type="text" 
            icon={<ShoppingCartOutlined />} 
            onClick={() => onAddToCart(product)}
            disabled={stockStatus.text === 'Rupture'}
            style={{ width: '100%' }}
          >
            Ajouter
          </Button>
        </Tooltip>
      ]}
    >
      <Card.Meta
        title={
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            <span style={{ fontSize: '16px', fontWeight: 'bold', lineHeight: 1.2 }}>
              {product.name}
            </span>
            <span style={{ fontSize: '11px', color: '#999' }}>
              Ref: {product.reference || product.sku || '-'}
            </span>
            {product.frame_brand && (
              <span style={{ fontSize: '11px', color: '#666' }}>
                Marque: {product.frame_brand}
              </span>
            )}
          </Space>
        }
        description={
          <div style={{ marginTop: 8 }}>
            {/* Tags des caractéristiques */}
            <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {product.frame_type && (
                <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>
                  {getFrameTypeLabel(product.frame_type)}
                </Tag>
              )}
              {product.material && (
                <Tag color="cyan" style={{ fontSize: 11, margin: 0 }}>
                  {product.material}
                </Tag>
              )}
              {product.gender && (
                <Tag color="purple" style={{ fontSize: 11, margin: 0 }}>
                  {getGenderLabel(product.gender)}
                </Tag>
              )}
              {product.frame_color && (
                <Tag color="default" style={{ fontSize: 11, margin: 0 }}>
                  🎨 {product.frame_color}
                </Tag>
              )}
              {product.shape && (
                <Tag color="geekblue" style={{ fontSize: 11, margin: 0 }}>
                  {product.shape === 'square' ? 'Carrée' :
                   product.shape === 'round' ? 'Ronde' :
                   product.shape === 'rectangle' ? 'Rectangulaire' :
                   product.shape === 'oval' ? 'Ovale' : product.shape}
                </Tag>
              )}
            </div>
            
            {/* Prix */}
            <div style={{ 
              fontSize: '20px', 
              color: '#ff4d4f', 
              fontWeight: 'bold',
              borderTop: '1px solid #f0f0f0',
              paddingTop: 8,
              marginTop: 4
            }}>
              {(product.price_cents / 100).toFixed(2)} DH
            </div>
            
            {/* Prix d'achat (si disponible et différent) */}
            {product.purchase_price_cents && product.purchase_price_cents !== product.price_cents && (
              <div style={{ fontSize: '11px', color: '#999', textDecoration: 'line-through' }}>
                Achat: {(product.purchase_price_cents / 100).toFixed(2)} DH
              </div>
            )}
          </div>
        }
      />
    </Card>
  );
};

export default ProductCard;