// LensOrderFormEmbedded.tsx - Version complète avec prescription et montage
import React, { useState, useEffect } from 'react';
import {
  Select,
  Button,
  Card,
  Tabs,
  Checkbox,
  Divider,
  Row,
  Col,
  Typography,
  message,
  Radio,
  Tag,
  InputNumber,
  Slider,
  Space
} from 'antd';
import { EyeOutlined, ToolOutlined } from '@ant-design/icons';
import { pricingService, coatingService } from '../../services/api';

const { Option } = Select;
const { Text } = Typography;

interface LensOrderFormEmbeddedProps {
  onConfirm: (lensData: any) => void;
  onCancel: () => void;
  initialPrescription?: {
    od?: { sphere?: any; cylinder?: any; axis?: any; addition?: any; };
    og?: { sphere?: any; cylinder?: any; axis?: any; addition?: any; };
    pupillary_distance?: any;
  } | null;
  prescriptionLabel?: string;
}

interface TintData {
  color: string;
  gradient: boolean;
  intensity: number;
}

interface PrescriptionData {
  sphere: number;
  cylinder: number;
  axis: number | null;
  addition: number | null;
  prism: number | null;      
  prism_base: string | null;
}

interface MountingData {
  pupillary_distance: number;
  mounting_height: number;
  vertex_distance: number;
  pantoscopic_angle: number;
  frame_wrap: number;
}

const LensOrderFormEmbedded: React.FC<LensOrderFormEmbeddedProps> = ({
  onConfirm,
  onCancel,
  initialPrescription,
  prescriptionLabel
}) => {
  const toNum  = (v: any) => (v === null || v === undefined || v === '') ? null : Number(v);
  const toNumZ = (v: any) => Number(v) || 0;

  const [selectedEye, setSelectedEye] = useState<'both' | 'right' | 'left'>('both');
  
  // ─── Traitements et teinte PARTAGÉS (s'appliquent aux deux verres) ───
  const [sharedCoatings, setSharedCoatings] = useState<string[]>(['AR']);
  const [sharedTint, setSharedTint] = useState<TintData>({ color: 'none', gradient: false, intensity: 0 });

  // Configuration des verres (type, indice, matériau)
  const [rightLens, setRightLens] = useState({ type: 'progressive', index: '1.67', material: 'organic' });
  const [leftLens,  setLeftLens]  = useState({ type: 'progressive', index: '1.67', material: 'organic' });

  // Prescription — pré-remplie depuis l'ordonnance si fournie
  const [rightPrescription, setRightPrescription] = useState<PrescriptionData>({
    sphere:    toNumZ(initialPrescription?.od?.sphere),
    cylinder:  toNumZ(initialPrescription?.od?.cylinder),
    axis:      toNum(initialPrescription?.od?.axis),
    addition:  toNum(initialPrescription?.od?.addition),
    prism: null, prism_base: null
  });

  const [leftPrescription, setLeftPrescription] = useState<PrescriptionData>({
    sphere:    toNumZ(initialPrescription?.og?.sphere),
    cylinder:  toNumZ(initialPrescription?.og?.cylinder),
    axis:      toNum(initialPrescription?.og?.axis),
    addition:  toNum(initialPrescription?.og?.addition),
    prism: null, prism_base: null
  });

  // Paramètres de montage — PD pré-rempli si disponible
  const [mounting, setMounting] = useState<MountingData>({
    pupillary_distance: toNumZ(initialPrescription?.pupillary_distance),
    mounting_height:    0,
    vertex_distance:    12,
    pantoscopic_angle:  0,
    frame_wrap:         0
  });

  const [coatings, setCoatings] = useState<any[]>([]);
  const [sellingPrices, setSellingPrices] = useState<any>({});

  useEffect(() => {
    loadPrices();
    loadCoatings();
  }, []);

  const loadPrices = async () => {
    try {
      const response = await pricingService.getAll();
      const sellingMap: any = {};

      response.data.data.forEach((p: any) => {
        const key = `${p.lens_type}_${p.index_type}_${p.material}`;
        let sellingPrice = p.selling_price_cents;
        if (sellingPrice > 100) {
          sellingPrice = sellingPrice / 100;
        }
        sellingMap[key] = sellingPrice;
      });

      setSellingPrices(sellingMap);
    } catch (error) {
      console.error('Erreur chargement prix');
      message.error('Erreur chargement des prix');
    }
  };

  const loadCoatings = async () => {
    try {
      const response = await coatingService.getAll();
      const coatingsData = response.data.data.map((c: any) => {
        let price = c.selling_price_cents;
        if (price > 100) {
          price = price / 100;
        }
        return {
          ...c,
          selling_price_cents: price
        };
      });
      setCoatings(coatingsData);
    } catch (error) {
      console.error('Erreur chargement traitements');
      message.error('Erreur chargement des traitements');
    }
  };

  const getLensSellingPrice = (lens: any): number => {
    const key = `${lens.type}_${lens.index}_${lens.material}`;
    const basePrice = sellingPrices[key] || 0;
    // Ajouter le coût de la teinte
    const tintCost = lens.tint?.color !== 'none' ? (lens.tint?.intensity || 0) / 100 * 50 : 0;
    return basePrice + tintCost;
  };

  const getCoatingSellingPrice = (coatingCode: string): number => {
    const coating = coatings.find(c => c.coating_code === coatingCode);
    return coating?.selling_price_cents || 0;
  };

  const getTotalCoatingSellingPrice = (coatingsList: string[]): number => {
    return coatingsList.reduce((sum, c) => sum + getCoatingSellingPrice(c), 0);
  };

  const rightSellingTotal = (selectedEye === 'both' || selectedEye === 'right') 
    ? getLensSellingPrice(rightLens) + getTotalCoatingSellingPrice(sharedCoatings) 
    : 0;
    
  const leftSellingTotal = (selectedEye === 'both' || selectedEye === 'left') 
    ? getLensSellingPrice(leftLens) + getTotalCoatingSellingPrice(sharedCoatings) 
    : 0;
    
  const totalSelling = rightSellingTotal + leftSellingTotal;

  const lensTypes = [
    { value: 'unifocal', label: 'Unifocal' },
    { value: 'progressive', label: 'Progressif' },
    { value: 'bifocal', label: 'Bifocal' },
    { value: 'occupational', label: 'Occupational (Bureau)' },
  ];

  const indexes = [
    { value: '1.5', label: 'Standard (1.5)' },
    { value: '1.6', label: 'Mince (1.6)' },
    { value: '1.67', label: 'Très mince (1.67)' },
    { value: '1.74', label: 'Extrêmement mince (1.74)' },
  ];

  const materials = [
    { value: 'organic', label: 'Organique' },
    { value: 'mineral', label: 'Minéral' },
    { value: 'polycarbonate', label: 'Polycarbonate' },
    { value: 'trivex', label: 'Trivex' },
  ];

  const tintColors = [
    { value: 'none', label: 'Aucune teinte', color: '#d9d9d9' },
    { value: 'gray', label: 'Gris', color: '#808080' },
    { value: 'brown', label: 'Brun', color: '#8B4513' },
    { value: 'green', label: 'Vert', color: '#228B22' },
  ];

  const formatSigned = (value: number | null): string => {
    if (value === null || value === undefined) return '–';
    if (value > 0) return `+${value.toFixed(2)}`;
    return value.toFixed(2);
  };

  // Composant Prescription
 const PrescriptionForm: React.FC<{
  eye: string;
  value: PrescriptionData;
  onChange: (v: PrescriptionData) => void;
  lensType: string;
}> = ({ eye, value, onChange, lensType }) => {
  const showAddition = lensType === 'progressive' || lensType === 'bifocal';
  const hasCylinder = value.cylinder !== 0;
  const hasPrism = value.prism !== null && value.prism !== 0;
  const label = eye === 'right' ? 'OD' : 'OG';

  return (
    <Card size="small" title={`Prescription ${label}`} style={{ marginTop: 8, background: '#fafafa' }}>
      <Row gutter={16}>
        {/* Sphère */}
        <Col span={12}>
          <Text type="secondary">Sphère (SPH)</Text>
          <InputNumber
            value={value.sphere}
            onChange={(v) => onChange({ ...value, sphere: v ?? 0 })}
            step={0.25}
            min={-20}
            max={20}
            precision={2}
            style={{ width: '100%' }}
          />
        </Col>

        {/* Cylindre */}
        <Col span={12}>
          <Text type="secondary">Cylindre (CYL)</Text>
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
          />
        </Col>

        {/* Axe */}
        <Col span={12}>
          <Text type="secondary">Axe {hasCylinder && <span style={{ color: '#ff4d4f' }}>*</span>}</Text>
          <InputNumber
            value={value.axis}
            onChange={(v) => onChange({ ...value, axis: v ?? null })}
            step={1}
            min={0}
            max={180}
            disabled={!hasCylinder}
            addonAfter="°"
            style={{ width: '100%' }}
          />
        </Col>

        {/* Addition */}
        {showAddition && (
          <Col span={12}>
            <Text type="secondary">Addition *</Text>
            <InputNumber
              value={value.addition}
              onChange={(v) => onChange({ ...value, addition: v !== null ? Number(v) : null })}
              step={0.25}
              min={0.5}
              max={3.5}
              precision={2}
              style={{ width: '100%' }}
            />
          </Col>
        )}

        {/* ============================================ */}
        {/* ✅ AJOUTE LE PRISME ET LA BASE ICI */}
        {/* ============================================ */}
        
        {/* Prisme */}
        <Col span={12}>
          <Text type="secondary">Prisme (PRISM)</Text>
          <InputNumber
            value={value.prism}
            onChange={(v) => {
              const prism = v ?? null;
              if (prism === null || prism === 0) {
                onChange({ ...value, prism: null, prism_base: null });
              } else {
                onChange({ ...value, prism });
              }
            }}
            step={0.5}
            min={0}
            max={20}
            precision={1}
            style={{ width: '100%' }}
          />
          <Text type="secondary" style={{ fontSize: 10 }}>Correction prismatique (dioptries)</Text>
        </Col>

        {/* Base du Prisme */}
        <Col span={12}>
          <Text type="secondary">Base {hasPrism && <span style={{ color: '#ff4d4f' }}>*</span>}</Text>
          <Select
            value={value.prism_base}
            onChange={(v) => onChange({ ...value, prism_base: v })}
            style={{ width: '100%' }}
            placeholder="Sélectionner la direction"
            disabled={!hasPrism}
            allowClear
          >
            <Option value="up">Haut (Up)</Option>
            <Option value="down">Bas (Down)</Option>
            <Option value="in">Interne (In)</Option>
            <Option value="out">Externe (Out)</Option>
          </Select>
          <Text type="secondary" style={{ fontSize: 10 }}>Direction du prisme</Text>
        </Col>
      </Row>
    </Card>
  );
};

  // Composant Teinte
  const TintForm: React.FC<{ value: TintData; onChange: (v: TintData) => void }> = ({ value, onChange }) => {
    if (value.color === 'none') return null;

    return (
      <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
        <Text strong>Configuration de la teinte</Text>
        <Row gutter={16} style={{ marginTop: 8 }}>
          <Col span={12}>
            <Text type="secondary">Intensité</Text>
            <Slider
              min={0}
              max={100}
              value={value.intensity}
              onChange={(v) => onChange({ ...value, intensity: v })}
              marks={{ 0: '0%', 50: '50%', 100: '100%' }}
            />
          </Col>
          <Col span={12}>
            <Text type="secondary">Dégradé</Text>
            <Checkbox
              checked={value.gradient}
              onChange={(e) => onChange({ ...value, gradient: e.target.checked })}
            >
              Teinte dégradée
            </Checkbox>
          </Col>
        </Row>
      </div>
    );
  };

  // Composant LensConfigForm — type, indice, matériau + prescription uniquement
  // Traitements et teinte sont PARTAGÉS (voir SharedCoatingsForm ci-dessous)
  const LensConfigForm: React.FC<{
    eye: string;
    value: any;
    onChange: (v: any) => void;
    prescription: PrescriptionData;
    onPrescriptionChange: (v: PrescriptionData) => void;
    lensType: string;
    disabled?: boolean;
  }> = ({ eye, value, onChange, prescription, onPrescriptionChange, lensType, disabled }) => {
    return (
      <Card size="small" title={`Verre ${eye === 'right' ? 'Droit (OD)' : 'Gauche (OG)'}`} style={{ opacity: disabled ? 0.6 : 1 }}>
        <Row gutter={16}>
          <Col span={24}>
            <Text strong>Type de verre</Text>
            <Select
              value={value.type}
              onChange={(v) => onChange({ ...value, type: v })}
              style={{ width: '100%', marginTop: 8, marginBottom: 16 }}
              disabled={disabled}
            >
              {lensTypes.map(type => (
                <Option key={type.value} value={type.value}>{type.label}</Option>
              ))}
            </Select>
          </Col>

          <Col span={12}>
            <Text strong>Indice</Text>
            <Select
              value={value.index}
              onChange={(v) => onChange({ ...value, index: v })}
              style={{ width: '100%', marginTop: 8, marginBottom: 16 }}
              disabled={disabled}
            >
              {indexes.map(idx => (
                <Option key={idx.value} value={idx.value}>{idx.label}</Option>
              ))}
            </Select>
          </Col>

          <Col span={12}>
            <Text strong>Matériau</Text>
            <Select
              value={value.material}
              onChange={(v) => onChange({ ...value, material: v })}
              style={{ width: '100%', marginTop: 8, marginBottom: 16 }}
              disabled={disabled}
            >
              {materials.map(mat => (
                <Option key={mat.value} value={mat.value}>{mat.label}</Option>
              ))}
            </Select>
          </Col>
        </Row>

        <Divider />

        <PrescriptionForm
          eye={eye}
          value={prescription}
          onChange={onPrescriptionChange}
          lensType={lensType}
        />

        <Divider />

        <div style={{ textAlign: 'right' }}>
          <Text strong>
            Prix verre: {getLensSellingPrice(value).toFixed(2)} DH
          </Text>
        </div>
      </Card>
    );
  };

  // Composant traitements + teinte PARTAGÉS (s'appliquent aux deux verres)
  const SharedOptionsForm: React.FC = () => {
    const showTint = sharedTint?.color !== 'none';
    return (
      <Card 
        size="small" 
        title={<Space><span>🔗</span><Text strong>Traitements & Teinte</Text><Tag color="blue">Communs aux 2 verres</Tag></Space>}
        style={{ marginTop: 16 }}
      >
        <Row gutter={16}>
          <Col span={24}>
            <Text strong>Traitements</Text>
            <Checkbox.Group
              value={sharedCoatings}
              onChange={(v) => setSharedCoatings(v as string[])}
              style={{ width: '100%', marginTop: 8 }}
            >
              <Row gutter={[16, 8]}>
                {coatings.map(coating => (
                  <Col span={8} key={coating.coating_code}>
                    <Checkbox value={coating.coating_code}>
                      {coating.coating_name} (+{getCoatingSellingPrice(coating.coating_code).toFixed(0)} DH/verre)
                    </Checkbox>
                  </Col>
                ))}
              </Row>
            </Checkbox.Group>
          </Col>

          <Col span={24} style={{ marginTop: 16 }}>
            <Text strong>Teinte</Text>
            <Select
              value={sharedTint?.color || 'none'}
              onChange={(v) => setSharedTint({ ...sharedTint, color: v, intensity: v === 'none' ? 0 : (sharedTint.intensity || 50) })}
              style={{ width: '100%', marginTop: 8 }}
            >
              {tintColors.map(t => (
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
            <Col span={24} style={{ marginTop: 8 }}>
              <TintForm value={sharedTint} onChange={setSharedTint} />
            </Col>
          )}

          {(sharedCoatings.length > 0 || showTint) && (
            <Col span={24} style={{ marginTop: 8, textAlign: 'right' }}>
              <Text type="secondary">
                Traitements: +{getTotalCoatingSellingPrice(sharedCoatings).toFixed(2)} DH/verre
              </Text>
            </Col>
          )}
        </Row>
      </Card>
    );
  };

  // Composant Paramètres de montage
  const MountingForm: React.FC = () => (
    <Card size="small" title={<Space><ToolOutlined /> Paramètres de montage</Space>} style={{ marginTop: 16 }}>
      <Row gutter={16}>
        <Col span={12}>
          <Text type="secondary">Écart pupillaire (PD) - mm</Text>
          <InputNumber
            value={mounting.pupillary_distance}
            onChange={(v) => setMounting({ ...mounting, pupillary_distance: v ?? 0 })}
            step={0.5}
            min={0}
            max={40}
            precision={1}
            style={{ width: '100%' }}
          />
        </Col>
        <Col span={12}>
          <Text type="secondary">Hauteur de montage - mm</Text>
          <InputNumber
            value={mounting.mounting_height}
            onChange={(v) => setMounting({ ...mounting, mounting_height: v ?? 0 })}
            step={0.5}
            min={0}
            max={50}
            precision={1}
            style={{ width: '100%' }}
          />
        </Col>
        <Col span={12}>
          <Text type="secondary">Distance verre-œil - mm</Text>
          <InputNumber
            value={mounting.vertex_distance}
            onChange={(v) => setMounting({ ...mounting, vertex_distance: v ?? 12 })}
            step={1}
            min={8}
            max={20}
            style={{ width: '100%' }}
          />
        </Col>
        <Col span={12}>
          <Text type="secondary">Angle pantoscopique - degrés</Text>
          <InputNumber
            value={mounting.pantoscopic_angle}
            onChange={(v) => setMounting({ ...mounting, pantoscopic_angle: v ?? 0 })}
            step={1}
            min={-10}
            max={20}
            style={{ width: '100%' }}
          />
        </Col>
        <Col span={12}>
          <Text type="secondary">Galbe monture - degrés</Text>
          <InputNumber
            value={mounting.frame_wrap}
            onChange={(v) => setMounting({ ...mounting, frame_wrap: v ?? 0 })}
            step={1}
            min={0}
            max={15}
            style={{ width: '100%' }}
          />
        </Col>
      </Row>
    </Card>
  );

  const handleConfirm = () => {
    const coatings_detail = sharedCoatings.map(code => {
      const c = coatings.find((x: any) => x.coating_code === code);
      return c ? { code, name: c.coating_name, price: getCoatingSellingPrice(code) } : { code, name: code, price: 0 };
    });

    const buildEye = (lens: any, prescription: PrescriptionData, sellingTotal: number) => ({
      type:            lens.type,
      index:           lens.index,
      material:        lens.material,
      coatings:        sharedCoatings,
      coatings_detail,
      tint:            sharedTint,
      prescription,
      price:           sellingTotal,
      base_price:      getLensSellingPrice(lens),
      coatings_price:  getTotalCoatingSellingPrice(sharedCoatings),
    });

    onConfirm({
      right_eye: selectedEye !== 'left'
        ? buildEye(rightLens, rightPrescription, rightSellingTotal)
        : null,
      left_eye: selectedEye !== 'right'
        ? buildEye(leftLens, leftPrescription, leftSellingTotal)
        : null,
      mounting,
      total_price_cents: Math.round((rightSellingTotal + leftSellingTotal) * 100),
    });
  };

  return (
    <div>
      {/* Bandeau ordonnance pré-chargée */}
      {initialPrescription && (
        <div style={{
          background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8,
          padding: '8px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8
        }}>
          <span style={{ fontSize: 16 }}>📋</span>
          <div>
            <Text strong style={{ color: '#52c41a' }}>Ordonnance chargée automatiquement</Text>
            {prescriptionLabel && <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{prescriptionLabel}</Text>}
            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
              {(() => {
                const n = (v: any) => Number(v) || 0;
                const fmt = (v: any) => { const x = n(v); return (x >= 0 ? '+' : '') + x.toFixed(2); };
                return (
                  <>
                    OD: SPH {fmt(initialPrescription.od?.sphere)} CYL {fmt(initialPrescription.od?.cylinder)}
                    {initialPrescription.od?.axis != null && ` AXE ${n(initialPrescription.od.axis)}°`}
                    {initialPrescription.od?.addition != null && ` ADD +${n(initialPrescription.od.addition).toFixed(2)}`}
                    {'  |  '}
                    OG: SPH {fmt(initialPrescription.og?.sphere)} CYL {fmt(initialPrescription.og?.cylinder)}
                    {initialPrescription.og?.axis != null && ` AXE ${n(initialPrescription.og.axis)}°`}
                    {initialPrescription.og?.addition != null && ` ADD +${n(initialPrescription.og.addition).toFixed(2)}`}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {/* Sélection des yeux */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row align="middle">
          <Col span={8}>
            <Text strong style={{ fontSize: 16 }}>👓 Yeux à commander :</Text>
          </Col>
          <Col span={16}>
            <Radio.Group 
              value={selectedEye} 
              onChange={(e) => setSelectedEye(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              size="large"
            >
              <Radio.Button value="both">👁️ Les deux yeux</Radio.Button>
              <Radio.Button value="right">👁️ Droit uniquement (OD)</Radio.Button>
              <Radio.Button value="left">👁️ Gauche uniquement (OG)</Radio.Button>
            </Radio.Group>
          </Col>
        </Row>
      </Card>

      {/* Configuration des verres */}
      <Tabs
        defaultActiveKey="right"
        items={[
          {
            key: 'right',
            label: (
              <span>
                <EyeOutlined /> Oeil Droit (OD)
                {selectedEye === 'left' && <Tag color="orange" style={{ marginLeft: 8 }}>Non commandé</Tag>}
              </span>
            ),
            children: (
              <LensConfigForm
                eye="right"
                value={rightLens}
                onChange={setRightLens}
                prescription={rightPrescription}
                onPrescriptionChange={setRightPrescription}
                lensType={rightLens.type}
                disabled={selectedEye === 'left'}
              />
            ),
          },
          {
            key: 'left',
            label: (
              <span>
                <EyeOutlined /> Oeil Gauche (OG)
                {selectedEye === 'right' && <Tag color="orange" style={{ marginLeft: 8 }}>Non commandé</Tag>}
              </span>
            ),
            children: (
              <LensConfigForm
                eye="left"
                value={leftLens}
                onChange={setLeftLens}
                prescription={leftPrescription}
                onPrescriptionChange={setLeftPrescription}
                lensType={leftLens.type}
                disabled={selectedEye === 'right'}
              />
            ),
          },
        ]}
      />

      {/* Traitements & Teinte partagés */}
      <SharedOptionsForm />

      {/* Paramètres de montage */}
      <MountingForm />

      <Divider />

      <Card size="small" title="Récapitulatif">
        <Row gutter={16}>
          <Col span={8}>
            <Text>Verre droit:</Text>
            <br />
            <Text strong>{(selectedEye === 'left' ? 0 : rightSellingTotal).toFixed(2)} DH</Text>
            {selectedEye === 'left' && <Tag color="orange" style={{ marginLeft: 8 }}>Non commandé</Tag>}
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
              SPH: {formatSigned(rightPrescription.sphere)} | CYL: {formatSigned(rightPrescription.cylinder)}
              {rightPrescription.axis && <> | AXE: {rightPrescription.axis}°</>}
            </div>
          </Col>
          <Col span={8}>
            <Text>Verre gauche:</Text>
            <br />
            <Text strong>{(selectedEye === 'right' ? 0 : leftSellingTotal).toFixed(2)} DH</Text>
            {selectedEye === 'right' && <Tag color="orange" style={{ marginLeft: 8 }}>Non commandé</Tag>}
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
              SPH: {formatSigned(leftPrescription.sphere)} | CYL: {formatSigned(leftPrescription.cylinder)}
              {leftPrescription.axis && <> | AXE: {leftPrescription.axis}°</>}
            </div>
          </Col>
          <Col span={8}>
            <Text>Total:</Text>
            <br />
            <Text strong style={{ fontSize: 20, color: '#1890ff' }}>
              {totalSelling.toFixed(2)} DH
            </Text>
          </Col>
        </Row>
        <Divider style={{ margin: '12px 0' }} />
        <div style={{ fontSize: 11, color: '#666' }}>
          <Text type="secondary">PD: {mounting.pupillary_distance} mm | Hauteur: {mounting.mounting_height} mm | Distance: {mounting.vertex_distance} mm</Text>
        </div>
      </Card>

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Button onClick={onCancel}>
          Annuler
        </Button>
        <Button
          type="primary"
          onClick={handleConfirm}
          style={{ marginLeft: 8 }}
        >
          Ajouter à la commande
        </Button>
      </div>
    </div>
  );
};

export default LensOrderFormEmbedded;