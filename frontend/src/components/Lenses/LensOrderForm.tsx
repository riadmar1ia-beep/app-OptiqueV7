// frontend/src/components/LensOrderForm.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  InputNumber,
  Select,
  Button,
  Card,
  Row,
  Col,
  Typography,
  Divider,
  Alert,
  Tabs,
  Checkbox,
  message,
  Tag,
  Modal,
  Space,
  Badge,
  Collapse,
  Slider
} from 'antd';
import {
  ExclamationCircleFilled,
  WarningFilled,
  CheckCircleFilled,
  EyeOutlined,
  CloseCircleFilled,
  SettingOutlined,
  ToolOutlined,
  MedicineBoxOutlined
} from '@ant-design/icons';
import {
  globalOrderService,
  pricingService,
  coatingService,
  clientService
} from '../../services/api';

const { Option } = Select;
const { Panel } = Collapse;
const { Text } = Typography;

// =========================================================
// TYPES
// =========================================================

interface PrescriptionData {
  sphere: number;
  cylinder: number;
  axis: number | null;
  addition: number | null;
  prism: number | null;      
  prism_base: string | null;
}

interface MountingData {
  pupillary_distance: number;      // Écart pupillaire (PD) en mm
  mounting_height: number;         // Hauteur de montage en mm
  vertex_distance: number;         // Distance verre-œil en mm
  pantoscopic_angle: number;       // Angle pantoscopique en degrés
  frame_wrap: number;              // Galbe monture en degrés
}

interface LensConfigData {
  type: string;
  index: string;
  material: string;
  coatings: string[];
  tint: {
    color: string;
    gradient: boolean;
    intensity: number;
  };
}

interface LensState {
  type: string;
  index: string;
  material: string;
  coatings: string[];
  tint: {
    color: string;
    gradient: boolean;
    intensity: number;
  };
}

interface PrescriptionErrors {
  sphere: string;
  cylinder: string;
  axis: string;
  addition: string;
}

interface LensOrderFormProps {
  onConfirm?: (lensData: any) => void;
  onCancel?: () => void;
  clientId?: string;
  supplierId?: string;
}

// =========================================================
// CONSTANTES
// =========================================================

const LENS_TYPES = [
  { value: 'unifocal', label: 'Unifocal' },
  { value: 'progressive', label: 'Progressif' },
  { value: 'bifocal', label: 'Bifocal' },
  { value: 'occupational', label: 'Occupational (Bureau)' },
];

const INDEXES = [
  { value: '1.5', label: '1.50 Standard' },
  { value: '1.6', label: '1.60 Aminci' },
  { value: '1.67', label: '1.67 Très aminci' },
  { value: '1.74', label: '1.74 Ultra aminci' },
];

const MATERIALS = [
  { value: 'organic', label: 'Organique' },
  { value: 'mineral', label: 'Minéral' },
  { value: 'polycarbonate', label: 'Polycarbonate' },
  { value: 'trivex', label: 'Trivex' },
];

const TINT_COLORS = [
  { value: 'none', label: 'Aucune teinte', color: '#d9d9d9' },
  { value: 'gray', label: 'Gris', color: '#808080' },
  { value: 'brown', label: 'Brun', color: '#8B4513' },
  { value: 'green', label: 'Vert', color: '#228B22' },
];

const INITIAL_LENS: LensState = {
  type: 'progressive',
  index: '1.67',
  material: 'organic',
  coatings: ['AR'],
  tint: {
    color: 'none',
    gradient: false,
    intensity: 0,
  },
};

const INITIAL_PRESCRIPTION: PrescriptionData = {
  sphere: 0,
  cylinder: 0,
  axis: null,
  addition: null,
   prism: null,
  prism_base: null,
};

const INITIAL_MOUNTING: MountingData = {
  pupillary_distance: 0,
  mounting_height: 0,
  vertex_distance: 12,
  pantoscopic_angle: 0,
  frame_wrap: 0,
};

const EMPTY_ERRORS: PrescriptionErrors = {
  sphere: '',
  cylinder: '',
  axis: '',
  addition: '',
};

// =========================================================
// VALIDATION METIER
// =========================================================

const validateSphere = (value: number): string => {
  if (value < -20 || value > 20)
    return 'SPH doit être entre −20,00 et +20,00';
  return '';
};

const validateCylinder = (value: number): string => {
  if (value > 0 || value < -6)
    return 'CYL doit être entre −6,00 et 0,00 (notation négative uniquement)';
  return '';
};

const validateAxis = (cylinder: number, axis: number | null): string => {
  if (cylinder !== 0) {
    if (axis === null || axis === undefined || axis < 0 || axis > 180)
      return "AXE obligatoire lorsqu'un cylindre est renseigné (0° à 180°)";
  }
  return '';
};

const validateAddition = (value: number | null, type: string, eye: string): string => {
  if (type === 'progressive' || type === 'bifocal') {
    if (value === null || value === undefined)
      return `Addition ${eye} obligatoire pour un verre ${type === 'progressive' ? 'progressif' : 'bifocal'}`;
    if (value < 0.5 || value > 3.5)
      return `Addition ${eye} hors limites — valeur entre +0,50 et +3,50`;
  }
  return '';
};

const computeErrors = (prescription: PrescriptionData, lensType: string, eye: string): PrescriptionErrors => ({
  sphere: validateSphere(prescription.sphere),
  cylinder: validateCylinder(prescription.cylinder),
  axis: validateAxis(prescription.cylinder, prescription.axis),
  addition: validateAddition(prescription.addition, lensType, eye),
});

// =========================================================
// UTILITAIRES
// =========================================================

const formatSigned = (value: number | null): string => {
  if (value === null || value === undefined) return '–';
  if (value > 0) return `+${value.toFixed(2)}`;
  return value.toFixed(2);
};

// =========================================================
// SOUS-COMPOSANT — PRESCRIPTION (VALEURS OPTIQUES)
// =========================================================

interface PrescriptionFormProps {
  eye: 'right' | 'left';
  value: PrescriptionData;
  onChange: (v: PrescriptionData) => void;
  errors: PrescriptionErrors;
  lensType: string;
}

const PrescriptionForm: React.FC<PrescriptionFormProps> = ({
  eye,
  value,
  onChange,
  errors,
  lensType,
}) => {
  const showAddition = lensType === 'progressive' || lensType === 'bifocal';
  const hasCylinder = value.cylinder !== 0;
  const label = eye === 'right' ? 'Œil Droit (OD)' : 'Œil Gauche (OG)';

  return (
    <Card
      size="small"
      title={
        <Space>
          <EyeOutlined />
          {label}
        </Space>
      }
      style={{ marginTop: 8, background: '#fafafa', borderRadius: 8 }}
    >
      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Text type="secondary" style={{ fontSize: 12 }}>Sphère (SPH)</Text>
          <InputNumber
            value={value.sphere}
            onChange={(v) => onChange({ ...value, sphere: v ?? 0 })}
            step={0.25}
            min={-20}
            max={20}
            precision={2}
            style={{ width: '100%' }}
            status={errors.sphere ? 'error' : ''}
          />
          {errors.sphere && <Text type="danger" style={{ fontSize: 11 }}>{errors.sphere}</Text>}
        </Col>

        <Col span={12}>
          <Text type="secondary" style={{ fontSize: 12 }}>Cylindre (CYL)</Text>
          <InputNumber
            value={value.cylinder}
            onChange={(v) => {
              const cyl = v ?? 0;
              onChange(cyl === 0 ? { ...value, cylinder: 0, axis: null } : { ...value, cylinder: cyl });
            }}
            step={0.25}
            min={-6}
            max={0}
            precision={2}
            style={{ width: '100%' }}
            status={errors.cylinder ? 'error' : ''}
          />
          {errors.cylinder && <Text type="danger" style={{ fontSize: 11 }}>{errors.cylinder}</Text>}
        </Col>

        <Col span={12}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Axe{hasCylinder && <span style={{ color: '#ff4d4f' }}> *</span>}
          </Text>
          <InputNumber
            value={value.axis}
            onChange={(v) => onChange({ ...value, axis: v ?? null })}
            step={1}
            min={0}
            max={180}
            disabled={!hasCylinder}
            addonAfter="°"
            style={{ width: '100%' }}
            status={errors.axis ? 'error' : ''}
          />
          {errors.axis && <Text type="danger" style={{ fontSize: 11 }}>{errors.axis}</Text>}
        </Col>

        {showAddition && (
          <Col span={12}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Addition<span style={{ color: '#ff4d4f' }}> *</span>
            </Text>
            <InputNumber
              value={value.addition}
              onChange={(v) => onChange({ ...value, addition: v !== null ? Number(v) : null })}
              step={0.25}
              min={0.5}
              max={3.5}
              precision={2}
              style={{ width: '100%' }}
              status={errors.addition ? 'error' : ''}
            />
            {errors.addition && <Text type="danger" style={{ fontSize: 11 }}>{errors.addition}</Text>}
          </Col>
        )}
      </Row>
    </Card>
  );
};

// =========================================================
// SOUS-COMPOSANT — PARAMÈTRES DE MONTAGE
// =========================================================

interface MountingFormProps {
  value: MountingData;
  onChange: (v: MountingData) => void;
}

const MountingForm: React.FC<MountingFormProps> = ({ value, onChange }) => {
  return (
    <Card
      size="small"
      title={
        <Space>
          <ToolOutlined />
          Paramètres de montage
        </Space>
      }
      style={{ marginTop: 16, background: '#fafafa', borderRadius: 8 }}
    >
      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Text type="secondary" style={{ fontSize: 12 }}>Écart pupillaire (PD) - mm</Text>
          <InputNumber
            value={value.pupillary_distance}
            onChange={(v) => onChange({ ...value, pupillary_distance: v ?? 0 })}
            step={0.5}
            min={0}
            max={40}
            precision={1}
            style={{ width: '100%' }}
          />
        </Col>

        <Col span={12}>
          <Text type="secondary" style={{ fontSize: 12 }}>Hauteur de montage - mm</Text>
          <InputNumber
            value={value.mounting_height}
            onChange={(v) => onChange({ ...value, mounting_height: v ?? 0 })}
            step={0.5}
            min={0}
            max={50}
            precision={1}
            style={{ width: '100%' }}
          />
        </Col>

        <Col span={12}>
          <Text type="secondary" style={{ fontSize: 12 }}>Distance verre-œil - mm</Text>
          <InputNumber
            value={value.vertex_distance}
            onChange={(v) => onChange({ ...value, vertex_distance: v ?? 12 })}
            step={1}
            min={8}
            max={20}
            precision={1}
            style={{ width: '100%' }}
          />
        </Col>

        <Col span={12}>
          <Text type="secondary" style={{ fontSize: 12 }}>Angle pantoscopique - degrés</Text>
          <InputNumber
            value={value.pantoscopic_angle}
            onChange={(v) => onChange({ ...value, pantoscopic_angle: v ?? 0 })}
            step={1}
            min={-10}
            max={20}
            style={{ width: '100%' }}
          />
        </Col>

        <Col span={12}>
          <Text type="secondary" style={{ fontSize: 12 }}>Galbe monture - degrés</Text>
          <InputNumber
            value={value.frame_wrap}
            onChange={(v) => onChange({ ...value, frame_wrap: v ?? 0 })}
            step={1}
            min={0}
            max={15}
            style={{ width: '100%' }}
          />
        </Col>
      </Row>
    </Card>
  );
};

// =========================================================
// SOUS-COMPOSANT — TEINTE
// =========================================================

interface TintFormProps {
  value: { color: string; gradient: boolean; intensity: number };
  onChange: (v: any) => void;
}

const TintForm: React.FC<TintFormProps> = ({ value, onChange }) => {
  if (value.color === 'none') return null;

  return (
    <div style={{ marginTop: 16 }}>
      <Text strong>Configuration de la teinte</Text>
      <div style={{ marginTop: 8, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Text type="secondary">Intensité</Text>
            <Slider
              min={0}
              max={100}
              value={value.intensity}
              onChange={(v) => onChange({ ...value, intensity: v })}
              marks={{ 0: '0%', 25: '25%', 50: '50%', 75: '75%', 100: '100%' }}
            />
          </Col>
          <Col span={12}>
            <Text type="secondary">Dégradé</Text>
            <div>
              <Checkbox
                checked={value.gradient}
                onChange={(e) => onChange({ ...value, gradient: e.target.checked })}
              >
                Teinte dégradée (plus foncé en haut)
              </Checkbox>
            </div>
          </Col>
        </Row>
      </div>
    </div>
  );
};

// =========================================================
// SOUS-COMPOSANT — CONFIGURATION VERRE
// =========================================================

interface LensConfigFormProps {
  value: LensState;
  onChange: (v: LensState) => void;
  coatings: any[];
  getLensPrice: (lens: LensState) => number;
  getCoatingPrice: (code: string) => number;
}

const LensConfigForm: React.FC<LensConfigFormProps> = ({
  value,
  onChange,
  coatings,
  getLensPrice,
  getCoatingPrice,
}) => {
  const lensPrice = getLensPrice(value) + value.coatings.reduce((sum, c) => sum + getCoatingPrice(c), 0);
  const showTint = value.tint.color !== 'none';

  return (
    <Card size="small" style={{ borderRadius: 8 }}>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Text strong>Type de verre</Text>
          <Select
            value={value.type}
            onChange={(v) => onChange({ ...value, type: v })}
            style={{ width: '100%', marginTop: 6 }}
          >
            {LENS_TYPES.map(t => (
              <Option key={t.value} value={t.value}>{t.label}</Option>
            ))}
          </Select>
        </Col>

        <Col span={12}>
          <Text strong>Indice</Text>
          <Select
            value={value.index}
            onChange={(v) => onChange({ ...value, index: v })}
            style={{ width: '100%', marginTop: 6 }}
          >
            {INDEXES.map(i => (
              <Option key={i.value} value={i.value}>{i.label}</Option>
            ))}
          </Select>
        </Col>

        <Col span={12}>
          <Text strong>Matériau</Text>
          <Select
            value={value.material}
            onChange={(v) => onChange({ ...value, material: v })}
            style={{ width: '100%', marginTop: 6 }}
          >
            {MATERIALS.map(m => (
              <Option key={m.value} value={m.value}>{m.label}</Option>
            ))}
          </Select>
        </Col>

        <Col span={24}>
          <Text strong>Traitements</Text>
          <Checkbox.Group
            value={value.coatings}
            onChange={(v) => onChange({ ...value, coatings: v as string[] })}
            style={{ width: '100%', marginTop: 10 }}
          >
            <Row gutter={[8, 8]}>
              {coatings.map(coating => (
                <Col span={8} key={coating.coating_code}>
                  <Checkbox value={coating.coating_code}>
                    <span style={{ fontSize: 12 }}>{coating.coating_name}</span>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      +{getCoatingPrice(coating.coating_code).toFixed(0)} DH
                    </Text>
                  </Checkbox>
                </Col>
              ))}
            </Row>
          </Checkbox.Group>
        </Col>

        <Col span={24}>
          <Text strong>Teinte</Text>
          <Select
            value={value.tint.color}
            onChange={(v) => onChange({ ...value, tint: { ...value.tint, color: v, intensity: v === 'none' ? 0 : 50 } })}
            style={{ width: '100%', marginTop: 6 }}
          >
            {TINT_COLORS.map(t => (
              <Option key={t.value} value={t.value}>
                <Space>
                  <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: t.color, border: '1px solid #ccc' }} />
                  {t.label}
                </Space>
              </Option>
            ))}
          </Select>
        </Col>

        {showTint && (
          <Col span={24}>
            <TintForm
              value={value.tint}
              onChange={(tint) => onChange({ ...value, tint })}
            />
          </Col>
        )}
      </Row>

      <Divider style={{ margin: '16px 0' }} />

      <div style={{ textAlign: 'right' }}>
        <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
          Sous-total
        </Text>
        <Text strong style={{ fontSize: 18, color: '#1677ff' }}>
          {lensPrice.toFixed(2)} DH
        </Text>
      </div>
    </Card>
  );
};

// =========================================================
// COMPOSANT PRINCIPAL
// =========================================================

const LensOrderForm: React.FC<LensOrderFormProps> = ({
  onConfirm,
  onCancel,
  clientId,
}) => {
  const [loading, setLoading] = useState(false);
  const [coatings, setCoatings] = useState<any[]>([]);
  const [basePrices, setBasePrices] = useState<any>({});
  const [activeTab, setActiveTab] = useState('right');

  // Configurations
  const [rightLens, setRightLens] = useState<LensState>(INITIAL_LENS);
  const [leftLens, setLeftLens] = useState<LensState>(INITIAL_LENS);
  const [rightPrescription, setRightPrescription] = useState<PrescriptionData>(INITIAL_PRESCRIPTION);
  const [leftPrescription, setLeftPrescription] = useState<PrescriptionData>(INITIAL_PRESCRIPTION);
  const [mounting, setMounting] = useState<MountingData>(INITIAL_MOUNTING);

  // Erreurs
  const [rightErrors, setRightErrors] = useState<PrescriptionErrors>(EMPTY_ERRORS);
  const [leftErrors, setLeftErrors] = useState<PrescriptionErrors>(EMPTY_ERRORS);

  // =========================================================
  // CHARGEMENT
  // =========================================================

  useEffect(() => {
    loadPrices();
    loadCoatings();
  }, []);

  const loadPrices = async () => {
    try {
      const response = await pricingService.getAll();
      const map: any = {};
      response.data.data.forEach((p: any) => {
        const key = `${p.lens_type}_${p.index_type}_${p.material}`;
        const price = Number(p.selling_price_cents || 0) / 100;
        map[key] = price;
      });
      setBasePrices(map);
    } catch {
      message.error('Erreur lors du chargement des tarifs');
    }
  };

  const loadCoatings = async () => {
    try {
      const response = await coatingService.getAll();
      const data = response.data.data.map((c: any) => ({
        ...c,
        selling_price: Number(c.selling_price_cents || 0) / 100,
      }));
      setCoatings(data);
    } catch {
      message.error('Erreur lors du chargement des traitements');
    }
  };

  // =========================================================
  // PRIX
  // =========================================================

  const getLensPrice = useCallback((lens: LensState): number => {
    const key = `${lens.type}_${lens.index}_${lens.material}`;
    const basePrice = basePrices[key] || 0;
    // Ajouter le coût de la teinte si présente
    const tintCost = lens.tint.color !== 'none' ? (lens.tint.intensity / 100) * 50 : 0;
    return basePrice + tintCost;
  }, [basePrices]);

  const getCoatingPrice = useCallback((code: string): number => {
    const coating = coatings.find(c => c.coating_code === code);
    return coating?.selling_price || 0;
  }, [coatings]);

  // =========================================================
  // VALIDATION TEMPS REEL
  // =========================================================

  useEffect(() => {
    setRightErrors(computeErrors(rightPrescription, rightLens.type, 'OD'));
  }, [rightPrescription, rightLens.type]);

  useEffect(() => {
    setLeftErrors(computeErrors(leftPrescription, leftLens.type, 'OG'));
  }, [leftPrescription, leftLens.type]);

  const isFormValid = () =>
    Object.values(rightErrors).every(v => !v) &&
    Object.values(leftErrors).every(v => !v);

  // =========================================================
  // TOTAUX
  // =========================================================

  const rightTotal = getLensPrice(rightLens) + rightLens.coatings.reduce((sum, c) => sum + getCoatingPrice(c), 0);
  const leftTotal = getLensPrice(leftLens) + leftLens.coatings.reduce((sum, c) => sum + getCoatingPrice(c), 0);
  const total = rightTotal + leftTotal;

  // =========================================================
  // SOUMISSION
  // =========================================================

  const handleConfirm = async () => {
    if (!isFormValid()) {
      const allErrors: string[] = [];
      Object.values(rightErrors).forEach(e => { if (e) allErrors.push(`OD — ${e}`); });
      Object.values(leftErrors).forEach(e => { if (e) allErrors.push(`OG — ${e}`); });

      Modal.warning({
        title: 'Correction requise avant validation',
        icon: <WarningFilled style={{ color: '#faad14' }} />,
        content: (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {allErrors.map((e, i) => <li key={i} style={{ fontSize: 13 }}>{e}</li>)}
          </ul>
        ),
        okText: 'Corriger',
      });
      return;
    }

    const lensData = {
      right_eye: {
        ...rightLens,
        prescription: rightPrescription,
        price: rightTotal,
      },
      left_eye: {
        ...leftLens,
        prescription: leftPrescription,
        price: leftTotal,
      },
      mounting: mounting,
      total_price_cents: Math.round(total * 100),
    };

    if (onConfirm) {
      onConfirm(lensData);
      return;
    }

    if (!clientId) {
      message.error('Aucun client sélectionné');
      return;
    }

    setLoading(true);
    try {
      const orderData = {
        customer_name: 'Client',
        client_id: clientId,
        items: [
          {
            type: 'lens',
            eye: 'OD',
            description: `${rightLens.type} | ${rightLens.index} | ${rightLens.material}`,
            quantity: 1,
            unit_price_cents: Math.round(rightTotal * 100),
            total_cents: Math.round(rightTotal * 100),
            tva_rate: 20,
            metadata: {
              eye: 'OD',
              lens_config: rightLens,
              prescription: rightPrescription,
              mounting: mounting,
            },
          },
          {
            type: 'lens',
            eye: 'OG',
            description: `${leftLens.type} | ${leftLens.index} | ${leftLens.material}`,
            quantity: 1,
            unit_price_cents: Math.round(leftTotal * 100),
            total_cents: Math.round(leftTotal * 100),
            tva_rate: 20,
            metadata: {
              eye: 'OG',
              lens_config: leftLens,
              prescription: leftPrescription,
              mounting: mounting,
            },
          },
        ],
      };

      await globalOrderService.create(orderData);
      message.success('Commande créée avec succès');
      if (onCancel) onCancel();
    } catch (error: any) {
      console.error('Erreur:', error);
      message.error(error.response?.data?.error || 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // RÉSUMÉ DES ERREURS
  // =========================================================

  const errorSummary: string[] = [];
  Object.values(rightErrors).forEach(e => { if (e) errorSummary.push(`OD : ${e}`); });
  Object.values(leftErrors).forEach(e => { if (e) errorSummary.push(`OG : ${e}`); });

  // =========================================================
  // RENDU
  // =========================================================

  return (
    <div>
      {errorSummary.length > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningFilled />}
          style={{ marginBottom: 16, borderRadius: 8 }}
          message={
            <Text strong>{errorSummary.length} erreur(s) de saisie à corriger</Text>
          }
          description={
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {errorSummary.map((e, i) => <li key={i} style={{ fontSize: 12 }}>{e}</li>)}
            </ul>
          }
        />
      )}

      <Collapse defaultActiveKey={['right', 'left']}>
        <Panel
          header={
            <Space>
              <EyeOutlined />
              Œil Droit (OD)
              {Object.values(rightErrors).some(Boolean) && <Badge count={Object.values(rightErrors).filter(Boolean).length} color="#faad14" />}
            </Space>
          }
          key="right"
        >
          <LensConfigForm
            value={rightLens}
            onChange={setRightLens}
            coatings={coatings}
            getLensPrice={getLensPrice}
            getCoatingPrice={getCoatingPrice}
          />
          <PrescriptionForm
            eye="right"
            value={rightPrescription}
            onChange={setRightPrescription}
            errors={rightErrors}
            lensType={rightLens.type}
          />
        </Panel>

        <Panel
          header={
            <Space>
              <EyeOutlined />
              Œil Gauche (OG)
              {Object.values(leftErrors).some(Boolean) && <Badge count={Object.values(leftErrors).filter(Boolean).length} color="#faad14" />}
            </Space>
          }
          key="left"
        >
          <LensConfigForm
            value={leftLens}
            onChange={setLeftLens}
            coatings={coatings}
            getLensPrice={getLensPrice}
            getCoatingPrice={getCoatingPrice}
          />
          <PrescriptionForm
            eye="left"
            value={leftPrescription}
            onChange={setLeftPrescription}
            errors={leftErrors}
            lensType={leftLens.type}
          />
        </Panel>
      </Collapse>

      <MountingForm value={mounting} onChange={setMounting} />

      <Divider />

      <Card title="Récapitulatif commande" size="small">
        <Row gutter={16}>
          <Col span={12}>
            <Text strong>OD — Œil Droit</Text>
            <div style={{ marginTop: 8 }}>
              <Tag color="blue">SPH {formatSigned(rightPrescription.sphere)}</Tag>
              <Tag color="blue">CYL {formatSigned(rightPrescription.cylinder)}</Tag>
              {rightPrescription.axis && <Tag color="blue">AXE {rightPrescription.axis}°</Tag>}
              {rightPrescription.addition && <Tag color="green">ADD +{rightPrescription.addition}</Tag>}
            </div>
            <div style={{ marginTop: 8 }}>
              <Tag color="cyan">{rightLens.type}</Tag>
              <Tag color="cyan">{rightLens.index}</Tag>
              <Tag color="cyan">{rightLens.material}</Tag>
              {rightLens.coatings.map(c => <Tag key={c} color="purple">{c}</Tag>)}
            </div>
            <Text strong style={{ color: '#1677ff' }}>{rightTotal.toFixed(2)} DH</Text>
          </Col>

          <Col span={12}>
            <Text strong>OG — Œil Gauche</Text>
            <div style={{ marginTop: 8 }}>
              <Tag color="blue">SPH {formatSigned(leftPrescription.sphere)}</Tag>
              <Tag color="blue">CYL {formatSigned(leftPrescription.cylinder)}</Tag>
              {leftPrescription.axis && <Tag color="blue">AXE {leftPrescription.axis}°</Tag>}
              {leftPrescription.addition && <Tag color="green">ADD +{leftPrescription.addition}</Tag>}
            </div>
            <div style={{ marginTop: 8 }}>
              <Tag color="cyan">{leftLens.type}</Tag>
              <Tag color="cyan">{leftLens.index}</Tag>
              <Tag color="cyan">{leftLens.material}</Tag>
              {leftLens.coatings.map(c => <Tag key={c} color="purple">{c}</Tag>)}
            </div>
            <Text strong style={{ color: '#1677ff' }}>{leftTotal.toFixed(2)} DH</Text>
          </Col>
        </Row>

        <Divider />

        <div style={{ marginTop: 8 }}>
          <Text strong>Paramètres de montage</Text>
          <div>
            <Tag>PD: {mounting.pupillary_distance} mm</Tag>
            <Tag>Hauteur: {mounting.mounting_height} mm</Tag>
            <Tag>Distance verre-œil: {mounting.vertex_distance} mm</Tag>
            <Tag>Angle pantoscopique: {mounting.pantoscopic_angle}°</Tag>
            <Tag>Galbe: {mounting.frame_wrap}°</Tag>
          </div>
        </div>

        <Divider style={{ margin: '16px 0' }} />

        <div style={{ textAlign: 'right' }}>
          <Text strong style={{ fontSize: 22, color: '#1677ff' }}>
            TOTAL : {total.toFixed(2)} DH
          </Text>
        </div>
      </Card>

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {onCancel && <Button onClick={onCancel}>Annuler</Button>}
        <Button
          type="primary"
          onClick={handleConfirm}
          loading={loading}
          disabled={!isFormValid()}
          icon={<CheckCircleFilled />}
        >
          {onConfirm ? 'Ajouter à la commande' : 'Créer la commande'}
        </Button>
      </div>
    </div>
  );
};

export default LensOrderForm;