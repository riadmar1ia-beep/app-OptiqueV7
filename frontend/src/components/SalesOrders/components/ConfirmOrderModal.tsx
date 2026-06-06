// frontend/src/components/SalesOrders/components/ConfirmOrderModal.tsx
import React, { useState, useEffect } from 'react';
import { Modal, Descriptions, Divider, Select, Alert, message, Space, Tag } from 'antd';
import { ExperimentOutlined, ShopOutlined } from '@ant-design/icons';
import { globalOrderService, supplierService, documentService } from '../../../services/api';
import { pdf } from '@react-pdf/renderer';

const { Option } = Select;

const parseMetadata = (value: any) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
};

// ✅ Fonction pour normaliser les données des verres
const normalizeEyeData = (eyeData: any) => {
  if (!eyeData) return null;
  
  // Chercher les données dans plusieurs formats possibles
  const lensConfig = eyeData.lens_config || eyeData;
  
  return {
    type: eyeData.type || lensConfig.type || '-',
    index: eyeData.index || lensConfig.index || '-',
    material: eyeData.material || lensConfig.material || '-',
    prescription: eyeData.prescription || lensConfig.prescription || null,
    coatings: eyeData.coatings || lensConfig.coatings || [],
    coatings_detail: eyeData.coatings_detail || lensConfig.coatings_detail || [],
    tint: eyeData.tint || lensConfig.tint || null,
    price: eyeData.price || lensConfig.price || 0
  };
};

// ✅ Fonction pour construire les données complètes des verres
const buildLensData = (item: any) => {
  const metadata = item.metadata || {};
  
  // Extraire les données des yeux depuis plusieurs formats possibles
  const right_eye_raw = metadata.right_eye || metadata.od || metadata.right;
  const left_eye_raw = metadata.left_eye || metadata.og || metadata.left;
  
  // Si les données sont dans lens_config
  const lensConfig = metadata.lens_config || {};
  
  return {
    right_eye: normalizeEyeData(right_eye_raw) || normalizeEyeData(lensConfig.right_eye),
    left_eye: normalizeEyeData(left_eye_raw) || normalizeEyeData(lensConfig.left_eye),
    mounting: metadata.mounting || metadata.mounting_params || {
      pupillary_distance: metadata.pupillary_distance || 0,
      mounting_height: metadata.mounting_height || 0,
      vertex_distance: metadata.vertex_distance || 12,
      pantoscopic_angle: metadata.pantoscopic_angle || 0,
      frame_wrap: metadata.frame_wrap || 0
    },
    description: item.description || '',
    quantity: item.quantity || 1,
    unit_price_cents: item.unit_price_cents || 0,
    total_cents: item.total_cents || 0
  };
};

interface ConfirmOrderModalProps {
  open: boolean;
  order: any;
  onClose: () => void;
  onSuccess: () => void;
}

const ConfirmOrderModal: React.FC<ConfirmOrderModalProps> = ({ 
  open, 
  order, 
  onClose, 
  onSuccess 
}) => {
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [orderItems, setOrderItems] = useState<any[]>([]);

  // Charger les fournisseurs et les items de la commande
  useEffect(() => {
    const fetchData = async () => {
      if (open && order) {
        try {
          const [suppliersRes, itemsRes] = await Promise.all([
            supplierService.getAll(),
            globalOrderService.getOpticalById(order.id)
          ]);
          
          setSuppliers(suppliersRes.data.data);
          if (suppliersRes.data.data.length > 0) {
            setSelectedSupplier(suppliersRes.data.data[0].id);
          }
          
          // Récupérer uniquement les verres
          const items = itemsRes.data.data.items || [];
          const lensItems = items.filter((item: any) => 
            item.item_type === 'lens' || 
            item.line_type === 'optical_job' ||
            (() => {
              const metadata = parseMetadata(item.metadata);
              return !!(metadata.right_eye || metadata.left_eye || metadata.lens_config || metadata.mounting);
            })()
          );
          
          // Construire les données complètes des verres
          const enrichedItems = lensItems.map((item: any) => {
            const parsedMeta = parseMetadata(item.metadata);
            return {
              ...item,
              metadata: parsedMeta,
              lens_data: buildLensData({ ...item, metadata: parsedMeta })
            };
          });
          
          setOrderItems(enrichedItems);
        } catch (error) {
          console.error('Erreur chargement données:', error);
        }
      }
    };
    
    fetchData();
  }, [open, order]);

  // Impression du bon de commande laboratoire (avec génération PDF complète)
const printLabOrder = async (supplierOrderId: string) => {
  try {
    console.log('🖨️ Impression bon fournisseur pour ID:', supplierOrderId);
    
    // Récupérer les données du bon de commande depuis l'API
    const response = await documentService.getSupplierOrderData(supplierOrderId);
    
    console.log('📄 Données reçues de l\'API:', response.data);
    
    const { data, settings } = response.data;
    
    // ✅ Normaliser complètement les données pour le PDF
    const normalizedData = {
      order_number: data.order_number || data.order_id,
      date: data.date || new Date().toLocaleDateString('fr-FR'),
      client_name: data.client_name || order?.customer_name || 'Client',
      supplier_name: data.supplier_name || suppliers.find(s => s.id === selectedSupplier)?.name || 'Laboratoire',
      
      // ✅ Récupérer les données depuis right_eye (transformé par le backend)
      right_eye: data.right_eye ? {
        type: data.right_eye.type || '-',
        index: data.right_eye.index || '-',
        material: data.right_eye.material || '-',
        prescription: data.right_eye.prescription ? {
          sphere: data.right_eye.prescription.sphere || 0,
          cylinder: data.right_eye.prescription.cylinder || 0,
          axis: data.right_eye.prescription.axis || null,
          addition: data.right_eye.prescription.addition || null,
          prism: data.right_eye.prescription.prism || null,
          prism_base: data.right_eye.prescription.prism_base || null
        } : null,
        coatings: data.right_eye.coatings || [],
        coatings_detail: data.right_eye.coatings_detail || [],
        tint: data.right_eye.tint || null
      } : null,
      
      // ✅ Récupérer les données depuis left_eye (transformé par le backend)
      left_eye: data.left_eye ? {
        type: data.left_eye.type || '-',
        index: data.left_eye.index || '-',
        material: data.left_eye.material || '-',
        prescription: data.left_eye.prescription ? {
          sphere: data.left_eye.prescription.sphere || 0,
          cylinder: data.left_eye.prescription.cylinder || 0,
          axis: data.left_eye.prescription.axis || null,
          addition: data.left_eye.prescription.addition || null,
          prism: data.left_eye.prescription.prism || null,
          prism_base: data.left_eye.prescription.prism_base || null
        } : null,
        coatings: data.left_eye.coatings || [],
        coatings_detail: data.left_eye.coatings_detail || [],
        tint: data.left_eye.tint || null
      } : null,
      
      // ✅ Paramètres de montage
      mounting: data.mounting || {
        pupillary_distance: data.pupillary_distance || 0,
        mounting_height: data.mounting_height || 0,
        vertex_distance: data.vertex_distance || 12,
        pantoscopic_angle: data.pantoscopic_angle || 0,
        frame_wrap: data.frame_wrap || 0
      },
      notes: data.notes || ''
    };
    
    console.log('📦 Données normalisées pour le PDF:', JSON.stringify(normalizedData, null, 2));
    
    // Générer le PDF avec react-pdf
    const { default: LabOrderPDF } = await import('../../Documents/PDF/LabOrderPDF');
    const pdfComponent = <LabOrderPDF data={normalizedData} settings={settings} />;
    
    const blob = await pdf(pdfComponent).toBlob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    URL.revokeObjectURL(url);
    
    console.log('✅ Bon de commande généré avec succès');
    
  } catch (error) {
    console.error('❌ Erreur génération bon fournisseur:', error);
    message.warning('Le bon de commande fournisseur sera disponible dans la liste des commandes');
  }
};
  const handleConfirm = async () => {
    if (!order) return;
    if (!selectedSupplier) {
      message.error('Veuillez sélectionner un fournisseur par défaut pour les verres');
      return;
    }
    
    // Vérifier qu'il y a des verres à commander
    if (orderItems.length === 0) {
      message.error('Cette commande ne contient pas de verres à commander');
      return;
    }
    
    setConfirmLoading(true);
    try {
      console.log('📝 Début confirmation commande:', order.id);
      
      // 1. Mettre à jour le statut de la commande en 'pending'
      await globalOrderService.updateStatus(order.id, 'pending');
      console.log('✅ Statut mis à jour: pending');
      
      // 2. Créer le bon de commande fournisseur avec TOUTES les données des verres
      const supplierOrderData = {
        sales_order_id: order.id,
        supplier_id: selectedSupplier,
        items: orderItems.map((item: any) => ({
          id: item.id,
          type: item.item_type,
          description: item.description,
          quantity: item.quantity,
          unit_price_cents: item.unit_price_cents,
          total_cents: item.total_cents,
          metadata: {
            ...item.metadata,
            // ✅ Inclure les données normalisées des verres
            right_eye: item.lens_data?.right_eye,
            left_eye: item.lens_data?.left_eye,
            mounting: item.lens_data?.mounting
          }
        })),
        notes: `Commande laboratoire - Verres optiques pour client ${order.customer_name}`
      };
      
      console.log('📦 Création commande fournisseur avec données:', JSON.stringify(supplierOrderData, null, 2));
      
      const response = await globalOrderService.createSupplierOrder(supplierOrderData);
      console.log('✅ Commande fournisseur créée:', response.data);
      
      message.success(`Commande confirmée - Statut: En attente fournisseur`);
      
      // ✅ CORRECTION : L'ID est dans response.data.data.id
const supplierOrderId = response.data?.data?.id;
if (supplierOrderId) {
  console.log('🖨️ Impression du bon de commande pour ID:', supplierOrderId);
  // ✅ Pas besoin de setTimeout, la commande est déjà en base
  await printLabOrder(supplierOrderId);
  message.info(`Bon de commande fournisseur généré pour ${orderItems.length} verre(s)`);
}      
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('❌ Erreur confirmation:', error);
      message.error(error.response?.data?.error || 'Erreur lors de la confirmation');
    } finally {
      setConfirmLoading(false);
    }
  };

  if (!order) return null;

  // Séparer les verres des autres articles pour l'affichage
  const hasLenses = orderItems.length > 0;

  return (
    <Modal
      title="Confirmation de la commande"
      open={open}
      onCancel={onClose}
      onOk={handleConfirm}
      confirmLoading={confirmLoading}
      okText="Confirmer la commande"
      cancelText="Annuler"
      width={600}
    >
      <Descriptions bordered size="small" column={1}>
        <Descriptions.Item label="Commande">{order.order_number}</Descriptions.Item>
        <Descriptions.Item label="Client">{order.customer_name}</Descriptions.Item>
        <Descriptions.Item label="Total TTC">{(order.total_ttc_cents || 0) / 100} DH</Descriptions.Item>
      </Descriptions>
      
      <Divider />
      
      {/* Résumé des articles à commander */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Articles concernés par la commande fournisseur :</div>
        
        {hasLenses ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            {orderItems.map((item, idx) => (
              <Tag key={idx} color="blue" icon={<ExperimentOutlined />}>
                Verre: {item.description} - Qté: {item.quantity}
              </Tag>
            ))}
            <Tag color="orange" icon={<ShopOutlined />}>
              ⚠️ Les montures et accessoires seront déstockés au moment de la livraison
            </Tag>
          </Space>
        ) : (
          <Alert
            title="Aucun verre détecté"
            description="Cette commande ne contient pas de verres optiques. La confirmation ne créera pas de commande fournisseur."
            type="warning"
            showIcon
          />
        )}
      </div>
      
      <Divider />
      
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
          Fournisseur pour les verres
        </label>
        <Select 
          value={selectedSupplier} 
          onChange={setSelectedSupplier}
          style={{ width: '100%' }}
          disabled={!hasLenses}
        >
          {suppliers.map(s => (
            <Option key={s.id} value={s.id}>{s.name}</Option>
          ))}
        </Select>
      </div>
      
      <Alert
        title="📋 Ce qui va se passer"
        description={
          <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
            <li>✅ La commande passe en statut "En attente fournisseur"</li>
            <li>✅ Un bon de commande fournisseur sera créé (uniquement pour les verres)</li>
            <li>✅ Le bon de commande sera imprimé automatiquement</li>
            <li>⏳ Les montures et accessoires restent réservés jusqu'à la livraison</li>
          </ul>
        }
        type="info"
        showIcon
      />
    </Modal>
  );
};

export default ConfirmOrderModal;