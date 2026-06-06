// frontend/src/components/Settings/CompanySettings.tsx
import React, { useState, useEffect } from 'react';
import { 
  Card, Form, Input, Button, message, Space, Divider, Tabs, 
  Row, Col, Alert, Upload, Spin, Image 
} from 'antd';
import { 
  SaveOutlined, BankOutlined, EnvironmentOutlined, 
  PhoneOutlined, MailOutlined, UploadOutlined, 
  GlobalOutlined, IdcardOutlined 
} from '@ant-design/icons';
import { settingsService } from '../../services/api';

const { TabPane } = Tabs;

const CompanySettings: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setFetchLoading(true);
    try {
      const res = await settingsService.getCompanySettings();
      setSettings(res.data.data);
      setLogoUrl(res.data.data?.logo_url || null);
      form.setFieldsValue(res.data.data);
    } catch (error) {
      console.error('Erreur:', error);
      message.error('Erreur chargement des paramètres');
    } finally {
      setFetchLoading(false);
    }
  };

  const handleSave = async (values: any) => {
    setLoading(true);
    try {
      await settingsService.updateCompanySettings(values);
      message.success('Paramètres enregistrés avec succès');
      loadSettings();
    } catch (error) {
      console.error('Erreur:', error);
      message.error('Erreur lors de l\'enregistrement');
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>Chargement des paramètres...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <Card 
        title={
          <Space>
            <BankOutlined style={{ color: '#1890ff' }} />
            <span>Paramètres de l'entreprise</span>
          </Space>
        }
        extra={
          <Button 
            type="primary" 
            icon={<SaveOutlined />} 
            onClick={() => form.submit()}
            loading={loading}
          >
            Enregistrer
          </Button>
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Tabs defaultActiveKey="info">
            {/* ==================== ONGLET INFORMATIONS ==================== */}
            <TabPane tab="🏢 Informations générales" key="info">
              <Row gutter={16}>
                <Col span={24}>
                  <Form.Item 
                    name="company_name" 
                    label="Nom de l'entreprise" 
                    rules={[{ required: true, message: 'Champ obligatoire' }]}
                  >
                    <Input prefix={<BankOutlined />} placeholder="MARZOUK OPTIQUE" size="large" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={24}>
                  <Form.Item name="address" label="Adresse">
                    <Input.TextArea 
                      rows={2} 
                      placeholder="N40 Rue 6, Haj Fatah – Casablanca" 
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="phone" label="Téléphone">
                    <Input prefix={<PhoneOutlined />} placeholder="05 22 90 00 42" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="email" label="Email">
                    <Input prefix={<MailOutlined />} placeholder="contact@marzouk-optique.ma" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="website" label="Site web">
                    <Input prefix={<GlobalOutlined />} placeholder="www.marzouk-optique.ma" />
                  </Form.Item>
                </Col>
              </Row>
            </TabPane>

            {/* ==================== ONGLET IDENTIFIANTS LÉGAUX ==================== */}
            <TabPane tab="📜 Identifiants légaux" key="legal">
              <Alert
                message="Informations légales obligatoires"
                description="Ces informations apparaîtront sur vos factures et documents officiels conformément à la loi marocaine."
                type="info"
                showIcon
                style={{ marginBottom: 24 }}
              />

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="rc" label="Registre de commerce (RC)">
                    <Input prefix={<IdcardOutlined />} placeholder="397194" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="if_number" label="Identifiant fiscal (IF)">
                    <Input placeholder="40416741" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="patente" label="Patente">
                    <Input placeholder="36265648" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="ice" label="ICE">
                    <Input placeholder="000819745000054" />
                  </Form.Item>
                </Col>
              </Row>
            </TabPane>

            {/* ==================== ONGLET PRÉFIXES DOCUMENTS ==================== */}
            <TabPane tab="📄 Préfixes documents" key="prefixes">
              <Alert
                message="Numérotation automatique"
                description="Les documents seront numérotés automatiquement au format: PREFIXE-ANNEE-NNNNN (ex: FACT-2026-00123)"
                type="info"
                showIcon
                style={{ marginBottom: 24 }}
              />

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="invoice_prefix" label="Préfixe facture" tooltip="Exemple: FACT-2026-00123">
                    <Input placeholder="FACT" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="credit_note_prefix" label="Préfixe avoir" tooltip="Exemple: AV-2026-00123">
                    <Input placeholder="AV" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="purchase_order_prefix" label="Préfixe commande fournisseur">
                    <Input placeholder="PO" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="quote_prefix" label="Préfixe devis">
                    <Input placeholder="DEV" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="delivery_note_prefix" label="Préfixe bon de livraison">
                    <Input placeholder="BL" />
                  </Form.Item>
                </Col>
              </Row>
            </TabPane>

            {/* ==================== ONGLET LOGO & APPARENCE ==================== */}
            <TabPane tab="🖼️ Logo & Apparence" key="appearance">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="logo_url" label="URL du logo">
                    <Input 
                      placeholder="https://exemple.com/logo.png" 
                      onChange={(e) => setLogoUrl(e.target.value)}
                    />
                  </Form.Item>
                  
                  <Form.Item label="Aperçu du logo">
                    {logoUrl ? (
                      <Image 
                        src={logoUrl} 
                        width={150} 
                        style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8 }}
                        fallback="https://via.placeholder.com/150?text=Logo"
                      />
                    ) : (
                      <div style={{ 
                        width: 150, 
                        height: 80, 
                        background: '#f5f5f5', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        border: '1px dashed #ccc',
                        borderRadius: 8
                      }}>
                        <span style={{ color: '#999' }}>Aucun logo</span>
                      </div>
                    )}
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Alert
                    message="Code barre sur les documents"
                    description="Un code barre unique sera automatiquement généré sur chaque document officiel (facture, avoir, bon de livraison) pour faciliter le scan et l'archivage."
                    type="success"
                    showIcon
                  />
                  <Divider />
                  <Alert
                    message="Format des numéros"
                    description="Les numéros de documents suivent le format: PREFIXE-ANNEE-NUMERO (5 chiffres). Exemple: FACT-2026-00123"
                    type="info"
                    showIcon
                  />
                </Col>
              </Row>
            </TabPane>
          </Tabs>

          <Divider />

          <div style={{ textAlign: 'right' }}>
            <Button 
              type="primary" 
              htmlType="submit" 
              icon={<SaveOutlined />} 
              loading={loading}
              size="large"
            >
              Enregistrer les modifications
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default CompanySettings;