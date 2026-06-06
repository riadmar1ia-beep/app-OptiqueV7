// QualityControlModal.tsx - Version corrigée
import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, Checkbox, Alert, Divider, Typography, Row, Col, Card, Tag, message, Table } from 'antd';
import { WarningOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface QualityControlModalProps {
  visible: boolean;
  orderId: string;
  orderDetails: any;
  onClose: () => void;
  onValidate: (orderId: string, notes: string) => void;
  onDispute: (orderId: string, issues: any[], notes: string) => void;
}

const QualityControlModal: React.FC<QualityControlModalProps> = ({
  visible,
  orderId,
  orderDetails,
  onClose,
  onValidate,
  onDispute
}) => {
  const [form] = Form.useForm();
  const [selectedIssues, setSelectedIssues] = useState<any[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isDisputing, setIsDisputing] = useState(false);

  // 🔍 Détection automatique du type (verres ou produits)
  const detectType = (): 'lenses' | 'products' => {
    if (!orderDetails) return 'products';
    
    if (orderDetails.right_eye_config || orderDetails.left_eye_config) {
      return 'lenses';
    }
    
    if (orderDetails.source_type === 'purchase_order') {
      return 'products';
    }
    
    if (orderDetails.items && orderDetails.items.length > 0) {
      const firstItem = orderDetails.items[0];
      if (firstItem && (firstItem.type || firstItem.index || firstItem.material)) {
        return 'lenses';
      }
    }
    
    return 'products';
  };
  
  const type = detectType();

  // Problèmes pour les verres optiques
  const lensIssues = [
    { value: 'cracked', label: 'Verre cassé', color: 'red', icon: '🔴' },
    { value: 'wrong_power', label: 'Mauvaise puissance', color: 'orange', icon: '⚠️' },
    { value: 'wrong_index', label: 'Mauvais indice', color: 'orange', icon: '⚠️' },
    { value: 'wrong_coating', label: 'Mauvais traitement', color: 'orange', icon: '⚠️' },
    { value: 'wrong_axis', label: 'Mauvais axe', color: 'orange', icon: '⚠️' },
    { value: 'scratched', label: 'Rayé', color: 'red', icon: '🔴' },
    { value: 'missing', label: 'Manquant', color: 'red', icon: '🔴' },
  ];

  // Problèmes pour les montures et accessoires
  const productIssues = [
    { value: 'damaged_frame', label: 'Monture endommagée', color: 'red', icon: '🔴' },
    { value: 'scratched', label: 'Rayé', color: 'red', icon: '🔴' },
    { value: 'wrong_color', label: 'Mauvaise couleur', color: 'orange', icon: '⚠️' },
    { value: 'wrong_size', label: 'Mauvaise taille', color: 'orange', icon: '⚠️' },
    { value: 'missing_parts', label: 'Pièces manquantes', color: 'orange', icon: '⚠️' },
    { value: 'defective', label: 'Défaut de fabrication', color: 'red', icon: '🔴' },
    { value: 'wrong_model', label: 'Mauvais modèle', color: 'orange', icon: '⚠️' },
    { value: 'missing', label: 'Article manquant', color: 'red', icon: '🔴' },
  ];

  const issueTypes = type === 'lenses' ? lensIssues : productIssues;

  // Réinitialisation quand le modal se ferme
  useEffect(() => {
    if (!visible) {
      setSelectedIssues([]);
      form.resetFields();
      setIsValidating(false);
      setIsDisputing(false);
    }
  }, [visible, form]);

  // Validation avec confirmation
  const handleValidate = () => {
    Modal.confirm({
      title: '✅ Validation du contrôle qualité',
      content: 'Confirmez-vous que tous les articles sont conformes et qu\'il n\'y a aucun problème ?',
      okText: '✅ Oui, tout est conforme',
      cancelText: '❌ Annuler',
      onOk: async () => {
        setIsValidating(true);
        const notes = form.getFieldValue('validation_notes');
        await onValidate(orderId, notes);
        setIsValidating(false);
        onClose();
      }
    });
  };

  // Litige avec confirmation et liste des problèmes
  const handleDispute = () => {
    if (selectedIssues.length === 0) {
      message.warning('Veuillez sélectionner au moins un problème à signaler');
      return;
    }
    
    Modal.confirm({
      title: '⚠️ Confirmation du litige',
      content: (
        <div>
          <p>Vous allez signaler <strong style={{ color: '#ff4d4f' }}>{selectedIssues.length}</strong> problème(s) :</p>
          <ul style={{ paddingLeft: 16, marginTop: 8 }}>
            {selectedIssues.map((issue, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <Tag color="red" style={{ marginRight: 8 }}>🔴</Tag>
                {issue.description}
              </li>
            ))}
          </ul>
          <Divider style={{ margin: '12px 0' }} />
          <p style={{ color: '#ff4d4f', fontWeight: 'bold', marginTop: 8 }}>
            ⚠️ Cette action est irréversible. Un litige sera ouvert et la commande devra être traitée.
          </p>
        </div>
      ),
      okText: '⚠️ Oui, signaler le litige',
      cancelText: '❌ Non, annuler',
      okButtonProps: { danger: true },
      onOk: async () => {
        setIsDisputing(true);
        const notes = form.getFieldValue('dispute_notes');
        await onDispute(orderId, selectedIssues, notes);
        setIsDisputing(false);
        onClose();
      },
      onCancel: () => {
        message.info('Signalement du litige annulé');
      }
    });
  };

  // ✅ Version corrigée avec fonctionnel setState pour éviter les stale updates
  const toggleIssue = (issue: any) => {
    setSelectedIssues(prev => {
      const exists = prev.find(i => i.issue_type === issue.value);
      
      if (exists) {
        return prev.filter(i => i.issue_type !== issue.value);
      }
      
      return [
        ...prev,
        {
          item_type: type === 'lenses' ? 'lens' : 'product',
          issue_type: issue.value,
          description: issue.label,
          quantity: 1,
        }
      ];
    });
  };

  return (
    <Modal
      forceRender  // ✅ Ajouté pour éviter le warning useForm
      title={type === 'lenses' ? '🔍 Contrôle qualité - Verres optiques' : '🔍 Contrôle qualité - Montures/Accessoires'}
      open={visible}
      onCancel={() => {
        setSelectedIssues([]);
        form.resetFields();
        onClose();
      }}
      footer={null}
      width={700}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        title="Contrôle qualité obligatoire"
        description="Veuillez vérifier les articles reçus avant de valider la réception."
        style={{ marginBottom: 16 }}
      />

      <Divider>Articles reçus</Divider>

      {type === 'lenses' ? (
        // Affichage pour les verres
        <>
          {orderDetails?.right_eye_config && (
            <Card size="small" style={{ marginBottom: 16 }}>
              <Text strong>👁️ Œil Droit (OD)</Text>
              <div style={{ marginLeft: 16, marginTop: 8 }}>
                <Text>Type: {orderDetails.right_eye_config.type}</Text><br />
                <Text>Indice: {orderDetails.right_eye_config.index}</Text><br />
                <Text>Matériau: {orderDetails.right_eye_config.material}</Text><br />
                <Text>Traitements: {orderDetails.right_eye_config.coatings?.join(', ') || 'Aucun'}</Text>
              </div>
            </Card>
          )}
          {orderDetails?.left_eye_config && (
            <Card size="small" style={{ marginBottom: 16 }}>
              <Text strong>👁️ Œil Gauche (OG)</Text>
              <div style={{ marginLeft: 16, marginTop: 8 }}>
                <Text>Type: {orderDetails.left_eye_config.type}</Text><br />
                <Text>Indice: {orderDetails.left_eye_config.index}</Text><br />
                <Text>Matériau: {orderDetails.left_eye_config.material}</Text><br />
                <Text>Traitements: {orderDetails.left_eye_config.coatings?.join(', ') || 'Aucun'}</Text>
              </div>
            </Card>
          )}
        </>
      ) : (
        // Affichage pour les montures/accessoires
        <Card size="small" style={{ marginBottom: 16 }}>
          <Text strong>📦 Articles commandés</Text>
          <Table
            dataSource={orderDetails?.items || []}
            rowKey="id"
            pagination={false}
            size="small"
            columns={[
              { title: 'Produit', dataIndex: 'name', key: 'name', render: (text: string, record: any) => record.name || record.product_name || '-' },
              { title: 'Référence', dataIndex: 'reference', key: 'reference', width: 120, render: (text: string) => text || '-' },
              { title: 'Qté', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'center' },
            ]}
          />
        </Card>
      )}

      <Divider>Conformité</Divider>

      <Form form={form} layout="vertical">
        <Form.Item label="Problèmes constatés">
          <Row gutter={[8, 8]}>
            {issueTypes.map(issue => (
              <Col span={12} key={issue.value}>
                <Checkbox 
                  onChange={() => toggleIssue(issue)}
                  checked={selectedIssues.some(i => i.issue_type === issue.value)}
                >
                  <Tag color={issue.color}>{issue.icon} {issue.label}</Tag>
                </Checkbox>
              </Col>
            ))}
          </Row>
        </Form.Item>

        {/* ✅ Affichage conditionnel des champs de notes */}
        {selectedIssues.length > 0 ? (
          <Form.Item
            name="dispute_notes"
            label="Description du litige"
          >
            <Input.TextArea 
              rows={3} 
              placeholder="Décrivez les problèmes constatés en détail..."
            />
          </Form.Item>
        ) : (
          <Form.Item
            name="validation_notes"
            label="Notes de contrôle"
          >
            <Input.TextArea 
              rows={2} 
              placeholder="Notes optionnelles sur le contrôle qualité..."
            />
          </Form.Item>
        )}

        <Divider />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={() => {
            setSelectedIssues([]);
            form.resetFields();
            onClose();
          }}>
            Annuler
          </Button>
          {selectedIssues.length > 0 ? (
            <Button 
              danger 
              icon={<WarningOutlined />} 
              onClick={handleDispute}
              loading={isDisputing}
            >
              ⚠️ Signaler {selectedIssues.length} litige(s)
            </Button>
          ) : (
            <Button 
              type="primary" 
              icon={<CheckCircleOutlined />} 
              onClick={handleValidate}
              loading={isValidating}
            >
              ✅ Valider - Tout est conforme
            </Button>
          )}
        </div>
      </Form>
    </Modal>
  );
};

export default QualityControlModal;