// frontend/src/components/Supplier/BarcodeScanner.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Input, Button, Card, Table, Tag, message, Space, Typography, Progress, Alert, Modal } from 'antd';
import { 
  BarcodeOutlined, 
  CheckOutlined, 
  DeleteOutlined, 
  ShoppingCartOutlined,
  SoundOutlined,
  ReloadOutlined,
  EyeOutlined
} from '@ant-design/icons';
import { productService } from '../../services/api';

const { Text } = Typography;

interface ScannedItem {
  id: string;
  barcode: string;
  reference: string;
  name: string;
  type: string;
  expected_quantity: number;
  scanned_count: number;
  scanned_at: Date;
}

interface ExpectedItem {
  product_id: string;
  reference: string;
  name: string;
  barcode: string;
  type: string;
  expected_quantity: number;
}

interface BarcodeScannerProps {
  expectedItems: ExpectedItem[];
  onComplete: (scannedItems: ScannedItem[]) => void;
  onCancel: () => void;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ 
  expectedItems, 
  onComplete, 
  onCancel 
}) => {
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [currentBarcode, setCurrentBarcode] = useState('');
  const [scanning, setScanning] = useState(true);
  const [lastScan, setLastScan] = useState<{ name: string; success: boolean } | null>(null);
  const inputRef = useRef<any>(null);

  // Filtrer les articles scannables (montures et accessoires uniquement)
  const scannableItems = expectedItems.filter(item => 
    item.type === 'frame' || item.type === 'accessory' || item.type === 'monture'
  );
  
  const nonScannableItems = expectedItems.filter(item => 
    item.type === 'lens' || item.type === 'verre'
  );

  // Focus automatique sur l'input
  useEffect(() => {
    if (scanning && inputRef.current) {
      inputRef.current.focus();
    }
  }, [scanning]);

  // Vérifier si tout est scanné
  const isComplete = scannableItems.length > 0 && 
    scannedItems.length === scannableItems.length && 
    scannedItems.every(item => item.scanned_count === item.expected_quantity);

  // Vérifier s'il n'y a rien à scanner
  const hasNothingToScan = scannableItems.length === 0;

  // Son de notification
  const playBeep = (success: boolean) => {
    try {
      const audio = new Audio();
      if (success) {
        audio.src = 'data:audio/wav;base64,U3RlYWx0aCBzb3VuZA==';
      } else {
        audio.src = 'data:audio/wav;base64,RXJyb3Igc291bmQ=';
      }
      audio.play().catch(() => {});
    } catch (e) {
      // Ignorer si le son ne fonctionne pas
    }
  };

  // Traitement du scan
  const handleScan = async (barcode: string) => {
    if (!barcode.trim()) return;

    // Chercher le produit dans la liste des articles scannables
    const expectedItem = scannableItems.find(item => item.barcode === barcode);
    
    if (!expectedItem) {
      message.error(`Produit non trouvé dans la commande: ${barcode}`);
      setLastScan({ name: barcode, success: false });
      playBeep(false);
      setCurrentBarcode('');
      return;
    }

    // Vérifier si déjà scanné
    const existingScanned = scannedItems.find(item => item.id === expectedItem.product_id);
    
    if (existingScanned) {
      if (existingScanned.scanned_count >= existingScanned.expected_quantity) {
        message.warning(`${expectedItem.name} déjà reçu en quantité suffisante`);
        setLastScan({ name: expectedItem.name, success: false });
        playBeep(false);
      } else {
        // Incrémenter le compteur
        setScannedItems(prev => prev.map(item => 
          item.id === expectedItem.product_id
            ? { ...item, scanned_count: item.scanned_count + 1, scanned_at: new Date() }
            : item
        ));
        message.success(`${expectedItem.name} scanné (${existingScanned.scanned_count + 1}/${expectedItem.expected_quantity})`);
        setLastScan({ name: expectedItem.name, success: true });
        playBeep(true);
      }
    } else {
      // Nouveau produit
      setScannedItems(prev => [...prev, {
        id: expectedItem.product_id,
        barcode: expectedItem.barcode,
        reference: expectedItem.reference,
        name: expectedItem.name,
        type: expectedItem.type,
        expected_quantity: expectedItem.expected_quantity,
        scanned_count: 1,
        scanned_at: new Date()
      }]);
      message.success(`${expectedItem.name} scanné (1/${expectedItem.expected_quantity})`);
      setLastScan({ name: expectedItem.name, success: true });
      playBeep(true);
    }

    setCurrentBarcode('');
  };

  // Supprimer un item scanné
  const removeScannedItem = (productId: string) => {
    Modal.confirm({
      title: 'Confirmation',
      content: 'Voulez-vous supprimer cet article des scannés ?',
      onOk: () => {
        setScannedItems(prev => prev.filter(item => item.id !== productId));
        message.info('Article retiré');
      }
    });
  };

  // Réinitialiser le scan
  const resetScan = () => {
    Modal.confirm({
      title: 'Réinitialiser le scan',
      content: 'Tous les articles scannés seront effacés. Continuer ?',
      onOk: () => {
        setScannedItems([]);
        message.info('Scan réinitialisé');
        if (inputRef.current) inputRef.current.focus();
      }
    });
  };

  // Valider et passer à la facture
  const handleComplete = () => {
    if (isComplete) {
      onComplete(scannedItems);
    } else if (hasNothingToScan) {
      // Pas d'articles à scanner, passer directement
      onComplete([]);
    } else {
      message.warning('Veuillez scanner tous les articles avant de continuer');
    }
  };

  // Calculer les statistiques
  const totalExpected = scannableItems.reduce((sum, item) => sum + item.expected_quantity, 0);
  const totalScanned = scannedItems.reduce((sum, item) => sum + item.scanned_count, 0);
  const progressPercent = totalExpected > 0 ? (totalScanned / totalExpected) * 100 : 100;

  // Colonnes du tableau
  const columns = [
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'frame' || type === 'monture' ? 'blue' : 'purple'}>
          {type === 'frame' || type === 'monture' ? '🕶️ Monture' : '📦 Accessoire'}
        </Tag>
      ),
    },
    {
      title: 'Code-barres',
      dataIndex: 'barcode',
      key: 'barcode',
      width: 150,
    },
    {
      title: 'Référence',
      dataIndex: 'reference',
      key: 'reference',
      width: 120,
    },
    {
      title: 'Nom',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Attendu',
      dataIndex: 'expected_quantity',
      key: 'expected_quantity',
      width: 80,
      align: 'center' as const,
    },
    {
      title: 'Scanné',
      dataIndex: 'scanned_count',
      key: 'scanned_count',
      width: 100,
      align: 'center' as const,
      render: (count: number, record: ScannedItem) => (
        <Tag color={count === record.expected_quantity ? 'green' : 'orange'}>
          {count} / {record.expected_quantity}
        </Tag>
      ),
    },
    {
      title: 'Statut',
      key: 'status',
      width: 100,
      render: (_: any, record: ScannedItem) => (
        record.scanned_count === record.expected_quantity 
          ? <Tag icon={<CheckOutlined />} color="success">Complet</Tag>
          : <Tag color="warning">En cours</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      render: (_: any, record: ScannedItem) => (
        <Button 
          danger 
          icon={<DeleteOutlined />} 
          size="small"
          onClick={() => removeScannedItem(record.id)}
        />
      ),
    },
  ];

  // Si pas d'articles à scanner, afficher un message et passer directement
  if (hasNothingToScan) {
    return (
      <Card 
        title={
          <Space>
            <BarcodeOutlined />
            <span>Scan des articles</span>
          </Space>
        }
      >
        <Alert
          message="Aucun article à scanner"
          description={
            <div>
              <p>Cette commande contient uniquement des verres optiques.</p>
              <p>Les verres sont fabriqués sur mesure, pas de scan nécessaire.</p>
              {nonScannableItems.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <Text strong>Articles dans cette commande :</Text>
                  <ul style={{ marginTop: 8 }}>
                    {nonScannableItems.map(item => (
                      <li key={item.product_id}>
                        👓 {item.name} x{item.expected_quantity}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onCancel}>
            Annuler
          </Button>
          <Button 
            type="primary" 
            icon={<CheckOutlined />}
            onClick={handleComplete}
          >
            Continuer vers la facture
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card 
      title={
        <Space>
          <BarcodeOutlined />
          <span>Scan des articles (Montures & Accessoires uniquement)</span>
        </Space>
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={resetScan} size="small">
            Réinitialiser
          </Button>
          <Button icon={<DeleteOutlined />} onClick={onCancel} size="small">
            Annuler
          </Button>
        </Space>
      }
    >
      {/* Message info sur les verres */}
      {nonScannableItems.length > 0 && (
        <Alert
          message="Verres optiques (scan non requis)"
          description={`${nonScannableItems.length} type(s) de verres dans cette commande. Les verres sont sur mesure, pas de scan nécessaire.`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Zone de scan */}
      <div style={{ marginBottom: 24 }}>
        <Alert
          message="Mode scan actif"
          description="Scannez chaque monture et accessoire avec votre lecteur de code-barres. Le son confirme la réception."
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
        
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <Text strong>Scanner un code-barres</Text>
            <Input
              ref={inputRef}
              placeholder="Scannez ici..."
              value={currentBarcode}
              onChange={(e) => setCurrentBarcode(e.target.value)}
              onPressEnter={() => handleScan(currentBarcode)}
              size="large"
              prefix={<BarcodeOutlined />}
              autoFocus
              disabled={isComplete}
            />
          </div>
          <Button 
            type="primary" 
            size="large"
            onClick={() => handleScan(currentBarcode)}
            disabled={isComplete || !currentBarcode}
          >
            Valider
          </Button>
        </div>
        
        {/* Dernier scan */}
        {lastScan && (
          <div style={{ marginTop: 12 }}>
            <Tag 
              color={lastScan.success ? 'green' : 'red'}
              icon={lastScan.success ? <CheckOutlined /> : <SoundOutlined />}
            >
              Dernier scan: {lastScan.name}
            </Tag>
          </div>
        )}
      </div>

      {/* Progression */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text strong>Progression de la réception</Text>
          <Text>{totalScanned} / {totalExpected} articles scannés</Text>
        </div>
        <Progress 
          percent={Math.round(progressPercent)} 
          status={isComplete ? 'success' : 'active'}
          strokeColor={isComplete ? '#52c41a' : '#1890ff'}
        />
      </div>

      {/* Tableau des articles à scanner */}
      <div style={{ marginBottom: 16 }}>
        <Text strong>Articles à scanner ({scannableItems.length})</Text>
        <Table
          columns={columns}
          dataSource={scannedItems}
          rowKey="id"
          pagination={false}
          size="small"
          locale={{ emptyText: 'Aucun article scanné pour le moment' }}
          style={{ marginTop: 8 }}
        />
      </div>

      {/* Articles non encore scannés */}
      {!isComplete && scannedItems.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Alert
            message="Articles non encore scannés"
            description={
              <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
                {scannableItems
                  .filter(expected => {
                    const scanned = scannedItems.find(s => s.id === expected.product_id);
                    const scannedCount = scanned?.scanned_count || 0;
                    return scannedCount < expected.expected_quantity;
                  })
                  .map(missing => (
                    <li key={missing.product_id}>
                      {missing.name} - Manque {missing.expected_quantity - (scannedItems.find(s => s.id === missing.product_id)?.scanned_count || 0)}
                    </li>
                  ))
                }
              </ul>
            }
            type="warning"
            showIcon
          />
        </div>
      )}

      {/* Bouton de validation finale */}
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
        <Button 
          type="primary" 
          size="large"
          icon={<CheckOutlined />}
          disabled={!isComplete && scannableItems.length > 0}
          onClick={handleComplete}
        >
          {isComplete 
            ? '✅ Continuer vers la facture' 
            : `⏳ En attente de ${totalExpected - totalScanned} article(s)`}
        </Button>
      </div>
    </Card>
  );
};

export default BarcodeScanner;